import "server-only";

import { AuthError, AuthService, type RequestMeta, type SafeUser } from "@reorder/auth";
import { getDb, type Role } from "@reorder/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverEnv } from "./env";

export const SESSION_COOKIE = "rc_session";
export const PENDING_COOKIE = "rc_pending";
/** Carries freshly made recovery codes to the page that shows them once. */
export const RECOVERY_COOKIE = "rc_recovery";
/** State, nonce and PKCE verifier between leaving for Microsoft/Google and coming back. */
export const OIDC_COOKIE = "rc_oidc";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

let service: AuthService | undefined;

export function auth(): AuthService {
  if (!service) {
    const env = serverEnv();
    service = new AuthService(getDb(env.databaseUrl), { appSecret: env.appSecret, allowedDomain: env.allowedEmailDomain });
  }
  return service;
}

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  return { ip, userAgent: h.get("user-agent") };
}

export async function setCookie(name: string, value: string, maxAgeSeconds: number) {
  (await cookies()).set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv().secureCookies,
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearCookie(name: string) {
  (await cookies()).delete(name);
}

export async function currentUser(): Promise<SafeUser | undefined> {
  return auth().getSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For pages and actions: the signed-in user, or a redirect to sign-in. Optionally limited to roles. */
export async function requireUser(roles?: Role[]): Promise<SafeUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/campaigns?denied=1");
  return user;
}

/** Password sign-in is turned off once Microsoft or Google sign-in is set up (unless PASSWORD_LOGIN=on). */
export function assertPasswordLogin() {
  if (!serverEnv().passwordLogin) throw new AuthError("invalid_credentials", "Sign in with Microsoft or Google instead.");
}

/** Turns known sign-in errors into a message for the form; anything else is rethrown. */
export function formError(e: unknown): string {
  if (e instanceof AuthError) return e.message;
  throw e;
}
