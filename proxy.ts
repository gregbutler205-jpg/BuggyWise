import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SITE_SESSION_COOKIE, verifySessionCookieValue } from "@/lib/site-auth";

// "just me" access gate (spec §10 phasing — real user accounts are Phase 2).
// Renamed from middleware.ts to proxy.ts per Next.js 16.
export async function proxy(request: NextRequest) {
  const cookie = request.cookies.get(SITE_SESSION_COOKIE)?.value;
  if (await verifySessionCookieValue(cookie)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|brand|manifest.webmanifest|login|api/login).*)"],
};
