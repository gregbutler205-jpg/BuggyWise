import { createClient } from "@tursodatabase/serverless/compat";
import { drizzle } from "drizzle-orm/libsql";
import type { Client } from "@libsql/core/api";
import * as schema from "./schema";

// Remote Turso database — every query is a network call now, so the entire
// data layer is async (unlike the old better-sqlite3 driver, which was
// synchronous). See db/index.ts git history if you ever need to go back to
// local-only SQLite.
//
// This runs eagerly at import time (below), so a malformed value here fails
// the whole build/boot with a clear message instead of @libsql/client's
// generic "TypeError: Invalid URL", which gives no hint which var is wrong.
const dbUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!dbUrl || !authToken) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set (in app/.env.local, or as Vercel project env vars)");
}
try {
  new URL(dbUrl);
} catch {
  throw new Error(
    `TURSO_DATABASE_URL is not a valid URL (got ${dbUrl.length} chars, starts "${dbUrl.slice(0, 12)}"). ` +
      `Check for stray quotes/whitespace, or that the whole value pasted correctly — expected shape: ` +
      `libsql://<db-name>-<org-slug>.<region>.turso.io`
  );
}

// Next.js dev server reloads modules; keep one connection per process.
const globalForDb = globalThis as unknown as { __bwDb?: ReturnType<typeof createDb> };

function createDb() {
  // Using @tursodatabase/serverless (via its drizzle-compatible /compat
  // export) instead of @libsql/client directly. The latter's internal
  // Hrana-over-HTTP transport corrupted its own Authorization header under
  // concurrent/repeated requests in production on Vercel — intermittent,
  // not reproducible with a handful of local requests, symptom:
  // `Headers.set: "Bearer <token> <token>" is an invalid header value`.
  // concurrency:1 (@libsql/client's own mitigation option) did NOT fix it.
  // @tursodatabase/serverless is a from-scratch, plain-fetch()-based
  // serverless driver built to avoid exactly this class of bug.
  const client = createClient({ url: dbUrl!, authToken: authToken! });
  // drizzle-orm/libsql's stable release types against @libsql/core's Client,
  // which declares a `reconnect()` method this driver's compat layer doesn't
  // implement — but drizzle-orm's actual code never calls it (grepped the
  // package: zero references), so this is a type-level-only gap, safe to
  // cast around without a major drizzle-orm version bump.
  return drizzle(client as unknown as Client, { schema });
}

export const db = globalForDb.__bwDb ?? (globalForDb.__bwDb = createDb());
export * from "./schema";
