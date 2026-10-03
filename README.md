# Dialysis Stock Tracker

Consumables inventory for the SPMC Kidney and Transplant Institute dialysis unit: item catalog, lot/batch tracking with FEFO issue, stock in/out ledger, per-session consumption, purchase orders, delivery calendar, FIFO rotation view, and consumption reports.

Stack: React 19 + Vite + Tailwind 4 (client), Express + tRPC (server), Drizzle ORM on Supabase Postgres.

## Setup

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env        # then fill in DATABASE_URL and JWT_SECRET
pnpm db:migrate             # creates the tables in your Supabase database
pnpm seed                   # optional: sample items, batches and sessions
pnpm dev                    # http://localhost:3000
```

`DATABASE_URL` comes from the Supabase dashboard under **Connect**. Use the direct connection or the session pooler (port 5432). The direct connection is IPv6 unless the project has the IPv4 add-on; on an IPv4-only network use the session pooler.

## Sign-in

Sign-in is Google only. Any Google address listed in `ADMIN_EMAILS` (comma-separated, for example `share@spmcdvo.net`) can sign in and gets an admin account on first use. Every other Google account is refused, and Google must report the address as verified. There are no usernames or passwords. Sessions last 12 hours.

To let another person in, add their Google address to `ADMIN_EMAILS` and redeploy. Everyone on the list is an admin.

Setup:

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**. If asked, configure the consent screen first.
2. Add the authorized redirect URI `https://dialysis-stock-tracker.vercel.app/api/auth/google/callback` (and `http://localhost:3000/api/auth/google/callback` for local use). Leave Authorized JavaScript origins empty.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `ADMIN_EMAILS` in `.env` and in Vercel's environment variables, then redeploy.

If the consent screen is set to Internal (Google Workspace only), the admin address must belong to that Workspace.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm build` | Builds client to `dist/public` and server to `dist/index.js` |
| `pnpm start` | Runs the production build |
| `pnpm build:vercel` | Builds the Vercel deployment into `.vercel/output` (Vercel runs this itself) |
| `pnpm check` | TypeScript type-check |
| `pnpm test` | Vitest. Tests marked "real DB" run only when `DATABASE_URL` is set, and they write to that database, so point it at a non-production one |
| `pnpm db:push` | Generate a migration from `drizzle/schema.ts` and apply it |
| `pnpm db:migrate` | Apply existing migrations by hand (Vercel production deploys do this automatically) |

## Database access

The server connects to Postgres directly with `DATABASE_URL`. Row level security is enabled on every table with no policies, so the Supabase Data API (publishable/anon key) cannot read or write any of them. Keep `DATABASE_URL` and `JWT_SECRET` on the server only.

## Deploying on Vercel

The repo is set up for Vercel: `vercel.json` runs `pnpm build:vercel`, which applies pending database migrations, builds the client and bundles the API into one function, written to `.vercel/output` by `vercel-build.mjs`.

1. In the Vercel project, open **Settings → Environment Variables** and add:
   - `DATABASE_URL`: the Supabase **Transaction pooler** string (port 6543), from the Supabase dashboard under **Connect**. Do not use the **Direct connection** string here: it is IPv6-only and Vercel cannot reach it, which shows up as `unreachable` / `ENOTFOUND` on the health check.
   - `JWT_SECRET`: 32 or more random characters.
2. Add the Google variables from the Sign-in section.
3. Redeploy. Environment variable changes only apply to new deployments.

Every production deploy runs the migrations first, so the tables are created and kept up to date without any manual step. Preview deploys never touch the database. If a migration connects and then fails, the deploy is stopped and the previous version stays live.

### Health check

`https://<your-domain>/api/trpc/health` reports the database state:

| `db` | Meaning |
|---|---|
| `ok` | Connected and the schema is current |
| `not_configured` | `DATABASE_URL` is not set |
| `unreachable` | The host cannot be found or reached; check the address in `DATABASE_URL` |
| `auth_failed` | The database rejected the username or password |
| `not_migrated` | Connected, but the tables are missing or out of date |
| `error` | Something else; see the `code` field |

## Deploying elsewhere

Any Node host works. Set `DATABASE_URL`, `JWT_SECRET` and `PORT`, run `pnpm build`, then `pnpm start`. Serve it over HTTPS so the session cookie is marked `Secure`.
