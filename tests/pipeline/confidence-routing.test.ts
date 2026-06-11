import { describe, it, expect } from "vitest";
import { confidenceRoutingNode } from "../../src/pipeline/nodes/confidence-routing.js";
import { createInitialState } from "../../src/pipeline/state.js";
import type { PriorAuthRequestMessage } from "../../src/contracts/prior-auth-request.js";

const baseRequest: PriorAuthRequestMessage = {
  messageId: "msg-001",
  requestId: "11111111-1111-1111-1111-111111111111",
  cptCode: "99213",
  diagnosisCodes: ["J06.9"],
  planType: "commercial",
  payerId: "PAYER-001",
  clinicalNotes: "Patient presents with acute upper respiratory symptoms.",
  submittedAt: "2026-06-08T10:00:00.000Z",
  schemaVersion: "1.0",
};

function stateWithConfidence(confidence: number) {
  const state = createInitialState(baseRequest);
  return { ...state, confidence, determination: confidence >= 0.80 ? "AUTO_APPROVE" as const : "HUMAN_REVIEW" as const };
}

describe("confidenceRoutingNode", () => {
  it("routes AUTO_APPROVE for confidence exactly at threshold (0.80)", () => {
    const update = confidenceRoutingNode(stateWithConfidence(0.80));
    expect(update.routingDecision).toBe("AUTO_APPROVE");
  });

  it("routes AUTO_APPROVE for confidence above threshold (0.91)", () => {
    const update = confidenceRoutingNode(stateWithConfidence(0.91));
    expect(update.routingDecision).toBe("AUTO_APPROVE");
  });

  it("routes AUTO_APPROVE for confidence at 1.0", () => {
    const update = confidenceRoutingNode(stateWithConfidence(1.0));
    expect(update.routingDecision).toBe("AUTO_APPROVE");
  });

  it("routes HUMAN_REVIEW for confidence just below threshold (0.79)", () => {
    const update = confidenceRoutingNode(stateWithConfidence(0.79));
    expect(update.routingDecision).toBe("HUMAN_REVIEW");
  });

  it("routes HUMAN_REVIEW for confidence 0.67", () => {
    const update = confidenceRoutingNode(stateWithConfidence(0.67));
    expect(update.routingDecision).toBe("HUMAN_REVIEW");
  });

  it("routes HUMAN_REVIEW for confidence 0.0 (error case)", () => {
    const update = confidenceRoutingNode(stateWithConfidence(0));
    expect(update.routingDecision).toBe("HUMAN_REVIEW");
  });

  it("routes HUMAN_REVIEW when confidence is null (defensive)", () => {
    const state = { ...createInitialState(baseRequest), confidence: null };
    const update = confidenceRoutingNode(state);
    expect(update.routingDecision).toBe("HUMAN_REVIEW");
  });

  it("respects custom CONFIDENCE_THRESHOLD env var", () => {
    // State with threshold 0.90 (higher bar)
    const state = { ...stateWithConfidence(0.85), confidenceThreshold: 0.90 };
    const update = confidenceRoutingNode(state);
    expect(update.routingDecision).toBe("HUMAN_REVIEW");
  });
});
