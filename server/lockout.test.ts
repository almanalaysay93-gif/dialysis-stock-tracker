import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb, getUserByUsername, recordFailedLogin, recordSignIn } from "./db";

const TEST_DB = process.env.DATABASE_URL;

describe("failed sign-in lock (real DB)", () => {
  it.skipIf(!TEST_DB)(
    "locks on the 5th wrong password in a row and clears on sign-in",
    async () => {
      const db = await getDb();
      if (!db) return;
      const username = "__lock_test__";
      await db.delete(users).where(eq(users.username, username));
      const [{ id }] = await db
        .insert(users)
        .values({ username, passwordHash: "x" })
        .returning({ id: users.id });

      for (let i = 0; i < 4; i++) await recordFailedLogin(id, 5, 15);
      let row = (await getUserByUsername(username))!;
      expect(row.failedLogins).toBe(4);
      expect(row.lockedUntil).toBeNull();

      await recordFailedLogin(id, 5, 15);
      row = (await getUserByUsername(username))!;
      expect(row.failedLogins).toBe(0);
      const minutesLeft = (row.lockedUntil!.getTime() - Date.now()) / 60_000;
      expect(minutesLeft).toBeGreaterThan(14);
      expect(minutesLeft).toBeLessThanOrEqual(15);

      await recordSignIn(id);
      row = (await getUserByUsername(username))!;
      expect(row.failedLogins).toBe(0);
      expect(row.lockedUntil).toBeNull();

      // Cleanup
      await db.delete(users).where(eq(users.id, id));
    },
    30000
  );
});
