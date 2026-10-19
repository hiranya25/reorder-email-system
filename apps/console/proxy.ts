import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/invite/"];

/**
 * Fast first gate: no session cookie means straight to sign-in.
 * The real check (valid, unexpired, user enabled, role) happens on the server in each page and action.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (request.cookies.has("rc_session")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|ico|css|js)$).*)"],
};
