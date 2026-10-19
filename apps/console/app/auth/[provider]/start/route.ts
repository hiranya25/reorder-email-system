import { authorizationUrl, encrypt, newOidcRequest } from "@reorder/auth";
import { NextResponse, type NextRequest } from "next/server";
import { OIDC_COOKIE } from "@/lib/server/auth";
import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Sends the person to Microsoft or Google. ?hint=email pre-fills the account picker. */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/auth/[provider]/start">,
) {
  const { provider: id } = await params;
  const env = serverEnv();
  const provider = env.providers.find((p) => p.id === id);
  if (!provider) return NextResponse.redirect(new URL("/login", env.appUrl));
  const req = newOidcRequest(provider.id);
  const hint =
    request.nextUrl.searchParams.get("hint")?.slice(0, 200) || undefined;
  const response = NextResponse.redirect(
    authorizationUrl(
      provider,
      req,
      `${env.appUrl}/auth/${provider.id}/callback`,
      hint,
    ),
  );
  response.cookies.set(
    OIDC_COOKIE,
    encrypt(JSON.stringify(req), env.appSecret),
    {
      httpOnly: true,
      // Lax so the cookie comes back on the provider's top-level redirect.
      sameSite: "lax",
      secure: env.secureCookies,
      path: "/auth",
      maxAge: 10 * 60,
    },
  );
  return response;
}
