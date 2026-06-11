import type { PriorAuthState } from "../state.js";

/**
 * ConfidenceRoutingNode — pure logic node; no external calls, cannot fail.
 *
 * Applies the confidence threshold (default 0.80, configurable via CONFIDENCE_THRESHOLD env var)
 * to produce the final routing decision:
 *   - confidence >= threshold → AUTO_APPROVE
 *   - confidence < threshold  → HUMAN_REVIEW
 *
 * Threshold rationale: 0.80 matches the boundary used in payer-auth-intelligence
 * for portfolio consistency. Any determination below this threshold is withheld
 * from automated processing and queued for human review — never auto-applied.
 *
 * The confidence field from CriteriaEvalNode drives this decision. If CriteriaEvalNode
 * errored, confidence=0 guarantees HUMAN_REVIEW.
 */
export function confidenceRoutingNode(
  state: PriorAuthState
): Partial<PriorAuthState> {
  const confidence = state.confidence ?? 0;
  const threshold = state.confidenceThreshold;

  const routingDecision: "AUTO_APPROVE" | "HUMAN_REVIEW" =
    confidence >= threshold ? "AUTO_APPROVE" : "HUMAN_REVIEW";

  return { routingDecision };
}
