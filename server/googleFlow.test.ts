import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { users } from "../drizzle/schema";
import { getDb } from "./db";

// Runs the real Express app against the real database, with Google replaced by a
// local stand-in: the token endpoint and the signing keys are answered from here.
const TEST_DB = process.env.DATABASE_URL;
const CLIENT_ID = "flow-test.apps.googleusercontent.com";
const ADMIN = "flow-admin@spmcdvo.net";

describe.skipIf(!TEST_DB)("Google sign-in flow (real DB, fake Google)", () => {
  let server: Server;
  let base: string;
  let privateKey: CryptoKey;
  let jwk: Record<string, unknown>;
  // What the fake token endpoint will sign for the next code exchange.
  let tokenFor: { email: string; verified?: boolean } = { email: ADMIN };
  let lastNonce = "";
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "flow-secret");
    vi.stubEnv("ADMIN_EMAILS", ADMIN);

    const keys = await generateKeyPair("RS256");
    privateKey = keys.privateKey;
    jwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256", use: "sig" };

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === "https://www.googleapis.com/oauth2/v3/certs") {
        return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
      }
      if (url === "https://oauth2.googleapis.com/token") {
        const form = new URLSearchParams(String(init?.body));
        expect(form.get("client_id")).toBe(CLIENT_ID);
        expect(form.get("grant_type")).toBe("authorization_code");
        expect(form.get("code_verifier")?.length).toBeGreaterThan(42);
        const id_token = await new SignJWT({
          email: tokenFor.email,
          email_verified: tokenFor.verified ?? true,
          name: "Flow Admin",
          nonce: lastNonce,
        })
          .setProtectedHeader({ alg: "RS256", kid: "k1" })
          .setIssuer("https://accounts.google.com")
          .setAudience(CLIENT_ID)
          .setExpirationTime("5m")
          .sign(privateKey);
        return new Response(JSON.stringify({ id_token }), { headers: { "content-type": "application/json" } });
      }
      return realFetch(input, init);
    });

    const { default: app } = await import("./_core/app");
    server = createServer(app).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const db = await getDb();
    await db!.delete(users).where(eq(users.email, ADMIN));
  });

  afterAll(async () => {
    server?.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    const db = await getDb();
    await db?.delete(users).where(eq(users.email, ADMIN));
  });

  const cookiesOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map(c => c.split(";")[0])
      .filter(c => !c.endsWith("="))
      .join("; ");

  async function start() {
    const res = await fetch(`${base}/api/auth/google/start`, { redirect: "manual" });
    const location = new URL(res.headers.get("location")!);
    lastNonce = location.searchParams.get("nonce")!;
    return { res, location, state: location.searchParams.get("state")!, cookie: cookiesOf(res) };
  }

  it("sends the browser to Google with state, nonce and a PKCE challenge", async () => {
    const { res, location, cookie } = await start();
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(location.searchParams.get("redirect_uri")).toBe(`${base}/api/auth/google/callback`);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    expect(cookie).toMatch(/^google_oauth_state=/);
    expect(res.headers.getSetCookie()[0]).toMatch(/HttpOnly/i);
  });

  it("signs the listed admin in, creating the account as admin", async () => {
    tokenFor = { email: ADMIN.toUpperCase() };
    const { state, cookie } = await start();
    const res = await fetch(`${base}/api/auth/google/callback?code=abc&state=${state}`, {
      redirect: "manual",
      headers: { cookie },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const session = cookiesOf(res);
    expect(session).toMatch(/app_session_id=/);

    const me = await (await fetch(`${base}/api/trpc/auth.me`, { headers: { cookie: session } })).json();
    expect(me.result.data.json).toMatchObject({ email: ADMIN, role: "admin", name: "Flow Admin" });
    expect(me.result.data.json).not.toHaveProperty("passwordHash");

    // The same address again reuses the account.
    const again = await start();
    await fetch(`${base}/api/auth/google/callback?code=abc&state=${again.state}`, {
      redirect: "manual",
      headers: { cookie: again.cookie },
    });
    const db = await getDb();
    expect(await db!.select().from(users).where(eq(users.email, ADMIN))).toHaveLength(1);
  });

  it("refuses a Google account that is not on the admin list", async () => {
    tokenFor = { email: "stranger@gmail.com" };
    const { state, cookie } = await start();
    const res = await fetch(`${base}/api/auth/google/callback?code=abc&state=${state}`, {
      redirect: "manual",
      headers: { cookie },
    });
    expect(res.headers.get("location")).toBe("/?login_error=not_allowed");
    expect(cookiesOf(res)).not.toMatch(/app_session_id/);
    const db = await getDb();
    expect(await db!.select().from(users).where(eq(users.email, "stranger@gmail.com"))).toHaveLength(0);
  });

  it("refuses an unverified email even when it is the admin address", async () => {
    tokenFor = { email: ADMIN, verified: false };
    const { state, cookie } = await start();
    const res = await fetch(`${base}/api/auth/google/callback?code=abc&state=${state}`, {
      redirect: "manual",
      headers: { cookie },
    });
    expect(res.headers.get("location")).toBe("/?login_error=google");
    expect(cookiesOf(res)).not.toMatch(/app_session_id/);
  });

  it("refuses a callback whose state does not match, or that has no state cookie", async () => {
    tokenFor = { email: ADMIN };
    const { cookie } = await start();
    const forged = await fetch(`${base}/api/auth/google/callback?code=abc&state=forged`, {
      redirect: "manual",
      headers: { cookie },
    });
    expect(forged.headers.get("location")).toBe("/?login_error=google");
    expect(cookiesOf(forged)).not.toMatch(/app_session_id/);

    const { state } = await start();
    const noCookie = await fetch(`${base}/api/auth/google/callback?code=abc&state=${state}`, { redirect: "manual" });
    expect(noCookie.headers.get("location")).toBe("/?login_error=google");
    expect(cookiesOf(noCookie)).not.toMatch(/app_session_id/);
  });

  it("does not let a Google-only account sign in with a password", async () => {
    const res = await fetch(`${base}/api/trpc/auth.login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { username: ADMIN, password: "anything-at-all-12" } }),
    });
    expect(res.status).toBe(401);
  });
});
