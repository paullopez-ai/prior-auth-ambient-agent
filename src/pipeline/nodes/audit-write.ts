import { writeAuditRecord, writeReviewQueueRecord } from "../../clients/bigquery.js";
import type { AuditRecord, HumanReviewQueueRecord } from "../../contracts/audit-record.js";
import type { PriorAuthState } from "../state.js";

/**
 * AuditWriteNode — writes to BigQuery; single responsibility: persistence.
 *
 * Always writes one AuditRecord regardless of outcome.
 * If routingDecision is HUMAN_REVIEW, also writes one HumanReviewQueueRecord.
 *
 * A BigQuery write failure here does not retry the Gemini call (CriteriaEvalNode
 * has already completed). Failure is recorded in state.auditWriteError.
 */
export async function auditWriteNode(
  state: PriorAuthState
): Promise<Partial<PriorAuthState>> {
  const processingMs = Date.now() - state.pipelineStartedAt;
  const processedAt = new Date().toISOString();
  const determination = state.routingDecision ?? "HUMAN_REVIEW";

  const auditRecord: AuditRecord = {
    request_id: state.request.requestId,
    message_id: state.request.messageId,
    cpt_code: state.request.cptCode,
    plan_type: state.request.planType,
    payer_id: state.request.payerId,
    determination,
    confidence: state.confidence ?? 0,
    rationale: state.rationale ?? "No rationale available",
    model_version: state.modelVersion ?? (process.env.GEMINI_MODEL ?? "gemini-2.0-flash"),
    prompt_tokens: state.promptTokens ?? 0,
    completion_tokens: state.completionTokens ?? 0,
    cost_usd: state.costUsd ?? 0,
    processing_ms: processingMs,
    processed_at: processedAt,
    schema_version: "1.0",
  };

  try {
    await writeAuditRecord(auditRecord);

    let reviewQueueRecordWritten = false;
    if (determination === "HUMAN_REVIEW") {
      const queueRecord: HumanReviewQueueRecord = {
        request_id: state.request.requestId,
        message_id: state.request.messageId,
        cpt_code: state.request.cptCode,
        plan_type: state.request.planType,
        payer_id: state.request.payerId,
        confidence: state.confidence ?? 0,
        rationale: state.rationale ?? "No rationale available",
        clinical_notes: state.request.clinicalNotes,
        review_status: "PENDING",
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        queued_at: processedAt,
      };
      await writeReviewQueueRecord(queueRecord);
      reviewQueueRecordWritten = true;
    }

    return {
      auditRecordWritten: true,
      reviewQueueRecordWritten,
      processingMs,
      auditWriteError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      auditRecordWritten: false,
      reviewQueueRecordWritten: false,
      processingMs,
      auditWriteError: message,
    };
  }
}
