/**
 * Re-export HumanReviewQueueRecord from audit-record for convenience.
 * The queue record is a subset of AuditRecord plus review workflow fields.
 */
export type { HumanReviewQueueRecord } from "./audit-record.js";

/**
 * ReviewDecision — valid decisions a human reviewer can submit.
 */
export type ReviewDecision = "APPROVED" | "DENIED" | "RETURNED";

/**
 * ReviewDecisionRequest — payload for POST /review-queue/:id/decision
 */
export interface ReviewDecisionRequest {
  decision: ReviewDecision;
  reviewed_by: string;
  review_notes?: string;
}
