# Dialysis Stock Tracker

Consumables inventory for the SPMC Kidney and Transplant Institute dialysis unit: item catalog, lot/batch tracking with FEFO issue, stock in/out ledger, per-session consumption, purchase orders, delivery calendar, FIFO rotation view, and consumption reports.

Stack: React 19 + Vite + Tailwind 4 (client), Express + tRPC (server), Drizzle ORM on Supabase Postgres.

## Setup

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env        # then fill in DATABASE_URL and JWT_SECRET
pnpm db:migrate             # creates the tables in your Supabase database
pnpm user:set admin "Head Nurse" admin   # first account; prompts for a password
pnpm seed                   # optional: sample items, batches and sessions
pnpm dev                    # http://localhost:3000
```

`DATABASE_URL` comes from the Supabase dashboard under **Connect**. Use the direct connection or the session pooler (port 5432). The direct connection is IPv6 unless the project has the IPv4 add-on; on an IPv4-only network use the session pooler.

## Accounts

Sign-in is username and password. There is no self-registration.

- Add a user: `pnpm user:set <username> "<display name>"`
- Add an admin: `pnpm user:set <username> "<display name>" admin`
- Reset a password: run `pnpm user:set <username>` again for an existing username

Passwords need 12 or more characters and are stored as scrypt hashes. A username is locked for 15 minutes after 5 failed attempts. Sessions last 12 hours.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm build` | Builds client to `dist/public` and server to `dist/index.js` |
| `pnpm start` | Runs the production build |
| `pnpm check` | TypeScript type-check |
| `pnpm test` | Vitest. Tests marked "real DB" run only when `DATABASE_URL` is set, and they write to that database, so point it at a non-production one |
| `pnpm db:push` | Generate a migration from `drizzle/schema.ts` and apply it |
| `pnpm db:migrate` | Apply existing migrations |

## Database access

The server connects to Postgres directly with `DATABASE_URL`. Row level security is enabled on every table with no policies, so the Supabase Data API (publishable/anon key) cannot read or write any of them. Keep `DATABASE_URL` and `JWT_SECRET` on the server only.

## Deploying

Any Node host works. Set `DATABASE_URL`, `JWT_SECRET` and `PORT`, run `pnpm build`, then `pnpm start`. Serve it over HTTPS so the session cookie is marked `Secure`.
