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
});
