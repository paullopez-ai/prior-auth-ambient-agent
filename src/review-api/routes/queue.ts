import { Router, type Request, type Response } from "express";
import { getReviewQueueRecords, updateReviewDecision } from "../../clients/bigquery.js";
import type { ReviewDecisionRequest } from "../../contracts/review-queue-record.js";

const router = Router();

/**
 * GET /review-queue — returns all human review queue records.
 * UI polls this to display pending items.
 */
router.get("/review-queue", async (_req: Request, res: Response) => {
  try {
    const records = await getReviewQueueRecords();
    res.json({ records, count: records.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Failed to fetch review queue", detail: message });
  }
});

/**
 * POST /review-queue/:id/decision — submit a human review decision.
 * Body: { decision: "APPROVED" | "DENIED" | "RETURNED", reviewed_by: string, review_notes?: string }
 */
router.post("/review-queue/:id/decision", async (req: Request, res: Response) => {
  const requestId = req.params.id;
  const body = req.body as ReviewDecisionRequest;

  if (!body.decision || !["APPROVED", "DENIED", "RETURNED"].includes(body.decision)) {
    res.status(400).json({ error: "decision must be APPROVED, DENIED, or RETURNED" });
    return;
  }
  if (!body.reviewed_by || typeof body.reviewed_by !== "string") {
    res.status(400).json({ error: "reviewed_by is required" });
    return;
  }

  try {
    await updateReviewDecision(
      requestId,
      body.decision,
      body.reviewed_by,
      body.review_notes ?? null
    );
    res.json({
      status: "ok",
      request_id: requestId,
      decision: body.decision,
      reviewed_by: body.reviewed_by,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Failed to record decision", detail: message });
  }
});

export default router;
