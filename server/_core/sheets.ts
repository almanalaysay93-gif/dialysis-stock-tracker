import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { createSheetsSnapshot } from "../sheetsSnapshot";

export const sheetsRouter = Router();
sheetsRouter.get("/snapshot", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.SHEETS_SYNC_SECRET;
  if (!secret || secret.length < 32) return res.status(503).json({ error: "Sheets sync is not configured" });
  const supplied = req.headers.authorization ?? "";
  const expected = `Bearer ${secret}`;
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const snapshot = await createSheetsSnapshot();
    const body = JSON.stringify(snapshot);
    if (Buffer.byteLength(body) > 8_000_000) return res.status(413).json({ error: "Snapshot exceeds sync size limit" });
    return res.type("json").send(body);
  } catch {
    return res.status(503).json({ error: "Database snapshot unavailable" });
  }
});
