import { SignJWT, generateKeyPair } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isAdminEmail, isGoogleEnabled, verifyIdToken } from "./_core/google";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const NONCE = "nonce-123";

let privateKey: CryptoKey;
let publicKey: CryptoKey;
beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair("RS256"));
});
const getKey = async () => publicKey;

type Claims = Record<string, unknown>;
function idToken(claims: Claims = {}, opts: { iss?: string; aud?: string; exp?: string | number } = {}) {
  return new SignJWT({ email: "share@spmcdvo.net", email_verified: true, name: "Share", nonce: NONCE, ...claims })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(opts.iss ?? "https://accounts.google.com")
    .setAudience(opts.aud ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(privateKey);
}
const verify = (token: string) => verifyIdToken(token, { clientId: CLIENT_ID, nonce: NONCE }, getKey);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyIdToken", () => {
  it("accepts a valid token and lowercases the email", async () => {
    await expect(verify(await idToken({ email: "Share@SPMCDVO.net" }))).resolves.toEqual({
      email: "share@spmcdvo.net",
      name: "Share",
    });
  });

  it("accepts the bare-host issuer Google also uses", async () => {
    await expect(verify(await idToken({}, { iss: "accounts.google.com" }))).resolves.toMatchObject({
      email: "share@spmcdvo.net",
    });
  });

  it.each([
    ["another issuer", () => idToken({}, { iss: "https://evil.example" })],
    ["another client (audience)", () => idToken({}, { aud: "someone-else" })],
    ["a different nonce", () => idToken({ nonce: "replayed" })],
    ["an unverified email", () => idToken({ email_verified: false })],
    ["a string email_verified", () => idToken({ email_verified: "true" })],
    ["no email", () => idToken({ email: undefined })],
    ["an expired token", () => idToken({}, { exp: Math.floor(Date.now() / 1000) - 60 })],
  ])("rejects %s", async (_label, make) => {
    await expect(verify(await make())).rejects.toThrow();
  });

  it("rejects a token signed with a different key", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "share@spmcdvo.net", email_verified: true, nonce: NONCE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience(CLIENT_ID)
      .setExpirationTime("5m")
      .sign(other.privateKey);
    await expect(verify(forged)).rejects.toThrow();
  });
});

describe("admin allowlist", () => {
  it("matches listed addresses case-insensitively and nothing else", () => {
    vi.stubEnv("ADMIN_EMAILS", " Share@spmcdvo.net , other@example.org ");
    expect(isAdminEmail("share@spmcdvo.net")).toBe(true);
    expect(isAdminEmail("SHARE@SPMCDVO.NET")).toBe(true);
    expect(isAdminEmail("other@example.org")).toBe(true);
    expect(isAdminEmail("intruder@spmcdvo.net")).toBe(false);
    expect(isAdminEmail("share@spmcdvo.net.evil.com")).toBe(false);
  });

  it("allows nobody when ADMIN_EMAILS is unset or empty", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isAdminEmail("share@spmcdvo.net")).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });
});

describe("isGoogleEnabled", () => {
  it("needs both the client id and the secret", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(isGoogleEnabled()).toBe(false);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    expect(isGoogleEnabled()).toBe(true);
  });
});
