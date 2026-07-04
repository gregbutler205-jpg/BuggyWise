import { NextResponse } from "next/server";
import { checkPassword, createSessionCookieValue, SITE_SESSION_COOKIE, SITE_SESSION_MAX_AGE_SECONDS } from "@/lib/site-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");

  let valid: boolean;
  try {
    valid = checkPassword(password);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  if (!valid) return NextResponse.json({ error: "Wrong password" }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_SESSION_COOKIE, await createSessionCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SITE_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SITE_SESSION_COOKIE);
  return res;
}
