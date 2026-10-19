import {
  AuthError,
  completeSignIn,
  decrypt,
  encrypt,
  OidcError,
  type OidcRequest,
} from "@reorder/auth";
import { NextResponse, type NextRequest } from "next/server";
import {
  auth,
  OIDC_COOKIE,
  requestMeta,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Microsoft or Google sends the person back here with a one-time code. */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/auth/[provider]/callback">,
) {
  const { provider: id } = await params;
  const env = serverEnv();
  const fail = (message: string) => {
    const url = new URL("/login", env.appUrl);
    // Encrypted, so nobody can craft a sign-in link that shows their own text.
    url.searchParams.set("e", encrypt(message, env.appSecret));
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: OIDC_COOKIE, path: "/auth" });
    return res;
  };

  const provider = env.providers.find((p) => p.id === id);
  if (!provider) return fail("This sign-in option isn't set up.");
  const q = request.nextUrl.searchParams;
  // Cancelled or refused at the provider.
  if (q.get("error"))
    return fail(
      q.get("error") === "access_denied"
        ? "Sign-in was cancelled."
        : `${provider.label} couldn't sign you in. Please try again.`,
    );

  let req: OidcRequest;
  try {
    req = JSON.parse(
      decrypt(request.cookies.get(OIDC_COOKIE)?.value ?? "", env.appSecret),
    ) as OidcRequest;
  } catch {
    return fail(
      "The sign-in took too long or was started in another browser. Please try again.",
    );
  }

  try {
    const identity = await completeSignIn(provider, req, {
      code: q.get("code") ?? "",
      state: q.get("state") ?? "",
      redirectUri: `${env.appUrl}/auth/${provider.id}/callback`,
      allowedDomain: env.allowedEmailDomain,
    });
    const { sessionToken } = await auth().ssoLogin(
      identity,
      await requestMeta(),
    );
    const res = NextResponse.redirect(new URL("/campaigns", env.appUrl));
    res.cookies.delete({ name: OIDC_COOKIE, path: "/auth" });
    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.secureCookies,
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return res;
  } catch (e) {
    if (e instanceof OidcError || e instanceof AuthError)
      return fail(e.message);
    console.error("Sign-in failed", e);
    return fail(`${provider.label} sign-in failed. Please try again.`);
  }
}
