/**
 * Single-password site gate for the "just me" access tier (no user-accounts
 * system exists yet — that's Phase 2 per spec §10). Not enterprise auth:
 * one shared password, one signed cookie, no per-user sessions.
 *
 * Uses Web Crypto (available in both the Edge and Node runtimes) instead of
 * node:crypto so this works from proxy.ts regardless of its runtime.
 */
const COOKIE_NAME = "bw_session";
const SESSION_DAYS = 180;

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set in app/.env.local");
  return secret;
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) throw new Error("SITE_PASSWORD is not set in app/.env.local");
  return candidate === expected;
}

/** Signed cookie value: "<expiresAtMs>.<hmac>" */
export async function createSessionCookieValue(): Promise<string> {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const sig = await hmac(sessionSecret(), String(expiresAt));
  return `${expiresAt}.${sig}`;
}

export async function verifySessionCookieValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [expiresAtStr, sig] = value.split(".");
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || !sig || Date.now() > expiresAt) return false;
  const expectedSig = await hmac(sessionSecret(), String(expiresAt));
  return sig === expectedSig;
}

export const SITE_SESSION_COOKIE = COOKIE_NAME;
export const SITE_SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;
