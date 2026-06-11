import { Router, type Request, type Response } from "express";
import { getAuditRecords } from "../../clients/bigquery.js";

const router = Router();

/**
 * GET /audit — returns all audit records, newest first (up to 100).
 * Used by the UI audit dashboard to display the full event history.
 */
router.get("/audit", async (_req: Request, res: Response) => {
  try {
    const records = await getAuditRecords();
    res.json({ records, count: records.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Failed to fetch audit records", detail: message });
  }
});

export default router;
