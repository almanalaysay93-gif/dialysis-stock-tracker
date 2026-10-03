import { COOKIE_NAME, SESSION_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import * as db from "../db";
import { ENV } from "./env";

// Sign-in itself is Google (server/_core/google.ts). This file holds the
// session cookie that sign-in hands out.

export function assertSessionSecret() {
  if (ENV.cookieSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 random characters");
  }
}

export function sessionSecret() {
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

/** Resolves the session cookie to a user row, or null. */
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
