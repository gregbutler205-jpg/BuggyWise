import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
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
  // concurrency: 1 forces requests through the client's internal HTTP
  // transport one at a time. Without this, concurrent requests (e.g. many
  // <Link> prefetches firing at once) corrupt the shared client's
  // Authorization header — producing "Bearer <token> <token>" and a hard
  // 500. Reproduced locally with 8 parallel requests; a custom `fetch`
  // (tried: undici) doesn't fix it and breaks in a different way (realm
  // mismatch with @libsql/client's internal Request object), so this is
  // the correctness-over-throughput fix until upstream resolves it.
  const client = createClient({ url: dbUrl!, authToken: authToken!, concurrency: 1 });
  return drizzle(client, { schema });
}

export const db = globalForDb.__bwDb ?? (globalForDb.__bwDb = createDb());
export * from "./schema";
