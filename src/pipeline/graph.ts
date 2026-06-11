import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { criteriaEvalNode } from "./nodes/criteria-eval.js";
import { confidenceRoutingNode } from "./nodes/confidence-routing.js";
import { auditWriteNode } from "./nodes/audit-write.js";
import { createInitialState } from "./state.js";
import type { PriorAuthRequestMessage } from "../contracts/prior-auth-request.js";
import type { PriorAuthState } from "./state.js";

/**
 * PriorAuthAnnotation — LangGraph state annotation for the pipeline.
 * Uses last-write-wins reducer (take the latest update) for all fields.
 */
const PriorAuthAnnotation = Annotation.Root({
  request: Annotation<PriorAuthState["request"]>({
    reducer: (_prev, next) => next,
    default: () => ({} as PriorAuthState["request"]),
  }),
  pipelineStartedAt: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  determination: Annotation<"AUTO_APPROVE" | "HUMAN_REVIEW" | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  confidence: Annotation<number | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  rationale: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  modelVersion: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  promptTokens: Annotation<number | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  completionTokens: Annotation<number | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  costUsd: Annotation<number | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  criteriaEvalError: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  routingDecision: Annotation<"AUTO_APPROVE" | "HUMAN_REVIEW" | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  confidenceThreshold: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0.80,
  }),
  auditRecordWritten: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  reviewQueueRecordWritten: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  processingMs: Annotation<number | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  auditWriteError: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type PriorAuthGraphState = typeof PriorAuthAnnotation.State;

/**
 * Node wrappers — adapt the pure function nodes (which work with PriorAuthState)
 * to the LangGraph annotation state type.
 */
async function criteriaEvalNodeAdapter(
  state: PriorAuthGraphState
): Promise<Partial<PriorAuthGraphState>> {
  return criteriaEvalNode(state as PriorAuthState);
}

function confidenceRoutingNodeAdapter(
  state: PriorAuthGraphState
): Partial<PriorAuthGraphState> {
  return confidenceRoutingNode(state as PriorAuthState);
}

async function auditWriteNodeAdapter(
  state: PriorAuthGraphState
): Promise<Partial<PriorAuthGraphState>> {
  return auditWriteNode(state as PriorAuthState);
}

/**
 * buildPipeline — constructs and compiles the three-node LangGraph StateGraph.
 *
 * Graph topology (linear, deterministic):
 *   criteria-eval → confidence-routing → audit-write → END
 */
function buildPipeline() {
  const graph = new StateGraph(PriorAuthAnnotation)
    .addNode("criteria-eval", criteriaEvalNodeAdapter)
    .addNode("confidence-routing", confidenceRoutingNodeAdapter)
    .addNode("audit-write", auditWriteNodeAdapter)
    .addEdge("__start__", "criteria-eval")
    .addEdge("criteria-eval", "confidence-routing")
    .addEdge("confidence-routing", "audit-write")
    .addEdge("audit-write", END);

  return graph.compile();
}

/**
 * runPipeline — entry point called by the subscriber service per Pub/Sub message.
 * Instantiates a fresh state and runs the compiled graph to completion.
 */
export async function runPipeline(message: PriorAuthRequestMessage): Promise<PriorAuthState> {
  const pipeline = buildPipeline();
  const initialState = createInitialState(message);

  const finalState = await pipeline.invoke(initialState as PriorAuthGraphState);
  return finalState as unknown as PriorAuthState;
}
