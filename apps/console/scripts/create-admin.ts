/**
 * Creates an admin invite link from the command line (first setup, or if every admin is locked out).
 *   pnpm create-admin you@amipi.com           # refuses if an active admin already exists
 *   pnpm create-admin you@amipi.com --force   # issue anyway
 * Needs DATABASE_URL, APP_SECRET and APP_URL in the environment.
 */
import { AuthService } from "@reorder/auth";
import { closeDb, getDb } from "@reorder/db";

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const force = args.includes("--force");
  if (!email) throw new Error("Usage: pnpm create-admin you@amipi.com [--force]");
  const { DATABASE_URL, APP_SECRET, APP_URL, ALLOWED_EMAIL_DOMAIN } = process.env;
  if (!DATABASE_URL || !APP_SECRET || !APP_URL) throw new Error("Set DATABASE_URL, APP_SECRET and APP_URL first (see docs/DEPLOY_CPANEL.md).");

  const auth = new AuthService(getDb(DATABASE_URL), { appSecret: APP_SECRET, allowedDomain: ALLOWED_EMAIL_DOMAIN ?? "amipi.com" });
  if (!force && (await auth.hasActiveAdmin())) {
    throw new Error("An active admin already exists. Ask them to invite you from Settings, or rerun with --force.");
  }
  const { token, expiresAt } = await auth.createInvite({ email, role: "admin", createdBy: null });
  console.log(`\nAdmin invite for ${email.toLowerCase()} (expires ${expiresAt.toLocaleString()}):\n\n  ${APP_URL.replace(/\/+$/, "")}/invite/${token}\n`);
}

main()
  .catch((e: Error) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
