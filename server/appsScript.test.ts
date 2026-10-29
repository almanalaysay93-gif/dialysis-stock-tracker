import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

function script() {
  const context = vm.createContext({ console, Utilities: { formatDate: (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) } });
  vm.runInContext(readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8"), context);
  return context;
}

describe("Apps Script mirror", () => {
  function configuredRun() {
    const context = script();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const data = { version: 1, generatedAt: new Date().toISOString(), businessDate: day,
      tables: context.TABLE_NAMES.map((name: string) => ({ name, headers: ["id"], rows: [[1]] })),
      alerts: [{ key: "item:1:low_stock", type: "low_stock", itemId: 1, item: "PD solution", details: "2 boxes" }] };
    const book = { getUrl: () => "https://docs.google.com/spreadsheets/d/test", getId: () => "test" };
    context.Session = { getEffectiveUser: () => ({ getEmail: () => "share@spmcdvo.net" }) };
    context.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: vi.fn() }) };
    context.PropertiesService = { getScriptProperties: () => ({ getProperty: (key: string) => key === "SPREADSHEET_ID" ? "test" : "x".repeat(48) }) };
    context.SpreadsheetApp = { openById: () => book, flush: vi.fn() };
    context.DriveApp = { getFileById: () => ({ getOwner: () => ({ getEmail: () => "share@spmcdvo.net" }) }) };
    context.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(data) }) };
    context.getSheet_ = (_: unknown, name: string) => ({ getName: () => name, getSheetId: () => 1,
      getMaxRows: () => 100, getMaxColumns: () => 26, getLastRow: () => 0, getLastColumn: () => 0 });
    context.readAlertState_ = () => ({});
    context.writeStatus_ = vi.fn();
    context.replaceSmallTable_ = vi.fn();
    const batchUpdate = vi.fn();
    const sendEmail = vi.fn();
    context.Sheets = { Spreadsheets: { batchUpdate } };
    context.MailApp = { sendEmail, getRemainingDailyQuota: () => 1 };
    return { context, data, batchUpdate, sendEmail };
  }

  it("syncs before sending and saves reminder state only after successful email", () => {
    const { context, data, batchUpdate, sendEmail } = configuredRun();
    context.syncAndAlert();
    expect(batchUpdate).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "share@spmcdvo.net", body: expect.stringContaining("PD solution") }));
    expect(batchUpdate.mock.invocationCallOrder[0]).toBeLessThan(sendEmail.mock.invocationCallOrder[0]);
    expect(context.replaceSmallTable_).toHaveBeenCalledWith(expect.anything(), [["key", "lastSentBusinessDate"], ["item:1:low_stock", data.businessDate]]);
    expect(sendEmail.mock.invocationCallOrder[0]).toBeLessThan(context.replaceSmallTable_.mock.invocationCallOrder[0]);
  });

  it("keeps email failures pending and does not email after failed sheet writes", () => {
    const first = configuredRun();
    first.sendEmail.mockImplementation(() => { throw new Error("mail failed"); });
    expect(() => first.context.syncAndAlert()).toThrow("mail failed");
    expect(first.context.replaceSmallTable_).not.toHaveBeenCalled();
    const second = configuredRun();
    second.batchUpdate.mockImplementation(() => { throw new Error("write failed"); });
    expect(() => second.context.syncAndAlert()).toThrow("write failed");
    expect(second.sendEmail).not.toHaveBeenCalled();
    expect(second.context.replaceSmallTable_).not.toHaveBeenCalled();
  });

  it("checks SHARE identity before touching data", () => {
    const context = script();
    context.Session = { getEffectiveUser: () => ({ getEmail: () => "someone@gmail.com" }) };
    expect(() => context.setup()).toThrow("Run this script as share@spmcdvo.net");
  });
  it("writes formula-like content as text and clears stale trailing rows", () => {
    const context = script();
    const result = context.snapshotRequests_([{ name: "Items", headers: ["name"], rows: [["=IMPORTXML(secret)"]] }],
      { Items: { id: 1, rows: 100, columns: 26, usedRows: 10, usedColumns: 2 } });
    expect(result[0].updateCells.range.endRowIndex).toBe(10);
    expect(result[0].updateCells.rows[1].values[0].userEnteredValue).toEqual({ stringValue: "=IMPORTXML(secret)" });
  });
  it("deduplicates within the Manila date and reminds next day", () => {
    const context = script();
    const alerts = [{ key: "item:1:low_stock" }, { key: "item:2:out_of_stock" }];
    const previous = { "item:1:low_stock": "2026-10-29" };
    expect(context.dueAlerts_(alerts, previous, "2026-10-29")).toEqual([alerts[1]]);
    expect(context.dueAlerts_(alerts, previous, "2026-10-30")).toEqual(alerts);
  });
  it("rejects stale, incomplete and credential-bearing snapshots", () => {
    const context = script();
    const now = new Date("2026-10-28T16:05:00Z");
    const snapshot = { version: 1, generatedAt: now.toISOString(), businessDate: "2026-10-29",
      tables: context.TABLE_NAMES.map((name: string) => ({ name, headers: ["id"], rows: [] })), alerts: [] };
    expect(() => context.validateSnapshot_(snapshot, now)).not.toThrow();
    expect(() => context.validateSnapshot_({ ...snapshot, tables: [] }, now)).toThrow("Incomplete");
    expect(() => context.validateSnapshot_({ ...snapshot, generatedAt: "2026-10-27T00:00:00Z" }, now)).toThrow("Stale");
    snapshot.tables[0].headers = ["passwordHash"];
    expect(() => context.validateSnapshot_(snapshot, now)).toThrow("unsafe");
  });
  it("does not write or email when fetching fails", () => {
    const context = script();
    context.Session = { getEffectiveUser: () => ({ getEmail: () => "share@spmcdvo.net" }) };
    const releaseLock = vi.fn();
    context.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock }) };
    context.PropertiesService = { getScriptProperties: () => ({ getProperty: (key: string) => key === "SPREADSHEET_ID" ? "sheet-id" : "x".repeat(48) }) };
    context.SpreadsheetApp = { openById: () => ({}) };
    context.DriveApp = { getFileById: () => ({ getOwner: () => ({ getEmail: () => "share@spmcdvo.net" }) }) };
    context.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 503 }) };
    const write = vi.fn();
    const sendEmail = vi.fn();
    context.Sheets = { Spreadsheets: { batchUpdate: write } };
    context.MailApp = { sendEmail };
    context.writeStatus_ = vi.fn();
    expect(() => context.syncAndAlert()).toThrow("HTTP 503");
    expect(write).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(releaseLock).toHaveBeenCalled();
  });
});
