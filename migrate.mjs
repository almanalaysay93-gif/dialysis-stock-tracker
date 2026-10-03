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
  const source = error?.cause ?? error;
  const code = String(source?.code ?? "no code");
  console.error(`[migrate] failed (${code}): ${source?.message ?? source}`);
  // Could not connect or log in: nothing was changed and the app cannot work
  // against this database whichever build is live. On Vercel, let the deploy
  // through so the health check reflects the current settings. A migration
  // that connected and then failed was rolled back and does block the deploy,
  // so new code never ships ahead of its schema.
  const noConnection =
    /^(ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|EAI_AGAIN|CONNECT_TIMEOUT|CONNECTION_CLOSED|CONNECTION_ENDED|28P01|28000|3D000)$/.test(
      code
    ) || /tenant or user not found/i.test(String(source?.message ?? ""));
  if (onVercel && noConnection) console.warn("[migrate] database not reachable; continuing the build without migrating");
  else process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
