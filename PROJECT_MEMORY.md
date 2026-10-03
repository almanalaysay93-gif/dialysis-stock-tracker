# PROJECT_MEMORY — dialysis-stock-tracker

Unified memory for all agents. Append new entries at the bottom.

## 2026-10-03: Platform scaffold removed, rebuilt on Supabase Postgres + local login (Claude)

**User decisions** `[stated]`
- Login: username + password (local accounts). No third-party auth.
- Database: Supabase Postgres.
- UI: keep the existing SPMC navy/crimson/teal glass design. No redesign.
- Git: new commits on top of the existing history. No history rewrite, no force-push.

**Architecture now**
- Client: React 19 + Vite 7 + Tailwind 4 + wouter + tRPC React Query. Sign-in form lives in `client/src/components/DashboardLayout.tsx` (`LoginScreen`).
- Server: Express + tRPC v11. App (no listener) in `server/_core/app.ts`; `server/_core/index.ts` serves it on a port for dev/self-hosting. Auth in `server/_core/auth.ts`.
- Hosting: Vercel project is linked to this GitHub repo (production = `main`, https://dialysis-stock-tracker.vercel.app). `vercel.json` runs `pnpm build:vercel`; `vercel-build.mjs` writes Build Output API v3 to `.vercel/output` (static client + one bundled CommonJS function `api.func` for `/api/*`).
- DB: Drizzle ORM, `postgres` (postgres.js) driver, `prepare: false`. Schema `drizzle/schema.ts`, single migration `drizzle/0000_*.sql`.
- Auth: scrypt hashes (N=2^15, r=8, p=3, params stored in the hash), HS256 JWT in httpOnly SameSite=Lax cookie `app_session_id`, 12 h sessions (`SESSION_MS` in `shared/const.ts`), 5 wrong passwords in a row lock the account for 15 min (`users.failedLogins` / `users.lockedUntil`, so it holds across serverless instances). Wrong password, unknown username and locked username return one identical error.
- `deductFefo` runs in one transaction with `SELECT ... FOR UPDATE`: an over-issue rolls back, concurrent issues cannot double-deduct.
- Every tRPC procedure except `auth.me`, `auth.login`, `auth.logout` requires a session.
- RLS enabled on all 9 tables, no policies: server connects as table owner; Supabase Data API roles get nothing.
- Accounts are created with `pnpm user:set <username> "<name>" [admin]` (`set-user.ts`). No self-registration, no user-management UI.

**Env**: `DATABASE_URL` (local: Supabase direct or session pooler, port 5432; Vercel: transaction pooler, port 6543), `JWT_SECRET` (32+ chars, server refuses to run without it), `PORT` (self-hosting only).

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
