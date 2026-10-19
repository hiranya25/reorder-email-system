import "server-only";

export interface ServerEnv {
  databaseUrl: string;
  appSecret: string;
  /** Public address of the console, e.g. https://reorder.amipi.com (used in invite links). */
  appUrl: string;
  allowedEmailDomain: string;
  secureCookies: boolean;
}

let cached: ServerEnv | undefined;

/** Reads and checks server settings once. Missing values fail loudly with what to set. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const missing = ["DATABASE_URL", "APP_SECRET", "APP_URL"].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing server settings: ${missing.join(", ")}. See docs/DEPLOY_CPANEL.md.`);
  const appSecret = process.env.APP_SECRET!;
  if (appSecret.length < 32) throw new Error("APP_SECRET must be at least 32 characters.");
  const appUrl = process.env.APP_URL!.replace(/\/+$/, "");
  cached = {
    databaseUrl: process.env.DATABASE_URL!,
    appSecret,
    appUrl,
    allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN ?? "amipi.com",
    secureCookies: appUrl.startsWith("https://"),
  };
  return cached;
}
