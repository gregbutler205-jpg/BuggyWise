import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Remote Turso database — every query is a network call now, so the entire
// data layer is async (unlike the old better-sqlite3 driver, which was
// synchronous). See db/index.ts git history if you ever need to go back to
// local-only SQLite.
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in app/.env.local");
}

// Next.js dev server reloads modules; keep one connection per process.
const globalForDb = globalThis as unknown as { __bwDb?: ReturnType<typeof createDb> };

function createDb() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  return drizzle(client, { schema });
}

export const db = globalForDb.__bwDb ?? (globalForDb.__bwDb = createDb());
export * from "./schema";
