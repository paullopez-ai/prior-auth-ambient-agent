/**
 * AuditRecord — TypeScript interface matching the BigQuery audit_records table schema exactly.
 * Any field mismatch between this interface and the BigQuery schema is a TypeScript compile error.
 * Every pipeline run writes exactly one AuditRecord regardless of determination outcome.
 */
export interface AuditRecord {
  /** Pub/Sub request ID (from PriorAuthRequestMessage.requestId) */
  request_id: string;

  /** Pub/Sub message ID assigned by the broker */
  message_id: string;

  /** CPT procedure code */
  cpt_code: string;

  /** Health plan type */
  plan_type: string;

  /** Payer profile ID */
  payer_id: string;

  /** Pipeline determination: AUTO_APPROVE or HUMAN_REVIEW */
  determination: "AUTO_APPROVE" | "HUMAN_REVIEW";

  /** Model confidence score 0.0 – 1.0 */
  confidence: number;

  /** Model rationale text for the determination */
  rationale: string;

  /** Gemini model version string (e.g. 'gemini-2.0-flash') */
  model_version: string;

  /** Input token count from the Gemini response */
  prompt_tokens: number;

  /** Output token count from the Gemini response */
  completion_tokens: number;

  /** Estimated Vertex AI cost in USD for this inference call */
  cost_usd: number;

  /** Total pipeline processing duration in milliseconds */
  processing_ms: number;

  /** ISO 8601 timestamp when the pipeline completed processing */
  processed_at: string;

  /** Audit record schema version for forward compatibility */
  schema_version: string;
}

/**
 * HumanReviewQueueRecord — BigQuery human_review_queue table schema.
 * Written in addition to AuditRecord when determination is HUMAN_REVIEW.
 */
export interface HumanReviewQueueRecord {
  request_id: string;
  message_id: string;
  cpt_code: string;
  plan_type: string;
  payer_id: string;
  confidence: number;
  rationale: string;
  clinical_notes: string;
  review_status: "PENDING" | "APPROVED" | "DENIED" | "RETURNED";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  queued_at: string;
}
