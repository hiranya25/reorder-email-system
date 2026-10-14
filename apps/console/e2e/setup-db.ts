/**
 * Fresh e2e database with one fully set-up admin. Writes the admin's credentials (test-only)
 * to e2e/.auth.json so tests can sign in through the real UI.
 */
import { AuthService, timeStep, totpCode } from "@reorder/auth";
import { appSettings, auditLogs, campaigns, catalogs, closeDb, getDb, invites, loginAttempts, productEdits, rememberedContacts, sessions, users } from "@reorder/db";
import { runMigrations } from "@reorder/db/migrate";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL!;
const PEOPLE = {
  admin: { email: "owner@amipi.com", password: "Restock-Console-E2E-2026", name: "Owner", role: "admin" as const },
  reviewer: { email: "shreya@amipi.com", password: "Second-Approver-E2E-2026", name: "Shreya", role: "reviewer" as const },
  viewer: { email: "founder@amipi.com", password: "Read-Only-Access-E2E-2026", name: "Founder", role: "viewer" as const },
};

async function main() {
  await runMigrations(url);
  const db = getDb(url);
  for (const t of [campaigns, catalogs, productEdits, rememberedContacts, appSettings, auditLogs, sessions, invites, loginAttempts, users]) await db.delete(t);
  const auth = new AuthService(db, { appSecret: process.env.APP_SECRET!, allowedDomain: "amipi.com" });
  const out: Record<string, unknown> = {};
  for (const [key, p] of Object.entries(PEOPLE)) {
    const { token } = await auth.createInvite({ email: p.email, role: p.role, createdBy: null });
    const { sessionToken } = await auth.acceptInvite(token, { name: p.name, password: p.password });
    const { secret } = await auth.startTotpSetup(sessionToken);
    // Use the previous time step so the UI sign-in can use the current one.
    await auth.confirmTotpSetup(sessionToken, totpCode(secret, timeStep() - 1));
    out[key] = { ...p, secret };
  }
  writeFileSync(join(__dirname, ".auth.json"), JSON.stringify(out));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
