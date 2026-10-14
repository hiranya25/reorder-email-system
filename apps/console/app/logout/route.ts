import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { auth, SESSION_COOKIE } from "@/lib/server/auth";

/** POST only, from the sidebar's sign-out form (same-origin checked below). */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new NextResponse("Forbidden", { status: 403 });
  const jar = await cookies();
  await auth().logout(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
