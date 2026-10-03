import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import { authenticateRequest, createSessionToken } from "./_core/auth";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const mockGetUserById = vi.fn();

vi.mock("./db", () => ({
  getDb: async () => null,
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
}));

type CookieCall = { name: string; options: Record<string, unknown> };

function createContext(user: TrpcContext["user"] = null) {
  const clearedCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

const sessionUser = {
  id: 7,
  username: "share@spmcdvo.net",
  email: "share@spmcdvo.net",
  name: "Share",
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("session cookie", () => {
  it("resolves a cookie we issued back to its user", async () => {
    mockGetUserById.mockResolvedValue(sessionUser);
    const token = await createSessionToken(7);
    const user = await authenticateRequest({
      headers: { cookie: `${COOKIE_NAME}=${token}` },
    } as TrpcContext["req"]);
    expect(mockGetUserById).toHaveBeenCalledWith(7);
    expect(user).toEqual(sessionUser);
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("ignores a missing, unsigned or wrongly signed cookie", async () => {
    expect(await authenticateRequest({ headers: {} } as TrpcContext["req"])).toBeNull();
    const unsigned = "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.";
    const wrongKey = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-different-secret-of-more-than-32-chars"));
    for (const token of [unsigned, wrongKey]) {
      expect(
        await authenticateRequest({ headers: { cookie: `${COOKIE_NAME}=${token}` } } as TrpcContext["req"])
      ).toBeNull();
    }
    expect(mockGetUserById).not.toHaveBeenCalled();
  });
});

describe("protected data", () => {
  it("refuses patient session records without a session", async () => {
    const { ctx } = createContext();
    await expect(appRouter.createCaller(ctx).sessions.listWithLines()).rejects.toThrow();
  });
});

describe("password sign-in", () => {
  it("no longer exists", () => {
    expect("login" in appRouter.auth).toBe(false);
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createContext(sessionUser);
    const result = await appRouter.createCaller(ctx).auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });
  });
});
