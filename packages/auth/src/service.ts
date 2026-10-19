import { auditLogs, invites, loginAttempts, passwordResets, sessions, users, type Db, type Role, type User } from "@reorder/db";
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
  /** Ask for a 6-digit authenticator code after the password. Off: the password alone signs in. */
  requireAuthenticator?: boolean;
  /** How long a "forgot password" link works. */
  resetTtlMinutes?: number;
  /** "Forgot password" emails per account per hour. */
  maxResetsPerHour?: number;
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
  | "invalid_input"
  | "taken"
  | "reset_invalid"
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

export type SafeUser = Pick<User, "id" | "email" | "username" | "name" | "role" | "totpEnabled" | "disabledAt" | "lastLoginAt" | "createdAt"> & {
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
    username: u.username,
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

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Why a username can't be used, or undefined when it's fine. */
export function usernameProblem(username: string): string | undefined {
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return "Usernames are 3–32 characters: letters, numbers, dot, dash or underscore.";
  return undefined;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UserInput {
  name: string;
  /** Optional; empty means "sign in with email". */
  username?: string;
  email: string;
  role: Role;
  /** Optional; empty means they'll use Microsoft or Google. */
  password?: string;
}

export interface UserChanges {
  name?: string;
  username?: string;
  email?: string;
  role?: Role;
  /** A new password; empty leaves it unchanged. */
  password?: string;
  /** Lost phone: they set up the authenticator again at next sign-in. */
  resetAuthenticator?: boolean;
  /** Untie their Microsoft and Google accounts. */
  unlinkAccounts?: boolean;
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
      requireAuthenticator: true,
      resetTtlMinutes: 60,
      maxResetsPerHour: 3,
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

  /** Sets the password. Returns a session that still needs authenticator setup, or a full one when the authenticator is off. */
  async acceptInvite(token: string, input: { name: string; password: string }, meta: RequestMeta = {}): Promise<{ sessionToken: string; signedIn: boolean }> {
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
    if (!this.c.requireAuthenticator) {
      await this.db.update(users).set({ lastLoginAt: this.now() }).where(eq(users.id, userId));
      return { sessionToken: await this.createSession(userId, "active", meta), signedIn: true };
    }
    return { sessionToken: await this.createSession(userId, "pending_totp", meta), signedIn: false };
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

  private async findByLogin(identifier: string): Promise<User | undefined> {
    const id = identifier.trim().toLowerCase();
    if (!id) return undefined;
    const [user] = await this.db
      .select()
      .from(users)
      .where(id.includes("@") ? eq(users.email, id) : eq(users.username, id));
    return user;
  }

  /**
   * Username or email + password. With the authenticator on, returns a short-lived session that
   * still needs the 6-digit code; with it off, a full session (`signedIn: true`).
   */
  async login(identifier: string, password: string, meta: RequestMeta = {}): Promise<{ sessionToken: string; needsTotpSetup: boolean; signedIn: boolean }> {
    const found = await this.findByLogin(identifier);
    // Lockout is per account (by email), whichever name was typed.
    const email = found?.email ?? normalizeEmail(identifier);
    if ((await this.failures(email)) >= this.c.maxFailures) throw this.lockedError();
    const user = found;
    const usable = user && user.passwordHash && !user.disabledAt;
    // Always run one hash check so response time doesn't reveal which emails exist.
    const ok = await verifyPassword(password, usable ? user.passwordHash! : DUMMY_HASH);
    if (!usable || !ok) {
      await this.recordAttempt(email, false, meta);
      throw new AuthError("invalid_credentials", "That username or email and password don't match.");
    }
    if (!this.c.requireAuthenticator) {
      await this.db.update(users).set({ lastLoginAt: this.now() }).where(eq(users.id, user.id));
      await this.recordAttempt(email, true, meta);
      await this.audit(user.id, "Signed in");
      return { sessionToken: await this.createSession(user.id, "active", meta), needsTotpSetup: false, signedIn: true };
    }
    return { sessionToken: await this.createSession(user.id, "pending_totp", meta), needsTotpSetup: !user.totpEnabled, signedIn: false };
  }

  /** Whether sign-in asks for a 6-digit authenticator code. */
  get requiresAuthenticator(): boolean {
    return this.c.requireAuthenticator;
  }

  private async pending(token: string) {
    if (!this.c.requireAuthenticator) throw new AuthError("session_expired", "Authenticator codes are turned off. Sign in with your password.");
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
    return rows.map((u) => ({ ...safe(u), pendingInvite: !u.lastLoginAt && (openSet.has(u.email) || !hasAnySignIn(u) || (this.c.requireAuthenticator && !u.totpEnabled)) }));
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

  private async assertFree(field: "email" | "username", value: string, exceptId?: string) {
    const col = field === "email" ? users.email : users.username;
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(col, value), exceptId ? ne(users.id, exceptId) : undefined));
    if (row) throw new AuthError("taken", field === "email" ? "Someone already uses that email." : "That username is taken.");
  }

  private checkEmail(email: string) {
    if (!EMAIL_RE.test(email)) throw new AuthError("invalid_input", "Enter a valid email address.");
    if (this.c.allowedDomain && !email.endsWith(`@${this.c.allowedDomain.toLowerCase()}`)) {
      throw new AuthError("domain_not_allowed", `Only @${this.c.allowedDomain} addresses can be added.`);
    }
  }

  private checkPassword(password: string, email: string, username?: string | null) {
    const problem = passwordProblem(password, email) ?? (username && username.length >= 3 && password.toLowerCase().includes(username) ? "Don't include your username in the password." : undefined);
    if (problem) throw new AuthError("weak_password", problem);
  }

  /** Admin adds someone directly with their username, email and (optionally) a password. */
  async createUser(actorId: string | null, input: UserInput): Promise<SafeUser> {
    const name = input.name.trim();
    const email = normalizeEmail(input.email);
    const username = input.username?.trim() ? normalizeUsername(input.username) : null;
    if (!name) throw new AuthError("invalid_input", "Enter their name.");
    this.checkEmail(email);
    if (username) {
      const problem = usernameProblem(username);
      if (problem) throw new AuthError("invalid_input", problem);
    }
    const password = input.password ?? "";
    if (password) this.checkPassword(password, email, username);
    await this.assertFree("email", email);
    if (username) await this.assertFree("username", username);
    const [user] = await this.db
      .insert(users)
      .values({ email, username, name, role: input.role, passwordHash: password ? await hashPassword(password) : null, createdAt: this.now() })
      .returning();
    await this.audit(actorId, "User added", `${username ? `${username} · ` : ""}${email} as ${input.role}`);
    return safe(user!);
  }

  /** Admin edits someone: name, username, email, role, password, authenticator and linked accounts. */
  async updateUser(actorId: string, userId: string, changes: UserChanges): Promise<SafeUser> {
    const [target] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!target) throw new AuthError("not_found", "User not found.");
    if (changes.role && changes.role !== "admin" && target.role === "admin") await this.assertNotLastAdmin(userId);

    const set: Partial<typeof users.$inferInsert> = {};
    const notes: string[] = [];
    let endSessions = false;
    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (!name) throw new AuthError("invalid_input", "Enter their name.");
      if (name !== target.name) set.name = name;
    }
    const email = changes.email !== undefined ? normalizeEmail(changes.email) : target.email;
    if (email !== target.email) {
      this.checkEmail(email);
      await this.assertFree("email", email, userId);
      // A Microsoft/Google account was tied to the old address.
      Object.assign(set, { email, microsoftSub: null, googleSub: null });
      notes.push(`email ${target.email} → ${email}`);
      endSessions = true;
    }
    let username = target.username;
    if (changes.username !== undefined) {
      username = changes.username.trim() ? normalizeUsername(changes.username) : null;
      if (username !== target.username) {
        if (username) {
          const problem = usernameProblem(username);
          if (problem) throw new AuthError("invalid_input", problem);
          await this.assertFree("username", username, userId);
        }
        set.username = username;
        notes.push(`username ${target.username ?? "none"} → ${username ?? "none"}`);
      }
    }
    if (changes.role && changes.role !== target.role) {
      set.role = changes.role;
      notes.push(`role ${target.role} → ${changes.role}`);
    }
    if (changes.password) {
      this.checkPassword(changes.password, email, username);
      set.passwordHash = await hashPassword(changes.password);
      notes.push("new password");
      endSessions = true;
    }
    if (changes.resetAuthenticator) {
      Object.assign(set, { totpEnabled: false, totpSecretEnc: null, totpLastStep: null, recoveryCodes: [] });
      notes.push("authenticator reset");
      endSessions = true;
    }
    if (changes.unlinkAccounts && (target.microsoftSub || target.googleSub)) {
      Object.assign(set, { microsoftSub: null, googleSub: null });
      notes.push("Microsoft/Google unlinked");
      endSessions = true;
    }
    if (!Object.keys(set).length) return safe(target);
    const [updated] = await this.db.update(users).set(set).where(eq(users.id, userId)).returning();
    if (endSessions) await this.db.delete(sessions).where(eq(sessions.userId, userId));
    await this.audit(actorId, "User updated", `${target.email}: ${notes.join(", ")}`);
    return safe(updated!);
  }

  /** Removes the account. The activity log keeps their name and their past approvals stay on record. */
  async deleteUser(actorId: string, userId: string) {
    if (actorId === userId) throw new AuthError("invalid_input", "You can't delete your own account.");
    const target = await this.assertNotLastAdmin(userId);
    await this.db.transaction(async (tx) => {
      await tx.update(auditLogs).set({ userName: target.name }).where(eq(auditLogs.userId, userId));
      await tx.update(invites).set({ usedAt: this.now() }).where(and(eq(invites.email, target.email), isNull(invites.usedAt)));
      await tx.delete(users).where(eq(users.id, userId));
    });
    await this.audit(actorId, "User deleted", `${target.name} · ${target.email}`);
  }

  // ---------- forgot password ----------

  /**
   * Makes a one-time link for "forgot password". Returns undefined (and the page says the same
   * thing either way) when there's no such enabled account or too many links were asked for.
   */
  async requestPasswordReset(identifier: string): Promise<{ token: string; email: string; name: string; expiresAt: Date } | undefined> {
    const user = await this.findByLogin(identifier);
    if (!user || user.disabledAt) return undefined;
    const [recent] = await this.db
      .select({ n: count() })
      .from(passwordResets)
      .where(and(eq(passwordResets.userId, user.id), gt(passwordResets.createdAt, this.minutesAgo(60))));
    if ((recent?.n ?? 0) >= this.c.maxResetsPerHour) return undefined;
    const token = randomToken();
    const expiresAt = new Date(this.now().getTime() + this.c.resetTtlMinutes * 60_000);
    await this.db.insert(passwordResets).values({ userId: user.id, tokenHash: sha256(token), expiresAt, createdAt: this.now() });
    await this.audit(user.id, "Password reset requested");
    return { token, email: user.email, name: user.name, expiresAt };
  }

  private async openReset(token: string) {
    const [row] = await this.db
      .select({ reset: passwordResets, user: users })
      .from(passwordResets)
      .innerJoin(users, eq(users.id, passwordResets.userId))
      .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, this.now())));
    if (!row || row.user.disabledAt) return undefined;
    return row;
  }

  async getPasswordReset(token: string): Promise<{ email: string; username: string | null } | undefined> {
    const row = await this.openReset(token);
    return row && { email: row.user.email, username: row.user.username };
  }

  /** Sets the new password from the emailed link. Signs them out everywhere; the authenticator stays. */
  async resetPassword(token: string, password: string) {
    const row = await this.openReset(token);
    if (!row) throw new AuthError("reset_invalid", "This link has expired or was already used. Ask for a new one.");
    this.checkPassword(password, row.user.email, row.user.username);
    const hash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, row.user.id));
      // This link and any other open ones stop working.
      await tx.update(passwordResets).set({ usedAt: this.now() }).where(and(eq(passwordResets.userId, row.user.id), isNull(passwordResets.usedAt)));
      await tx.delete(sessions).where(eq(sessions.userId, row.user.id));
    });
    await this.audit(row.user.id, "Password changed", "with an emailed link");
  }

  async hasActiveAdmin(): Promise<boolean> {
    const [row] = await this.db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.disabledAt), hasSignIn));
    return (row?.n ?? 0) > 0;
  }
}
