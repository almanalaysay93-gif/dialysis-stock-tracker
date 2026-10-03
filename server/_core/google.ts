import { COOKIE_NAME, SESSION_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { Router, type Request } from "express";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { createHash, randomBytes } from "node:crypto";
import * as db from "../db";
import { createSessionToken, sessionSecret } from "./auth";
import { getSessionCookieOptions, isSecureRequest } from "./cookies";

// Google sign-in: OpenID Connect authorization-code flow with PKCE.
// Only addresses listed in ADMIN_EMAILS can sign in this way; they become admins.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const STATE_COOKIE = "google_oauth_state";
const STATE_PATH = "/api/auth/google";

export function isGoogleEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isAdminEmail(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

const sha256Base64Url = (value: string) => createHash("sha256").update(value).digest("base64url");

type FlowState = { state: string; nonce: string; verifier: string };

function signFlowState(flow: FlowState) {
  return new SignJWT({ ...flow })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(sessionSecret());
}

async function readFlowState(req: Request): Promise<FlowState | null> {
  const token = parseCookieHeader(req.headers.cookie ?? "")[STATE_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    const { state, nonce, verifier } = payload as Record<string, unknown>;
    if (typeof state !== "string" || typeof nonce !== "string" || typeof verifier !== "string") return null;
    return { state, nonce, verifier };
  } catch {
    return null;
  }
}

/** Checks Google's signed ID token and returns the verified email. Throws if anything is off. */
export async function verifyIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string },
  getKey: JWTVerifyGetKey = googleKeys
) {
  const { payload } = await jwtVerify(idToken, getKey, {
    algorithms: ["RS256"],
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: expected.clientId,
  });
  if (payload.nonce !== expected.nonce) throw new Error("nonce mismatch");
  if (payload.email_verified !== true) throw new Error("email not verified");
  if (typeof payload.email !== "string" || !payload.email) throw new Error("no email");
  return {
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

function redirectUriFor(req: Request) {
  const forwarded = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0].trim() || req.headers.host;
  return `${isSecureRequest(req) ? "https" : "http"}://${host}${STATE_PATH}/callback`;
}

async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`token endpoint answered ${res.status}`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("no id_token in token response");
  return body.id_token;
}

export const googleRouter = Router();

googleRouter.get("/start", async (req, res) => {
  if (!isGoogleEnabled()) return res.redirect(302, "/?login_error=google_unavailable");
  const flow: FlowState = {
    state: randomBytes(24).toString("base64url"),
    nonce: randomBytes(24).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
  };
  res.cookie(STATE_COOKIE, await signFlowState(flow), {
    ...getSessionCookieOptions(req),
    path: STATE_PATH,
    maxAge: 10 * 60 * 1000,
  });
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUriFor(req),
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: sha256Base64Url(flow.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  res.redirect(302, url.toString());
});

googleRouter.get("/callback", async (req, res) => {
  const flow = await readFlowState(req);
  res.clearCookie(STATE_COOKIE, { ...getSessionCookieOptions(req), path: STATE_PATH });
  const { code, state } = req.query;
  if (!isGoogleEnabled() || !flow || typeof code !== "string" || state !== flow.state) {
    return res.redirect(302, "/?login_error=google");
  }
  // Which stage failed, shown on the sign-in screen so a misconfiguration can be
  // told apart without server logs: exchange = Google's token endpoint,
  // verify = the ID token, database = our own tables.
  let step = "exchange";
  try {
    const idToken = await exchangeCode(code, flow.verifier, redirectUriFor(req));
    step = "verify";
    const { email, name } = await verifyIdToken(idToken, {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      nonce: flow.nonce,
    });
    if (!isAdminEmail(email)) return res.redirect(302, "/?login_error=not_allowed");
    step = "database";
    const user = await db.upsertGoogleAdmin(email, name);
    await db.recordSignIn(user.id);
    res.cookie(COOKIE_NAME, await createSessionToken(user.id), {
      ...getSessionCookieOptions(req),
      maxAge: SESSION_MS,
    });
    res.redirect(302, "/");
  } catch (error) {
    console.error(`[Google sign-in] failed at ${step}:`, error instanceof Error ? error.message : error);
    res.redirect(302, `/?login_error=google&step=${step}`);
  }
});
