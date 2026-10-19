import { auditLogs, invites, loginAttempts, sessions, users, type Db, type Role, type User } from "@reorder/db";
import { and, count, eq, gt, isNotNull, isNull, ne, or } from "drizzle-orm";
import { decrypt, encrypt, randomToken, sha256 } from "./crypto";
import type { ProviderId, SsoIdentity } from "./oidc";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from "./totp";

export interface AuthConfig {
  appSecret: string;
  /** Only addresses at this domain can be invited, e.g. "amipi.com". Empty = any. */
  allowedDomain: string;
  inviteTtlHours?: number;
  /** Absolute session length. */
  sessionTtlHours?: number;
  /** Signed out after this long without activity. */
  idleHours?: number;
  /** Time allowed between password and authenticator code. */
  pendingMinutes?: number;
  maxFailures?: number;
  lockMinutes?: number;
  now?: () => Date;
}

export type AuthErrorCode =
  | "invalid_credentials"
  | "locked"
  | "invalid_code"
  | "invite_invalid"
  | "weak_password"
  | "domain_not_allowed"
  | "session_expired"
  | "last_admin"
  | "not_invited"
  | "account_mismatch"
  | "not_found";

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export type SignInMethod = "password" | ProviderId;

export type SafeUser = Pick<User, "id" | "email" | "name" | "role" | "totpEnabled" | "disabledAt" | "lastLoginAt" | "createdAt"> & {
  /** How this person has signed in so far. Empty until they first sign in. */
  signInMethods: SignInMethod[];
};

function methods(u: User): SignInMethod[] {
  const m: SignInMethod[] = [];
  if (u.microsoftSub) m.push("microsoft");
  if (u.googleSub) m.push("google");
  if (u.passwordHash) m.push("password");
  return m;
}

function safe(u: User): SafeUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    totpEnabled: u.totpEnabled,
    disabledAt: u.disabledAt,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    signInMethods: methods(u),
  };
}

/** Someone who has finished setting up some way to sign in. */
const hasSignIn = or(isNotNull(users.passwordHash), isNotNull(users.microsoftSub), isNotNull(users.googleSub));

const SUB_COLUMN = { microsoft: users.microsoftSub, google: users.googleSub } as const;
const SUB_FIELD = { microsoft: "microsoftSub", google: "googleSub" } as const;
const PROVIDER_LABEL: Record<ProviderId, string> = { microsoft: "Microsoft", google: "Google" };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hasAnySignIn(u: User): boolean {
  return !!(u.passwordHash || u.microsoftSub || u.googleSub);
}

const DUMMY_HASH = "scrypt$32768$8$1$c2FsdHNhbHRzYWx0c2FsdA$" + "A".repeat(86);

/** All sign-in and user-management rules. Pages call these; nothing else touches the auth tables. */
export class AuthService {
  private c: Required<AuthConfig>;

  constructor(
    private db: Db,
    config: AuthConfig,
  ) {
    this.c = {
      inviteTtlHours: 72,
      sessionTtlHours: 24 * 7,
      idleHours: 24,
      pendingMinutes: 10,
      maxFailures: 5,
      lockMinutes: 15,
      now: () => new Date(),
      ...config,
    };
  }

  private now() {
    return this.c.now();
  }
  private minutesAgo(m: number) {
    return new Date(this.now().getTime() - m * 60_000);
  }

  async audit(userId: string | null, action: string, detail?: string, campaignId?: string) {
    await this.db.insert(auditLogs).values({ userId, action, detail, campaignId, createdAt: this.now() });
  }

  // ---------- invites ----------

  /** Creates a one-time link for a new user (or a fresh link for an existing invite). */
  async createInvite(input: { email: string; role: Role; createdBy: string | null }): Promise<{ token: string; expiresAt: Date }> {
    const email = normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError("domain_not_allowed", "Enter a valid email address.");
    if (this.c.allowedDomain && !email.endsWith(`@${this.c.allowedDomain.toLowerCase()}`)) {
      throw new AuthError("domain_not_allowed", `Only @${this.c.allowedDomain} addresses can be invited.`);
    }
    const token = randomToken();
    const expiresAt = new Date(this.now().getTime() + this.c.inviteTtlHours * 3_600_000);
    await this.db.transaction(async (tx) => {
      // Older unused links for this address stop working.
      await tx.update(invites).set({ usedAt: this.now() }).where(and(eq(invites.email, email), isNull(invites.usedAt)));
      await tx.insert(invites).values({ email, role: input.role, tokenHash: sha256(token), expiresAt, createdBy: input.createdBy, createdAt: this.now() });
    });
    await this.audit(input.createdBy, "User invited", `${email} as ${input.role}`);
    return { token, expiresAt };
  }

  async getInvite(token: string) {
    const [row] = await this.db
      .select()
      .from(invites)
      .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.usedAt), gt(invites.expiresAt, this.now())));
    if (!row) return undefined;
    const [existing] = await this.db.select().from(users).where(eq(users.email, row.email));
    return { email: row.email, role: row.role, name: existing?.name ?? "" };
  }

  /** Sets the password and returns a session that still needs authenticator setup. */
  async acceptInvite(token: string, input: { name: string; password: string }, meta: RequestMeta = {}): Promise<{ sessionToken: string }> {
    const name = input.name.trim();
    if (!name) throw new AuthError("weak_password", "Enter your name.");
    const userId = await this.db.transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(invites)
        .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.usedAt), gt(invites.expiresAt, this.now())))
        .for("update");
      if (!invite) throw new AuthError("invite_invalid", "This invite link has expired or was already used. Ask an admin for a new one.");
      const problem = passwordProblem(input.password, invite.email);
      if (problem) throw new AuthError("weak_password", problem);
      const passwordHash = await hashPassword(input.password);
      const reset = { name, role: invite.role, passwordHash, totpEnabled: false, totpSecretEnc: null, totpLastStep: null, recoveryCodes: [], disabledAt: null };
      const [user] = await tx
        .insert(users)
        .values({ email: invite.email, createdAt: this.now(), ...reset })
        .onConflictDoUpdate({ target: users.email, set: reset })
        .returning();
      await tx.update(invites).set({ usedAt: this.now() }).where(eq(invites.id, invite.id));
      await tx.delete(sessions).where(eq(sessions.userId, user!.id));
      return user!.id;
    });
    await this.audit(userId, "Invite accepted");
    return { sessionToken: await this.createSession(userId, "pending_totp", meta) };
  }

  // ---------- sign-in ----------

  private async failures(email: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, this.minutesAgo(this.c.lockMinutes))));
    return row?.n ?? 0;
  }

  private async recordAttempt(email: string, success: boolean, meta: RequestMeta) {
    await this.db.insert(loginAttempts).values({ email, success, ip: meta.ip ?? null, createdAt: this.now() });
  }

  private lockedError() {
    return new AuthError("locked", `Too many attempts. Try again in ${this.c.lockMinutes} minutes, or ask an admin to reset your sign-in.`);
  }

  /** Step 1: email + password. Returns a short-lived session that still needs the authenticator code. */
  async login(emailInput: string, password: string, meta: RequestMeta = {}): Promise<{ sessionToken: string; needsTotpSetup: boolean }> {
    const email = normalizeEmail(emailInput);
    if ((await this.failures(email)) >= this.c.maxFailures) throw this.lockedError();
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    const usable = user && user.passwordHash && !user.disabledAt;
    // Always run one hash check so response time doesn't reveal which emails exist.
    const ok = await verifyPassword(password, usable ? user.passwordHash! : DUMMY_HASH);
    if (!usable || !ok) {
      await this.recordAttempt(email, false, meta);
      throw new AuthError("invalid_credentials", "That email and password don't match.");
    }
    return { sessionToken: await this.createSession(user.id, "pending_totp", meta), needsTotpSetup: !user.totpEnabled };
  }

  private async pending(token: string) {
    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), eq(sessions.stage, "pending_totp"), gt(sessions.createdAt, this.minutesAgo(this.c.pendingMinutes))));
    if (!row || row.user.disabledAt) throw new AuthError("session_expired", "Your sign-in timed out. Please start again.");
    return row;
  }

  /** For the authenticator step: who is signing in, and whether they still need to set up the app. */
  async getPending(token: string): Promise<{ email: string; name: string; needsTotpSetup: boolean } | undefined> {
    try {
      const { user } = await this.pending(token);
      return { email: user.email, name: user.name, needsTotpSetup: !user.totpEnabled };
    } catch {
      return undefined;
    }
  }

  /** Creates (or replaces) the authenticator secret during first-time setup. */
  async startTotpSetup(token: string): Promise<{ secret: string; uri: string }> {
    const { user } = await this.pending(token);
    if (user.totpEnabled) throw new AuthError("invalid_code", "Your authenticator is already set up.");
    const secret = generateTotpSecret();
    await this.db.update(users).set({ totpSecretEnc: encrypt(secret, this.c.appSecret) }).where(eq(users.id, user.id));
    return { secret, uri: otpauthUri(secret, user.email) };
  }

  /** Finishes setup: checks the first code, turns on the authenticator, returns recovery codes once. */
  async confirmTotpSetup(token: string, code: string, meta: RequestMeta = {}): Promise<{ sessionToken: string; recoveryCodes: string[] }> {
    const { user, session } = await this.pending(token);
    if (user.totpEnabled || !user.totpSecretEnc) throw new AuthError("invalid_code", "Start the authenticator setup again.");
    const step = verifyTotp(decrypt(user.totpSecretEnc, this.c.appSecret), code, this.now().getTime());
    if (step === undefined) throw new AuthError("invalid_code", "That code didn't match. Check the time on your phone and try the newest code.");
    const recoveryCodes = generateRecoveryCodes();
    await this.db
      .update(users)
      .set({ totpEnabled: true, totpLastStep: step, recoveryCodes: recoveryCodes.map((c) => sha256(c)), lastLoginAt: this.now() })
      .where(eq(users.id, user.id));
    await this.recordAttempt(user.email, true, meta);
    await this.audit(user.id, "Authenticator set up");
    return { sessionToken: await this.promote(session.id, user.id, meta), recoveryCodes };
  }

  /** Step 2: a 6-digit authenticator code or a one-time recovery code. */
  async verifyLogin(token: string, code: string, meta: RequestMeta = {}): Promise<{ sessionToken: string; usedRecoveryCode: boolean; recoveryCodesLeft: number }> {
    const { user, session } = await this.pending(token);
    if (!user.totpEnabled || !user.totpSecretEnc) throw new AuthError("invalid_code", "Set up your authenticator first.");
    if ((await this.failures(user.email)) >= this.c.maxFailures) {
      await this.db.delete(sessions).where(eq(sessions.id, session.id));
      throw this.lockedError();
    }
    const digits = code.replace(/\s/g, "");
    let usedRecoveryCode = false;
    let recoveryCodes = user.recoveryCodes;
    let step: number | undefined;
    if (/^\d{6}$/.test(digits)) {
      step = verifyTotp(decrypt(user.totpSecretEnc, this.c.appSecret), digits, this.now().getTime(), user.totpLastStep);
    } else {
      const hash = sha256(normalizeRecoveryCode(code));
      if (recoveryCodes.includes(hash)) {
        usedRecoveryCode = true;
        recoveryCodes = recoveryCodes.filter((h) => h !== hash);
      }
    }
    if (step === undefined && !usedRecoveryCode) {
      await this.recordAttempt(user.email, false, meta);
      throw new AuthError("invalid_code", "That code didn't match. Use the newest code in your authenticator app.");
    }
    await this.db
      .update(users)
      .set({ lastLoginAt: this.now(), recoveryCodes, ...(step !== undefined ? { totpLastStep: step } : {}) })
      .where(eq(users.id, user.id));
    await this.recordAttempt(user.email, true, meta);
    await this.audit(user.id, usedRecoveryCode ? "Signed in with a recovery code" : "Signed in", usedRecoveryCode ? `${recoveryCodes.length} recovery codes left` : undefined);
    return { sessionToken: await this.promote(session.id, user.id, meta), usedRecoveryCode, recoveryCodesLeft: recoveryCodes.length };
  }

  // ---------- Sign in with Microsoft / Google ----------

  /**
   * After the provider has vouched for someone. Only invited people get in. The first sign-in ties
   * the console account to that Microsoft or Google account; after that, a different account with
   * the same email is refused.
   */
  async ssoLogin(identity: SsoIdentity, meta: RequestMeta = {}): Promise<{ sessionToken: string }> {
    const email = normalizeEmail(identity.email);
    const label = PROVIDER_LABEL[identity.provider];
    if (this.c.allowedDomain && !email.endsWith(`@${this.c.allowedDomain.toLowerCase()}`)) {
      throw new AuthError("domain_not_allowed", `Sign in with your @${this.c.allowedDomain} account.`);
    }
    const subField = SUB_FIELD[identity.provider];
    const userId = await this.db.transaction(async (tx) => {
      const [bySub] = await tx.select().from(users).where(eq(SUB_COLUMN[identity.provider], identity.subject));
      if (bySub && bySub.email !== email) {
        throw new AuthError("account_mismatch", `This ${label} account is linked to a different console user. Ask an admin to reset your sign-in.`);
      }
      const [user] = await tx.select().from(users).where(eq(users.email, email)).for("update");
      const [invite] = await tx
        .select()
        .from(invites)
        .where(and(eq(invites.email, email), isNull(invites.usedAt), gt(invites.expiresAt, this.now())))
        .for("update");

      if (user) {
        if (user.disabledAt) throw new AuthError("invalid_credentials", "Your access has been turned off. Ask an admin if this is a mistake.");
        const linked = user[subField];
        if (linked && linked !== identity.subject) {
          throw new AuthError("account_mismatch", `${email} is linked to a different ${label} account. Ask an admin to reset your sign-in.`);
        }
        if (!linked && !invite && !hasAnySignIn(user)) {
          throw new AuthError("not_invited", "Your sign-in was reset. Ask an admin for a new invite.");
        }
        await tx
          .update(users)
          .set({ [subField]: identity.subject, lastLoginAt: this.now(), ...(invite ? { role: invite.role } : {}), ...(!user.name && identity.name ? { name: identity.name } : {}) })
          .where(eq(users.id, user.id));
        if (invite) await tx.update(invites).set({ usedAt: this.now() }).where(eq(invites.id, invite.id));
        return { id: user.id, first: !linked };
      }

      if (!invite) throw new AuthError("not_invited", "You don't have access yet. Ask an admin to invite you.");
      const [created] = await tx
        .insert(users)
        .values({ email, name: identity.name || email.split("@")[0]!, role: invite.role, [subField]: identity.subject, lastLoginAt: this.now(), createdAt: this.now() })
        .returning();
      await tx.update(invites).set({ usedAt: this.now() }).where(eq(invites.id, invite.id));
      return { id: created!.id, first: true };
    });
    await this.recordAttempt(email, true, meta);
    await this.audit(userId.id, `Signed in with ${label}`, userId.first ? `${label} account linked` : undefined);
    return { sessionToken: await this.createSession(userId.id, "active", meta) };
  }

  // ---------- sessions ----------

  private async createSession(userId: string, stage: "pending_totp" | "active", meta: RequestMeta): Promise<string> {
    const token = randomToken();
    const now = this.now();
    const ttl = stage === "active" ? this.c.sessionTtlHours * 60 : this.c.pendingMinutes;
    await this.db.insert(sessions).values({
      userId,
      tokenHash: sha256(token),
      stage,
      expiresAt: new Date(now.getTime() + ttl * 60_000),
      lastSeenAt: now,
      createdAt: now,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    });
    return token;
  }

  /** New token when the stage changes, so a pending token can never become a full session. */
  private async promote(pendingId: string, userId: string, meta: RequestMeta): Promise<string> {
    await this.db.delete(sessions).where(eq(sessions.id, pendingId));
    return this.createSession(userId, "active", meta);
  }

  /** The signed-in user for a session cookie, or undefined. Refreshes the idle timer. */
  async getSession(token: string | undefined): Promise<SafeUser | undefined> {
    if (!token) return undefined;
    const now = this.now();
    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), eq(sessions.stage, "active"), gt(sessions.expiresAt, now)));
    if (!row || row.user.disabledAt) return undefined;
    const idleMs = now.getTime() - row.session.lastSeenAt.getTime();
    if (idleMs > this.c.idleHours * 3_600_000) {
      await this.db.delete(sessions).where(eq(sessions.id, row.session.id));
      return undefined;
    }
    if (idleMs > 5 * 60_000) await this.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id));
    return safe(row.user);
  }

  async logout(token: string | undefined) {
    if (!token) return;
    const [row] = await this.db.delete(sessions).where(eq(sessions.tokenHash, sha256(token))).returning();
    if (row?.stage === "active") await this.audit(row.userId, "Signed out");
  }

  // ---------- user management (admin) ----------

  async listUsers(): Promise<(SafeUser & { pendingInvite: boolean })[]> {
    const rows = await this.db.select().from(users).orderBy(users.name);
    const open = await this.db
      .select({ email: invites.email })
      .from(invites)
      .where(and(isNull(invites.usedAt), gt(invites.expiresAt, this.now())));
    const openSet = new Set(open.map((o) => o.email));
    return rows.map((u) => ({ ...safe(u), pendingInvite: openSet.has(u.email) || !hasAnySignIn(u) }));
  }

  async listOpenInvites() {
    const rows = await this.db
      .select({ email: invites.email, role: invites.role, expiresAt: invites.expiresAt })
      .from(invites)
      .leftJoin(users, eq(users.email, invites.email))
      .where(and(isNull(invites.usedAt), gt(invites.expiresAt, this.now()), isNull(users.id)));
    return rows;
  }

  private async assertNotLastAdmin(userId: string) {
    const [target] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!target) throw new AuthError("not_found", "User not found.");
    if (target.role !== "admin" || target.disabledAt) return target;
    const [row] = await this.db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.disabledAt), ne(users.id, userId), hasSignIn));
    if ((row?.n ?? 0) === 0) throw new AuthError("last_admin", "There must always be at least one active admin.");
    return target;
  }

  async setRole(actorId: string, userId: string, role: Role) {
    const target = role === "admin" ? (await this.db.select().from(users).where(eq(users.id, userId)))[0] : await this.assertNotLastAdmin(userId);
    if (!target) throw new AuthError("not_found", "User not found.");
    await this.db.update(users).set({ role }).where(eq(users.id, userId));
    await this.audit(actorId, "Role changed", `${target.email}: ${target.role} → ${role}`);
  }

  async setDisabled(actorId: string, userId: string, disabled: boolean) {
    const target = disabled ? await this.assertNotLastAdmin(userId) : (await this.db.select().from(users).where(eq(users.id, userId)))[0];
    if (!target) throw new AuthError("not_found", "User not found.");
    await this.db.update(users).set({ disabledAt: disabled ? this.now() : null }).where(eq(users.id, userId));
    if (disabled) await this.db.delete(sessions).where(eq(sessions.userId, userId));
    await this.audit(actorId, disabled ? "User disabled" : "User re-enabled", target.email);
  }

  /** Lost phone, forgotten password or wrong Microsoft/Google account: clears the sign-in and issues a new invite. */
  async resetUser(actorId: string, userId: string): Promise<{ token: string; expiresAt: Date }> {
    const [target] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!target) throw new AuthError("not_found", "User not found.");
    await this.db
      .update(users)
      .set({ passwordHash: null, totpEnabled: false, totpSecretEnc: null, totpLastStep: null, recoveryCodes: [], microsoftSub: null, googleSub: null })
      .where(eq(users.id, userId));
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
    await this.audit(actorId, "Sign-in reset", target.email);
    return this.createInvite({ email: target.email, role: target.role, createdBy: actorId });
  }

  async hasActiveAdmin(): Promise<boolean> {
    const [row] = await this.db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.disabledAt), hasSignIn));
    return (row?.n ?? 0) > 0;
  }
}
