import { COOKIE_NAME, SESSION_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import * as db from "../db";
import { ENV } from "./env";

// ── Password hashing (scrypt, Node stdlib) ───────────────────────────────────
// OWASP-listed scrypt setting: N=2^15, r=8, p=3. The parameters are stored in
// each hash, so they can be raised later without invalidating old passwords.
const SCRYPT = { N: 2 ** 15, r: 8, p: 3 };
const KEY_LENGTH = 64;

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keylen, { ...options, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("hex"), key.toString("hex")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

// ── Failed sign-in throttle ──────────────────────────────────────────────────
// Only existing usernames are tracked, so the map cannot grow past the number
// of accounts and cannot be flushed by flooding made-up usernames.
// ponytail: in-memory and per process, so a restart clears it. Move the counter
// into the users table if the app ever runs on more than one instance.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

function isLockedOut(username: string): boolean {
  const entry = failures.get(username);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    failures.delete(username);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(username: string) {
  const now = Date.now();
  const entry = failures.get(username);
  if (entry && entry.resetAt > now) entry.count += 1;
  else failures.set(username, { count: 1, resetAt: now + LOCK_MS });
}

// Computed at startup so the first unknown-username request is not slower than later ones.
const dummyHash = hashPassword(randomBytes(16).toString("hex"));

/**
 * Returns the signed-in user, or null for a wrong password, an unknown
 * username or a locked username. All three run one hash check and look the
 * same to the caller, so neither the response nor its timing reveals which
 * usernames exist.
 */
export async function checkCredentials(username: string, password: string) {
  const user = await db.getUserByUsername(username);
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || isLockedOut(username)) return null;
  if (!ok) {
    recordFailure(username);
    return null;
  }
  failures.delete(username);
  return user;
}

// ── Session cookie (signed JWT) ──────────────────────────────────────────────
export function assertSessionSecret() {
  if (ENV.cookieSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 random characters");
  }
}

function sessionSecret() {
  assertSessionSecret();
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_MS) / 1000))
    .sign(sessionSecret());
}

/** Resolves the session cookie to a user row (without the password hash), or null. */
export async function authenticateRequest(req: Request) {
  const token = parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) return null;
    return (await db.getUserById(userId)) ?? null;
  } catch {
    return null;
  }
}
