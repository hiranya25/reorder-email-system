import "server-only";

import { googleProvider, microsoftProvider, type Provider } from "@reorder/auth";

export interface ServerEnv {
  databaseUrl: string;
  appSecret: string;
  /** Public address of the console, e.g. https://reorder.amipi.com (used in invite links). */
  appUrl: string;
  allowedEmailDomain: string;
  secureCookies: boolean;
  /** "Sign in with Microsoft" / "Sign in with Google", when their keys are set. */
  providers: Provider[];
  /** Email + password + authenticator code. Off once a provider is set, unless PASSWORD_LOGIN=on. */
  passwordLogin: boolean;
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
  const providers: Provider[] = [];
  const e = process.env;
  if (e.MICROSOFT_CLIENT_ID || e.MICROSOFT_CLIENT_SECRET) {
    if (!e.MICROSOFT_CLIENT_ID || !e.MICROSOFT_CLIENT_SECRET) throw new Error("Set both MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET (and MICROSOFT_TENANT_ID).");
    providers.push(microsoftProvider({ clientId: e.MICROSOFT_CLIENT_ID, clientSecret: e.MICROSOFT_CLIENT_SECRET, tenantId: e.MICROSOFT_TENANT_ID }));
  }
  if (e.GOOGLE_CLIENT_ID || e.GOOGLE_CLIENT_SECRET) {
    if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new Error("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
    providers.push(googleProvider({ clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET }));
  }
  const pw = e.PASSWORD_LOGIN?.trim().toLowerCase();
  if (pw && pw !== "on" && pw !== "off") throw new Error("PASSWORD_LOGIN must be on or off.");
  cached = {
    databaseUrl: e.DATABASE_URL!,
    appSecret,
    appUrl,
    allowedEmailDomain: e.ALLOWED_EMAIL_DOMAIN ?? "amipi.com",
    secureCookies: appUrl.startsWith("https://"),
    providers,
    passwordLogin: pw ? pw === "on" : providers.length === 0,
  };
  return cached;
}
