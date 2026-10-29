import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
const snapshot = vi.hoisted(() => vi.fn());
vi.mock("./sheetsSnapshot", () => ({ createSheetsSnapshot: snapshot }));
import { sheetsRouter } from "./_core/sheets";

describe("private Sheets endpoint", () => {
  let server: Server;
  let url: string;
  const secret = "a".repeat(48);
  beforeAll(() => {
    const app = express();
    app.use("/sheets", sheetsRouter);
    server = createServer(app).listen(0);
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/sheets/snapshot`;
  });
  afterAll(() => server.close());
  afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
  it("rejects unconfigured, anonymous and incorrect-token requests before reading data", async () => {
    vi.stubEnv("SHEETS_SYNC_SECRET", "");
    expect((await fetch(url)).status).toBe(503);
    vi.stubEnv("SHEETS_SYNC_SECRET", secret);
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { Authorization: `Bearer ${"b".repeat(48)}` } })).status).toBe(401);
    expect(snapshot).not.toHaveBeenCalled();
  });
  it("returns a noncacheable snapshot with the correct token", async () => {
    vi.stubEnv("SHEETS_SYNC_SECRET", secret);
    snapshot.mockResolvedValue({ version: 1, tables: [] });
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ version: 1, tables: [] });
  });
  it("never leaks database errors", async () => {
    vi.stubEnv("SHEETS_SYNC_SECRET", secret);
    snapshot.mockRejectedValue(new Error("private database connection string"));
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
  });
});
