# PROJECT_MEMORY — dialysis-stock-tracker

Unified memory for all agents. Append new entries at the bottom.

## 2026-10-03: Platform scaffold removed, rebuilt on Supabase Postgres + local login (Claude)

**User decisions** `[stated]`
- Login: was username + password; replaced by Google-only sign-in on 2026-10-03 at the user's request (see Architecture).
- Database: Supabase Postgres.
- UI: keep the existing SPMC navy/crimson/teal glass design. No redesign.
- Git: new commits on top of the existing history. No history rewrite, no force-push.

**Architecture now**
- Client: React 19 + Vite 7 + Tailwind 4 + wouter + tRPC React Query. Sign-in form lives in `client/src/components/DashboardLayout.tsx` (`LoginScreen`).
- Server: Express + tRPC v11. App (no listener) in `server/_core/app.ts`; `server/_core/index.ts` serves it on a port for dev/self-hosting. Auth in `server/_core/auth.ts`.
- Hosting: Vercel project is linked to this GitHub repo (production = `main`, https://dialysis-stock-tracker.vercel.app). `vercel.json` runs `pnpm build:vercel`; `vercel-build.mjs` writes Build Output API v3 to `.vercel/output` (static client + one bundled CommonJS function `api.func` for `/api/*`).
- DB: Drizzle ORM, `postgres` (postgres.js) driver, `prepare: false`. Schema `drizzle/schema.ts`, single migration `drizzle/0000_*.sql`.
- Session: HS256 JWT in httpOnly SameSite=Lax cookie `app_session_id`, 12 h (`SESSION_MS` in `shared/const.ts`).
- `deductFefo` runs in one transaction with `SELECT ... FOR UPDATE`: an over-issue rolls back, concurrent issues cannot double-deduct.
- Sign-in is Google only (user decision 2026-10-03: no username/password). OIDC code flow + PKCE in `server/_core/google.ts`, routes `/api/auth/google/start|callback`. Only addresses in `ADMIN_EMAILS` (user stated: `share@spmcdvo.net`) can sign in and become admins. Needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; redirect URI `https://dialysis-stock-tracker.vercel.app/api/auth/google/callback`. Password login, lockout and the `user:set` script were removed. Columns `passwordHash`, `failedLogins`, `lockedUntil` remain unused.
- Migrations: `migrate.mjs` (drizzle-orm migrator, prepared statements off) runs first in `pnpm build:vercel` on production builds only; preview builds skip it. Connection/login failures let the deploy through; a migration that connects then fails blocks it. `pnpm db:migrate` runs the same script by hand.
- Health check: public `health` procedure (`/api/trpc/health`) returns `{ db, code }` with db = ok | not_configured | not_migrated | auth_failed | unreachable | error. First stop when sign-in fails at the database stage, since Vercel logs are not readable by agents.
- Every tRPC procedure except `health`, `auth.me`, `auth.options`, `auth.logout` requires a session.
- RLS enabled on all 9 tables, no policies: server connects as table owner; Supabase Data API roles get nothing.

**Env**: `DATABASE_URL` (local: Supabase direct or session pooler, port 5432; Vercel: transaction pooler, port 6543), `JWT_SECRET` (32+ chars, server refuses to run without it), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS`, `PORT` (self-hosting only).

**Removed**: the original hosting platform's OAuth client + SDK, its API helpers (LLM, image, voice, maps, data API, heartbeat, notification, storage proxy), its Vite runtime plugin, debug collector, wouter route-collector patch, analytics tag, `template.json`, template demo pages, MySQL migrations, deps `mysql2`, `axios`, `@aws-sdk/*`, `streamdown`.

**Verified 2026-10-03** against a throwaway local Postgres (not Supabase): type-check clean, 26/26 vitest incl. real-DB FEFO/FIFO/lock tests, production build, all tRPC reads/writes over HTTP, browser walk-through of sign-in and all 9 pages at 1440 px, sign-in and dashboard at 390 px. Independent review of the auth + Postgres diff: 2 findings, both fixed. The Vercel function bundle was run standalone (no node_modules) behind a local stand-in for Vercel routing: static files, SPA fallback, tRPC and lockout all work. Not yet observed on Vercel itself.

**Not done / open**
- Before this work, production on Vercel served the server bundle source at `/` and 404 for `/api/*` (Express does not run there unadapted). Fixed by the Vercel build above.
- Vercel env vars `DATABASE_URL` and `JWT_SECRET` are not set by any agent; user must add them.
- Never run against a real Supabase project. No data migrated from the old platform-hosted MySQL database.
- Merged into `main` on 2026-10-03 (fast-forward from `supabase-postgres-local-login`), which triggers the Vercel production deploy. Sign-in on production fails until the env vars, migration and first account exist.
- Git history still shows the 6 original commits under the previous platform's author identity (user chose to keep history).
- `todo.md` is the original build checklist; left in place.
- Known pre-existing issues left untouched: single 290 KB gz JS chunk, `maximum-scale=1` in the viewport meta, 50 MB JSON body limit in `server/_core/index.ts`.

## 2026-10-03: production sign-in blocked by database address (Claude)
- Production health check returned `unreachable` / `ENOTFOUND`: the host in Vercel's `DATABASE_URL` does not resolve from Vercel. Most likely the Supabase Direct connection string (IPv6-only) was used; Vercel needs the Transaction pooler string (port 6543). Only the user can change it (no agent has Vercel access).
- An earlier on-screen hint blamed a missing migration; that was a guess and it was wrong. The sign-in screen now names the actual database state.
- No migration has reached the production database yet. Once `DATABASE_URL` is correct, the next production deploy applies them automatically.
- Resolved 2026-10-03 05:2x UTC: user corrected `DATABASE_URL` in Vercel; redeploy `99a8da1` ran the migrations in the build and the health check returns `ok`. Google sign-in by the user not yet confirmed.

## 2026-10-03: Loading performance improvements (Codex)
- [stated] User requested fast, immediate loading for the production transactions page.
- Implemented lazy page imports, current-route preloading alongside authentication, and sidebar hover/focus/touch preloading. Reports/chart code no longer downloads on transactions.
- Entry JavaScript: 290.72 KB gzip before, 152.45 KB after (48% reduction). Transactions and shared chunks add about 20 KB gzip.
- Sign-in options now batch with the first auth request. Session cache: 60 seconds. Data cache: 15 seconds, existing mutation invalidation retained. Logout clears query cache.
- Fonts load without blocking initial rendering. HTML includes an immediate loading shell.
- Verified: TypeScript check, Vite production build, Vercel output assembly, 30 unit tests passed. 12 real-DB tests skipped without a test database. Browser-harness confirmed transactions renders with mock authenticated API data and does not download Reports.
- Production unchanged. Deployment approval requested and pending.
