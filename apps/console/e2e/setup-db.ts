/**
 * Fresh e2e database with one fully set-up admin. Writes the admin's credentials (test-only)
 * to e2e/.auth.json so tests can sign in through the real UI.
 */
import { AuthService, timeStep, totpCode } from "@reorder/auth";
import { auditLogs, closeDb, getDb, invites, loginAttempts, sessions, users } from "@reorder/db";
import { runMigrations } from "@reorder/db/migrate";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL!;
const ADMIN = { email: "owner@amipi.com", password: "Restock-Console-E2E-2026", name: "Owner" };

async function main() {
  await runMigrations(url);
  const db = getDb(url);
  for (const t of [auditLogs, sessions, invites, loginAttempts, users]) await db.delete(t);
  const auth = new AuthService(db, { appSecret: process.env.APP_SECRET!, allowedDomain: "amipi.com" });
  const { token } = await auth.createInvite({ email: ADMIN.email, role: "admin", createdBy: null });
  const { sessionToken } = await auth.acceptInvite(token, { name: ADMIN.name, password: ADMIN.password });
  const { secret } = await auth.startTotpSetup(sessionToken);
  // Use the previous time step so the UI sign-in can use the current one.
  await auth.confirmTotpSetup(sessionToken, totpCode(secret, timeStep() - 1));
  writeFileSync(join(__dirname, ".auth.json"), JSON.stringify({ ...ADMIN, secret }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
