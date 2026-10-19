import { closeDb, getDb } from "@reorder/db";
import { sql } from "drizzle-orm";
import { runMigrations } from "@reorder/db/migrate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService, type AuthConfig } from "./service";
import { timeStep, totpCode } from "./totp";

const url = process.env.TEST_DATABASE_URL ?? "postgres://reorder:reorder@localhost:5432/reorder_test";
const PASSWORD = "Restock-Season-2026!";

let clock = new Date("2026-10-14T09:00:00Z");
const config: AuthConfig = { appSecret: "s".repeat(40), allowedDomain: "amipi.com", now: () => clock };
const advance = (minutes: number) => (clock = new Date(clock.getTime() + minutes * 60_000));
const code = (secret: string, offsetSteps = 0) => totpCode(secret, timeStep(clock.getTime()) + offsetSteps);

let auth: AuthService;

/** Invite -> password -> authenticator setup. Returns the active session token and TOTP secret. */
async function onboard(email: string, role: "admin" | "reviewer" | "viewer" = "reviewer") {
  const { token } = await auth.createInvite({ email, role, createdBy: null });
  const { sessionToken: pending } = await auth.acceptInvite(token, { name: email.split("@")[0]!, password: PASSWORD });
  const { secret } = await auth.startTotpSetup(pending);
  const { sessionToken, recoveryCodes } = await auth.confirmTotpSetup(pending, code(secret));
  advance(1); // next code window, so the setup code isn't reused
  return { sessionToken, secret, recoveryCodes };
}

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("AuthService (PostgreSQL)", () => {
  beforeAll(async () => {
    await runMigrations(url);
    auth = new AuthService(getDb(url), config);
  });
  afterAll(closeDb);
  beforeEach(async () => {
    // CASCADE also clears anything else (campaigns, approvals, …) that points at users.
    await getDb(url).execute(sql`truncate table users, invites, login_attempts, audit_logs cascade`);
    clock = new Date("2026-10-14T09:00:00Z");
  });

  it("onboards a user through invite, password and authenticator", async () => {
    const { sessionToken, recoveryCodes } = await onboard("Shruti@AMIPI.com");
    expect(recoveryCodes).toHaveLength(8);
    const me = await auth.getSession(sessionToken);
    expect(me).toMatchObject({ email: "shruti@amipi.com", role: "reviewer", totpEnabled: true });
    expect(me).not.toHaveProperty("passwordHash");
  });

  it("only invites the company domain and makes invite links single-use", async () => {
    await expect(auth.createInvite({ email: "someone@gmail.com", role: "viewer", createdBy: null })).rejects.toThrow(/amipi\.com/);
    const { token } = await auth.createInvite({ email: "a@amipi.com", role: "viewer", createdBy: null });
    await expect(auth.acceptInvite(token, { name: "A", password: "short" })).rejects.toMatchObject({ code: "weak_password" });
    await auth.acceptInvite(token, { name: "A", password: PASSWORD });
    await expect(auth.acceptInvite(token, { name: "A", password: PASSWORD })).rejects.toMatchObject({ code: "invite_invalid" });
    expect(await auth.getInvite(token)).toBeUndefined();
  });

  it("expires invites and replaces older links", async () => {
    const first = await auth.createInvite({ email: "b@amipi.com", role: "viewer", createdBy: null });
    const second = await auth.createInvite({ email: "b@amipi.com", role: "viewer", createdBy: null });
    expect(await auth.getInvite(first.token)).toBeUndefined();
    expect(await auth.getInvite(second.token)).toMatchObject({ email: "b@amipi.com" });
    advance(73 * 60);
    expect(await auth.getInvite(second.token)).toBeUndefined();
  });

  it("needs both password and a fresh authenticator code", async () => {
    const { secret } = await onboard("c@amipi.com");
    await expect(auth.login("c@amipi.com", "Wrong-Password-123")).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(auth.login("nobody@amipi.com", PASSWORD)).rejects.toMatchObject({ code: "invalid_credentials" });
    const { sessionToken: pending, needsTotpSetup } = await auth.login("C@amipi.com", PASSWORD);
    expect(needsTotpSetup).toBe(false);
    expect(await auth.getSession(pending)).toBeUndefined(); // password alone is not a session
    await expect(auth.verifyLogin(pending, "000000")).rejects.toMatchObject({ code: "invalid_code" });
    const { sessionToken } = await auth.verifyLogin(pending, code(secret));
    expect(await auth.getSession(sessionToken)).toMatchObject({ email: "c@amipi.com" });
    // The pending token stops working once promoted, and the same code can't be replayed.
    await expect(auth.verifyLogin(pending, code(secret))).rejects.toMatchObject({ code: "session_expired" });
    const again = await auth.login("c@amipi.com", PASSWORD);
    await expect(auth.verifyLogin(again.sessionToken, code(secret))).rejects.toMatchObject({ code: "invalid_code" });
  });

  it("accepts each recovery code once", async () => {
    const { recoveryCodes } = await onboard("d@amipi.com");
    const p1 = await auth.login("d@amipi.com", PASSWORD);
    const r = await auth.verifyLogin(p1.sessionToken, recoveryCodes[0]!.toUpperCase());
    expect(r).toMatchObject({ usedRecoveryCode: true, recoveryCodesLeft: 7 });
    const p2 = await auth.login("d@amipi.com", PASSWORD);
    await expect(auth.verifyLogin(p2.sessionToken, recoveryCodes[0]!)).rejects.toMatchObject({ code: "invalid_code" });
  });

  it("locks the account after 5 failures for 15 minutes", async () => {
    await onboard("e@amipi.com");
    for (let i = 0; i < 5; i++) await expect(auth.login("e@amipi.com", "Wrong-Password-123")).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(auth.login("e@amipi.com", PASSWORD)).rejects.toMatchObject({ code: "locked" });
    advance(16);
    await expect(auth.login("e@amipi.com", PASSWORD)).resolves.toBeDefined();
  });

  it("expires the code step and idle sessions", async () => {
    const { secret, sessionToken } = await onboard("f@amipi.com");
    const p = await auth.login("f@amipi.com", PASSWORD);
    advance(11);
    await expect(auth.verifyLogin(p.sessionToken, code(secret))).rejects.toMatchObject({ code: "session_expired" });
    advance(60 * 25);
    expect(await auth.getSession(sessionToken)).toBeUndefined();
  });

  it("lets admins manage users but never removes the last admin", async () => {
    const admin = await onboard("owner@amipi.com", "admin");
    const me = (await auth.getSession(admin.sessionToken))!;
    await expect(auth.setRole(me.id, me.id, "viewer")).rejects.toMatchObject({ code: "last_admin" });
    await expect(auth.setDisabled(me.id, me.id, true)).rejects.toMatchObject({ code: "last_admin" });

    const reviewer = await onboard("g@amipi.com");
    const g = (await auth.getSession(reviewer.sessionToken))!;
    await auth.setDisabled(me.id, g.id, true);
    expect(await auth.getSession(reviewer.sessionToken)).toBeUndefined();
    await expect(auth.login("g@amipi.com", PASSWORD)).rejects.toMatchObject({ code: "invalid_credentials" });
    await auth.setDisabled(me.id, g.id, false);

    const { token } = await auth.resetUser(me.id, g.id);
    await expect(auth.login("g@amipi.com", PASSWORD)).rejects.toMatchObject({ code: "invalid_credentials" });
    const { sessionToken: pending } = await auth.acceptInvite(token, { name: "G", password: "Another-Strong-Pass-1" });
    expect(await auth.getPending(pending)).toMatchObject({ needsTotpSetup: true });

    const users = await auth.listUsers();
    expect(users.map((u) => u.email).sort()).toEqual(["g@amipi.com", "owner@amipi.com"]);
    expect(await auth.hasActiveAdmin()).toBe(true);
  });

  describe("Sign in with Microsoft / Google", () => {
    const ms = (over: Partial<{ subject: string; email: string; name: string }> = {}) => ({ provider: "microsoft" as const, subject: "oid-1", email: "Shreya@amipi.com", name: "Shreya Patel", ...over });

    it("lets invited people in and ties their account on first sign-in", async () => {
      await expect(auth.ssoLogin(ms())).rejects.toMatchObject({ code: "not_invited" });
      await auth.createInvite({ email: "shreya@amipi.com", role: "reviewer", createdBy: null });
      const { sessionToken } = await auth.ssoLogin(ms());
      expect(await auth.getSession(sessionToken)).toMatchObject({ email: "shreya@amipi.com", name: "Shreya Patel", role: "reviewer", signInMethods: ["microsoft"] });
      // The invite is used up; signing in again works without it.
      expect(await auth.getSession((await auth.ssoLogin(ms())).sessionToken)).toBeDefined();
      // Google can be added for the same person.
      await auth.ssoLogin({ provider: "google", subject: "g-1", email: "shreya@amipi.com", name: "" });
      expect((await auth.listUsers())[0]!.signInMethods).toEqual(["microsoft", "google"]);
    });

    it("refuses a different account with the same email, other domains and disabled users", async () => {
      await auth.createInvite({ email: "shreya@amipi.com", role: "reviewer", createdBy: null });
      await auth.ssoLogin(ms());
      await expect(auth.ssoLogin(ms({ subject: "oid-2" }))).rejects.toMatchObject({ code: "account_mismatch" });
      await expect(auth.ssoLogin(ms({ email: "other@amipi.com" }))).rejects.toMatchObject({ code: "account_mismatch" });
      await expect(auth.ssoLogin(ms({ email: "shreya@gmail.com", subject: "x" }))).rejects.toMatchObject({ code: "domain_not_allowed" });
      const [u] = await auth.listUsers();
      await auth.createInvite({ email: "admin@amipi.com", role: "admin", createdBy: null });
      await auth.ssoLogin({ provider: "google", subject: "g-admin", email: "admin@amipi.com", name: "Admin" });
      await auth.setDisabled(u!.id, u!.id, true);
      await expect(auth.ssoLogin(ms())).rejects.toMatchObject({ code: "invalid_credentials" });
    });

    it("counts single-sign-on admins and unlinks accounts on reset", async () => {
      expect(await auth.hasActiveAdmin()).toBe(false);
      await auth.createInvite({ email: "owner@amipi.com", role: "admin", createdBy: null });
      await auth.ssoLogin(ms({ email: "owner@amipi.com", subject: "oid-owner" }));
      expect(await auth.hasActiveAdmin()).toBe(true);
      const [owner] = await auth.listUsers();
      await expect(auth.setRole(owner!.id, owner!.id, "viewer")).rejects.toMatchObject({ code: "last_admin" });

      await auth.createInvite({ email: "shreya@amipi.com", role: "reviewer", createdBy: owner!.id });
      await auth.ssoLogin(ms());
      const shreya = (await auth.listUsers()).find((u) => u.email === "shreya@amipi.com")!;
      await auth.resetUser(owner!.id, shreya.id);
      // A new Microsoft account can now be tied, because the reset sent a fresh invite.
      const { sessionToken } = await auth.ssoLogin(ms({ subject: "oid-new" }));
      expect(await auth.getSession(sessionToken)).toMatchObject({ email: "shreya@amipi.com", role: "reviewer" });
    });
  });

  describe("accounts made by an admin", () => {
    const PW = "Sparkle-Restock-77";

    it("signs in with username or email, then the authenticator code", async () => {
      const u = await auth.createUser(null, { name: "Shreya Patel", username: "Shreya.P", email: "shreya@amipi.com", role: "reviewer", password: PW });
      expect(u).toMatchObject({ username: "shreya.p", signInMethods: ["password"] });
      const byName = await auth.login("SHREYA.P", PW);
      expect(byName.needsTotpSetup).toBe(true);
      const { secret } = await auth.startTotpSetup(byName.sessionToken);
      const { sessionToken } = await auth.confirmTotpSetup(byName.sessionToken, code(secret));
      expect(await auth.getSession(sessionToken)).toMatchObject({ email: "shreya@amipi.com" });
      advance(1);
      const byEmail = await auth.login("shreya@amipi.com", PW);
      expect(byEmail.needsTotpSetup).toBe(false);
      await expect(auth.login("shreya.p", "wrong-password-123")).rejects.toMatchObject({ code: "invalid_credentials" });
    });

    it("checks names, emails and passwords", async () => {
      await auth.createUser(null, { name: "A", username: "anna", email: "anna@amipi.com", role: "viewer", password: PW });
      await expect(auth.createUser(null, { name: "B", username: "anna", email: "b@amipi.com", role: "viewer" })).rejects.toMatchObject({ code: "taken" });
      await expect(auth.createUser(null, { name: "B", email: "ANNA@amipi.com", role: "viewer" })).rejects.toMatchObject({ code: "taken" });
      await expect(auth.createUser(null, { name: "B", username: "a b", email: "b@amipi.com", role: "viewer" })).rejects.toMatchObject({ code: "invalid_input" });
      await expect(auth.createUser(null, { name: "B", email: "b@gmail.com", role: "viewer" })).rejects.toMatchObject({ code: "domain_not_allowed" });
      await expect(auth.createUser(null, { name: "B", username: "bobby", email: "b@amipi.com", role: "viewer", password: "bobby-Restock-77" })).rejects.toMatchObject({ code: "weak_password" });
      // No password: they'll use Microsoft or Google, and can be tied on first sign-in.
      await auth.createUser(null, { name: "Cara", email: "cara@amipi.com", role: "viewer" });
      const { sessionToken } = await auth.ssoLogin({ provider: "google", subject: "g-cara", email: "cara@amipi.com", name: "Cara" });
      expect(await auth.getSession(sessionToken)).toMatchObject({ email: "cara@amipi.com", signInMethods: ["google"] });
    });

    it("lets an admin edit someone, which signs them out", async () => {
      const admin = await auth.createUser(null, { name: "Owner", username: "owner", email: "owner@amipi.com", role: "admin", password: PW });
      const u = await auth.createUser(admin.id, { name: "Shruti", username: "shruti", email: "shruti@amipi.com", role: "reviewer", password: PW });
      const { sessionToken } = await auth.ssoLogin({ provider: "microsoft", subject: "oid-s", email: "shruti@amipi.com", name: "" });
      const changed = await auth.updateUser(admin.id, u.id, { username: "shruti.k", password: "Another-Season-2027", resetAuthenticator: true });
      expect(changed).toMatchObject({ username: "shruti.k", totpEnabled: false });
      expect(await auth.getSession(sessionToken)).toBeUndefined();
      expect((await auth.login("shruti.k", "Another-Season-2027")).needsTotpSetup).toBe(true);
      // A new email unties the Microsoft account that belonged to the old one.
      expect((await auth.updateUser(admin.id, u.id, { email: "shruti.k@amipi.com" })).signInMethods).toEqual(["password"]);
      await expect(auth.updateUser(admin.id, admin.id, { role: "viewer" })).rejects.toMatchObject({ code: "last_admin" });
      await expect(auth.updateUser(admin.id, u.id, { username: "owner" })).rejects.toMatchObject({ code: "taken" });
    });

    it("deletes someone but keeps their name in the log and their approvals", async () => {
      const admin = await auth.createUser(null, { name: "Owner", username: "owner", email: "owner@amipi.com", role: "admin", password: PW });
      const u = await auth.createUser(admin.id, { name: "Shreya Patel", email: "shreya@amipi.com", role: "reviewer", password: PW });
      await auth.audit(u.id, "Approved");
      const db = getDb(url);
      await db.execute(sql`insert into campaigns (id, name, season_start, season_end, status) values ('c1', 'Holiday', '2025-10-01', '2025-12-31', 'draft')`);
      await db.execute(sql`insert into approvals (campaign_id, user_id, user_name) values ('c1', ${u.id}, 'Shreya Patel')`);
      await expect(auth.deleteUser(admin.id, admin.id)).rejects.toMatchObject({ code: "invalid_input" });
      await auth.deleteUser(admin.id, u.id);
      expect((await auth.listUsers()).map((x) => x.email)).toEqual(["owner@amipi.com"]);
      const log = await db.execute(sql`select user_id, user_name from audit_logs where action = 'Approved'`);
      expect(log[0]).toMatchObject({ user_id: null, user_name: "Shreya Patel" });
      const approvals = await db.execute(sql`select user_name from approvals`);
      expect(approvals[0]).toMatchObject({ user_name: "Shreya Patel" });
      // The email can be used again.
      await auth.createUser(admin.id, { name: "Shreya", email: "shreya@amipi.com", role: "viewer" });
    });
  });

  describe("forgot password", () => {
    const PW = "Sparkle-Restock-77";

    it("emails a one-time link that sets a new password and signs out everywhere", async () => {
      await auth.createUser(null, { name: "Shreya", username: "shreya", email: "shreya@amipi.com", role: "reviewer", password: PW });
      const { sessionToken } = await auth.ssoLogin({ provider: "google", subject: "g1", email: "shreya@amipi.com", name: "" });
      expect(await auth.requestPasswordReset("nobody@amipi.com")).toBeUndefined();
      const link = (await auth.requestPasswordReset("Shreya"))!;
      expect(link.email).toBe("shreya@amipi.com");
      expect(await auth.getPasswordReset(link.token)).toEqual({ email: "shreya@amipi.com", username: "shreya" });
      await expect(auth.resetPassword(link.token, "short")).rejects.toMatchObject({ code: "weak_password" });
      await auth.resetPassword(link.token, "Brand-New-Season-88");
      expect(await auth.getSession(sessionToken)).toBeUndefined();
      await expect(auth.resetPassword(link.token, "Brand-New-Season-99")).rejects.toMatchObject({ code: "reset_invalid" });
      await expect(auth.login("shreya", PW)).rejects.toMatchObject({ code: "invalid_credentials" });
      expect(await auth.login("shreya", "Brand-New-Season-88")).toBeDefined();
    });

    it("expires links and limits how many are sent", async () => {
      await auth.createUser(null, { name: "Shreya", email: "shreya@amipi.com", role: "reviewer", password: PW });
      const first = (await auth.requestPasswordReset("shreya@amipi.com"))!;
      advance(61);
      await expect(auth.resetPassword(first.token, "Brand-New-Season-88")).rejects.toMatchObject({ code: "reset_invalid" });
      expect(await auth.requestPasswordReset("shreya@amipi.com")).toBeDefined();
      expect(await auth.requestPasswordReset("shreya@amipi.com")).toBeDefined();
      expect(await auth.requestPasswordReset("shreya@amipi.com")).toBeDefined();
      expect(await auth.requestPasswordReset("shreya@amipi.com")).toBeUndefined();
    });
  });
});
