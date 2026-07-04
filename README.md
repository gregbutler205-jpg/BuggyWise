# BuggyWise 🐞🛒

*Search smart. Save big.* Compare grocery prices across your local stores —
built from the spec in `buggywise-spec.md`.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

The database is hosted on **Turso** (libSQL) — see `.env.example` for the two
required variables. Schema lives in `db/schema.ts`; `npm run db:push` syncs it
to Turso. Already seeded with your Walmart purchase history.

## Configure (app/.env.local)

| Key | What it unlocks |
|-----|-----------------|
| `ANTHROPIC_API_KEY` | Photo list parsing, smarter item-name parsing, LLM match ranking. Without it, typed/pasted lists use a regex parser and matching is heuristic-only. |
| `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` | Kroger price adapter — live prices + ZIP store search |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Required — the app has no local-database fallback |

After adding the Anthropic key, upgrade the seed import's name parsing:

```bash
npm run seed -- --llm --reset
```

## Scripts

- `npm run seed` — import `../Walmart_Grocery_Price_Comparison.xlsx` (use `-- --reset` to reimport, `-- --llm` for Claude-assisted name parsing)
- `npm run db:push` — sync schema to Turso
- `npm run db:studio` — browse the database
- `npm run icons` — regenerate app icons from `public/brand/icon-source.png`

## What's here (Phase 1 core slice)

- **Seed import** — 409 Walmart products, 843 price observations (Nov 2025–Jun 2026), >3x price swings flagged to the Review tab, auto-proposed "Weekly Staples" list
- **List capture** — type/paste or photo → parsed items → review screen (edit, brand preference: any/specific/don't substitute)
- **Matching engine** — top-5 candidates per store, unit-price normalization ($/oz, $/fl oz, $/ct), lowest-unit-price-within-score-window selection, alternates kept, LLM assist + cache
- **Scenarios** — one-stop vs multi-store splits, store subtotals, grand total, savings vs baseline, marginal savings, savings-by-item table, confidence icons (🟢🟡🟠🔴)
- **Trip checklist** — tap to check off, shopping route with map links, share (Web Share API), print
- **Manual prices** — add shelf/receipt prices at any store; every entry is appended to price history
- **Stores** — manual add, My Stores defaults, per-trip store selection

## Still to come (per spec roadmap)

Kroger API + Flipp adapters, ZIP-code store discovery, trip optimizer
(gas cost / savings-per-mile / thresholds), receipt-photo import, offline
service worker, store groups.

## Architecture notes

- DB is Turso (libSQL) via Drizzle ORM (`drizzle-orm/libsql`) — every query is a
  network call, so `db/index.ts` and everything downstream is fully `async`.
  Schema is SQLite-flavored and portable to hosted Postgres later if needed.
- `prices` is **append-only**: it is the price history — **except**
  `source = 'kroger_api'` rows, which are a bounded cache (Kroger's terms
  prohibit permanent storage of their API responses). See the file-level
  comment in `lib/adapters/kroger.ts`.
- All Claude calls are server-side only; the key never reaches the client.
