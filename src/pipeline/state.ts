import type { PriorAuthRequestMessage } from "../contracts/prior-auth-request.js";

/**
 * PriorAuthState — the shared state object threaded through all LangGraph nodes.
 * All fields are required; no optional fields to prevent silent state gaps.
 * Instantiated fresh per Pub/Sub message; never shared between concurrent runs.
 */
export interface PriorAuthState {
  // --- Input (set at pipeline entry from Pub/Sub message) ---
  request: PriorAuthRequestMessage;
  pipelineStartedAt: number; // Date.now() at pipeline instantiation

  // --- CriteriaEvalNode output ---
  determination: "AUTO_APPROVE" | "HUMAN_REVIEW" | null;
  confidence: number | null;
  rationale: string | null;
  modelVersion: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  criteriaEvalError: string | null;

  // --- ConfidenceRoutingNode output ---
  routingDecision: "AUTO_APPROVE" | "HUMAN_REVIEW" | null;
  confidenceThreshold: number;

  // --- AuditWriteNode output ---
  auditRecordWritten: boolean;
  reviewQueueRecordWritten: boolean;
  processingMs: number | null;
  auditWriteError: string | null;
}

/**
 * Initial state factory — creates a clean state from a validated Pub/Sub message.
 */
export function createInitialState(request: PriorAuthRequestMessage): PriorAuthState {
  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD ?? "0.80");
  return {
    request,
    pipelineStartedAt: Date.now(),

    determination: null,
    confidence: null,
    rationale: null,
    modelVersion: null,
    promptTokens: null,
    completionTokens: null,
    costUsd: null,
    criteriaEvalError: null,

    routingDecision: null,
    confidenceThreshold: threshold,

    auditRecordWritten: false,
    reviewQueueRecordWritten: false,
    processingMs: null,
    auditWriteError: null,
  };
}
