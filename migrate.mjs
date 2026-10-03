// Applies pending database migrations from ./drizzle.
//   pnpm db:migrate        by hand, using DATABASE_URL from .env
//   pnpm build:vercel      automatically, in Vercel's production build
// Works through any Supabase connection string, including the transaction
// pooler (port 6543), because prepared statements are turned off.
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const onVercel = Boolean(process.env.VERCEL);

// Preview builds must never change the production database with unmerged schema.
if (onVercel && process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] skipped: ${process.env.VERCEL_ENV} build`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  if (onVercel) {
    // The app reports "not_configured" on its health check; let the deploy through.
    console.warn("[migrate] skipped: DATABASE_URL is not set in this Vercel environment");
    process.exit(0);
  }
  console.error("[migrate] DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 15, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("[migrate] database is up to date");
} catch (error) {
  // Code only: the full error can carry the connection string's host.
  const source = error?.cause ?? error;
  console.error(`[migrate] failed (${source?.code ?? "no code"}): ${source?.message ?? source}`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
