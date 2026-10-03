// Create a staff account, or reset the password of an existing one.
//   pnpm user:set <username> "<display name>" [admin]
// The password is read from the terminal so it never lands in shell history.
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { hashPassword } from "./server/_core/auth";
import * as db from "./server/db";

const [rawUsername, name, role] = process.argv.slice(2);
const username = rawUsername?.trim().toLowerCase();

if (!username || !/^[a-z0-9._-]{3,64}$/.test(username)) {
  console.error('Usage: pnpm user:set <username> "<display name>" [admin]');
  console.error("Username: 3-64 characters, letters, digits, dot, dash or underscore.");
  process.exit(1);
}
if (role !== undefined && role !== "admin") {
  console.error(`Unknown role "${role}". Leave it out for a regular user, or pass "admin".`);
  process.exit(1);
}
if (!(await db.getDb())) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question(`Password for ${username} (12+ characters): `);
rl.close();
if (password.length < 12) {
  console.error("Password too short. Use at least 12 characters.");
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const existing = await db.getUserByUsername(username);
if (existing) {
  await db.setUserPassword(existing.id, passwordHash);
  console.log(`Password reset for ${username}.`);
} else {
  await db.createUser({ username, passwordHash, name: name || username, role: role === "admin" ? "admin" : "user" });
  console.log(`Created ${role === "admin" ? "admin" : "user"} ${username}.`);
}
process.exit(0);
