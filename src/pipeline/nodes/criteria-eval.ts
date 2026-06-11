import { evaluateWithGemini } from "../../clients/vertex.js";
import type { PriorAuthState } from "../state.js";

/**
 * CriteriaEvalNode — calls Vertex AI Gemini to evaluate the prior auth request.
 *
 * Single responsibility: inference. Only this node makes an LLM call.
 * A failure here (model error, timeout) does not affect AuditWriteNode.
 *
 * Output: determination, confidence, rationale, token counts, cost
 */
export async function criteriaEvalNode(
  state: PriorAuthState
): Promise<Partial<PriorAuthState>> {
  try {
    const result = await evaluateWithGemini({
      cptCode: state.request.cptCode,
      diagnosisCodes: state.request.diagnosisCodes,
      planType: state.request.planType,
      clinicalNotes: state.request.clinicalNotes,
      scenarioId: state.request.scenarioId,
    });

    return {
      determination: result.determination,
      confidence: result.confidence,
      rationale: result.rationale,
      modelVersion: result.model_version,
      promptTokens: result.prompt_tokens,
      completionTokens: result.completion_tokens,
      costUsd: result.cost_usd,
      criteriaEvalError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      determination: "HUMAN_REVIEW",
      confidence: 0,
      rationale: `CriteriaEvalNode error — routed to human review: ${message}`,
      modelVersion: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      criteriaEvalError: message,
    };
  }
}
