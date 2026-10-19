/**
 * Creates the first admin from the command line (first setup, or if every admin is locked out).
 *   pnpm create-admin                     # asks for name, username, email and password
 *   pnpm create-admin --force             # add another admin even though one exists
 *   pnpm create-admin --invite you@amipi.com   # print a one-time link instead (e.g. for Microsoft/Google sign-in)
 * Needs DATABASE_URL, APP_SECRET and APP_URL in the environment. The password is typed hidden and
 * never appears in the shell history.
 */
import { AuthService, PASSWORD_RULE, passwordProblem, usernameProblem } from "@reorder/auth";
import { closeDb, getDb } from "@reorder/db";
import { createInterface } from "node:readline";

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Print the question, then swallow what's typed.
      const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.includes(question)) write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function askUntil(question: string, check: (v: string) => string | undefined, hidden = false): Promise<string> {
  for (;;) {
    const v = await ask(question, hidden);
    const problem = check(v);
    if (!problem) return v;
    console.log(`  ${problem}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const inviteIdx = args.indexOf("--invite");
  const { DATABASE_URL, APP_SECRET, APP_URL, ALLOWED_EMAIL_DOMAIN } = process.env;
  if (!DATABASE_URL || !APP_SECRET || !APP_URL) throw new Error("Set DATABASE_URL, APP_SECRET and APP_URL first (see docs/DEPLOY_CPANEL.md).");
  const domain = ALLOWED_EMAIL_DOMAIN ?? "amipi.com";
  const code = process.env.AUTHENTICATOR_CODE?.trim().toLowerCase() === "on";
  const auth = new AuthService(getDb(DATABASE_URL), { appSecret: APP_SECRET, allowedDomain: domain, requireAuthenticator: code });
  if (!force && (await auth.hasActiveAdmin())) {
    throw new Error("An active admin already exists. Ask them to add you in Settings → Users, or rerun with --force.");
  }

  if (inviteIdx >= 0) {
    const email = args[inviteIdx + 1];
    if (!email) throw new Error("Usage: pnpm create-admin --invite you@amipi.com");
    const { token, expiresAt } = await auth.createInvite({ email, role: "admin", createdBy: null });
    console.log(`\nAdmin invite for ${email.toLowerCase()} (expires ${expiresAt.toLocaleString()}):\n\n  ${APP_URL.replace(/\/+$/, "")}/invite/${token}\n`);
    return;
  }

  console.log(`\nCreate the first admin.${code ? " They'll set up an authenticator app at first sign-in." : ""}\n`);
  const name = await askUntil("Full name: ", (v) => (v ? undefined : "Enter a name."));
  const username = await askUntil("Username (optional, press Enter to skip): ", (v) => (v ? usernameProblem(v.toLowerCase()) : undefined));
  const email = await askUntil(`Email (@${domain}): `, (v) => (v.toLowerCase().endsWith(`@${domain}`) ? undefined : `Use an @${domain} address.`));
  console.log(`Password rule: ${PASSWORD_RULE}`);
  const password = await askUntil("Password (hidden): ", passwordProblem, true);
  const again = await ask("Type the password again: ", true);
  if (again !== password) throw new Error("The two passwords don't match. Nothing was created.");

  const user = await auth.createUser(null, { name, username, email, role: "admin", password });
  console.log(`\nAdmin ${user.name} created. Sign in at ${APP_URL.replace(/\/+$/, "")}/login with ${user.username ?? user.email} and your password.\n`);
}

main()
  .catch((e: Error) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
