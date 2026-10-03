import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import { authenticateRequest, hashPassword, verifyPassword } from "./_core/auth";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const mockGetUserByUsername = vi.fn();
const mockGetUserById = vi.fn();

vi.mock("./db", () => ({
  getDb: async () => null,
  getUserByUsername: (...args: unknown[]) => mockGetUserByUsername(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  touchLastSignedIn: async () => {},
}));

type CookieCall = { name: string; value?: string; options: Record<string, unknown> };

function createContext(user: TrpcContext["user"] = null) {
  const setCookies: CookieCall[] = [];
  const clearedCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
  };
  return { ctx, setCookies, clearedCookies };
}

const sessionUser = {
  id: 7,
  username: "nurse.rivera",
  name: "Nurse A. Rivera",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const GENERIC_ERROR =
  "Username or password is incorrect. A username is locked for 15 minutes after 5 failed attempts.";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toContain("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterx", hash)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });
});

describe("auth.login", () => {
  it("sets an httpOnly session cookie that resolves back to the user", async () => {
    const passwordHash = await hashPassword("correct horse battery");
    mockGetUserByUsername.mockResolvedValue({ ...sessionUser, passwordHash });
    mockGetUserById.mockResolvedValue(sessionUser);

    const { ctx, setCookies } = createContext();
    // Mixed case + padding: usernames are matched case-insensitively.
    const result = await appRouter.createCaller(ctx).auth.login({
      username: "  Nurse.Rivera ",
      password: "correct horse battery",
    });

    expect(result).toEqual({ success: true });
    expect(mockGetUserByUsername).toHaveBeenCalledWith("nurse.rivera");
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0].name).toBe(COOKIE_NAME);
    expect(setCookies[0].options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });

    const user = await authenticateRequest({
      headers: { cookie: `${COOKIE_NAME}=${setCookies[0].value}` },
    } as TrpcContext["req"]);
    expect(mockGetUserById).toHaveBeenCalledWith(7);
    expect(user).toEqual(sessionUser);
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("rejects a wrong password and an unknown user with the same error", async () => {
    const passwordHash = await hashPassword("correct horse battery");
    mockGetUserByUsername.mockResolvedValueOnce({ ...sessionUser, passwordHash });
    const { ctx, setCookies } = createContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auth.login({ username: "wrong.pw", password: "nope" })).rejects.toThrow(
      GENERIC_ERROR
    );
    mockGetUserByUsername.mockResolvedValueOnce(undefined);
    await expect(caller.auth.login({ username: "ghost", password: "nope" })).rejects.toThrow(
      GENERIC_ERROR
    );
    expect(setCookies).toHaveLength(0);
  });

  it("locks a username after 5 failures, even for the right password", async () => {
    const passwordHash = await hashPassword("correct horse battery");
    mockGetUserByUsername.mockResolvedValue({ ...sessionUser, passwordHash });
    const { ctx, setCookies } = createContext();
    const caller = appRouter.createCaller(ctx);

    for (let i = 0; i < 5; i++) {
      await expect(caller.auth.login({ username: "locked.out", password: "nope" })).rejects.toThrow(
        GENERIC_ERROR
      );
    }
    // Locked: the right password is refused too, with the same message as any other failure.
    await expect(
      caller.auth.login({ username: "locked.out", password: "correct horse battery" })
    ).rejects.toThrow(GENERIC_ERROR);
    expect(setCookies).toHaveLength(0);
  }, 30000);

  it("does not lock or track usernames that do not exist", async () => {
    mockGetUserByUsername.mockResolvedValue(undefined);
    const { ctx, setCookies } = createContext();
    const caller = appRouter.createCaller(ctx);
    for (let i = 0; i < 6; i++) {
      await expect(caller.auth.login({ username: "made.up", password: "nope" })).rejects.toThrow(GENERIC_ERROR);
    }
    // The account is created afterwards: earlier misses must not have locked the name.
    const passwordHash = await hashPassword("correct horse battery");
    mockGetUserByUsername.mockResolvedValue({ ...sessionUser, passwordHash });
    await expect(
      caller.auth.login({ username: "made.up", password: "correct horse battery" })
    ).resolves.toEqual({ success: true });
    expect(setCookies).toHaveLength(1);
  }, 30000);
});

describe("session cookie", () => {
  it("ignores a missing or tampered cookie", async () => {
    expect(await authenticateRequest({ headers: {} } as TrpcContext["req"])).toBeNull();
    expect(
      await authenticateRequest({
        headers: { cookie: `${COOKIE_NAME}=eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.` },
      } as TrpcContext["req"])
    ).toBeNull();
    expect(mockGetUserById).not.toHaveBeenCalled();
  });
});

describe("protected data", () => {
  it("refuses patient session records without a session", async () => {
    const { ctx } = createContext();
    await expect(appRouter.createCaller(ctx).sessions.listWithLines()).rejects.toThrow();
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
