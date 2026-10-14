// cPanel "Setup Node.js App" startup file. Runs the self-contained Next.js server built by
// `pnpm build` + scripts/prepare-standalone.sh. See docs/DEPLOY_CPANEL.md.
process.env.NODE_ENV = process.env.NODE_ENV || "production";
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./.next/standalone/apps/console/server.js");
