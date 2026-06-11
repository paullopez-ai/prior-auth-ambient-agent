import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { runPipeline } from "../../src/pipeline/graph.js";
import type { PriorAuthRequestMessage } from "../../src/contracts/prior-auth-request.js";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_LOG_PATH = join(__dirname, "../../data/mock-audit-log.jsonl");

const BATCH_SCENARIO_IDS = [
  "scenario-4-batch-approve-1",
  "scenario-4-batch-approve-2",
  "scenario-4-batch-approve-3",
  "scenario-4-batch-review-1",
  "scenario-4-batch-review-2",
];

function makeBatchMessage(scenarioId: string, index: number): PriorAuthRequestMessage {
  return {
    messageId: `pubsub-batch-${index}`,
    requestId: randomUUID(),
    cptCode: "70553",
    diagnosisCodes: ["G35"],
    planType: "commercial",
    payerId: "PAYER-BCBS-001",
    clinicalNotes: `Batch test message ${index}. Synthetic clinical notes for prior authorization evaluation.`,
    submittedAt: new Date().toISOString(),
    schemaVersion: "1.0",
    scenarioId,
  };
}

describe("Scenario 4: Batch Pipeline Processing", () => {
  beforeEach(() => {
    process.env.MOCK_LLM = "true";
    process.env.MOCK_BQ = "true";
    if (existsSync(MOCK_LOG_PATH)) unlinkSync(MOCK_LOG_PATH);
  });

  afterEach(() => {
    if (existsSync(MOCK_LOG_PATH)) unlinkSync(MOCK_LOG_PATH);
  });

  it("processes 5 messages and produces correct determination distribution", async () => {
    const results = await Promise.all(
      BATCH_SCENARIO_IDS.map((scenarioId, i) =>
        runPipeline(makeBatchMessage(scenarioId, i + 1))
      )
    );

    const approvals = results.filter((r) => r.routingDecision === "AUTO_APPROVE");
    const reviews = results.filter((r) => r.routingDecision === "HUMAN_REVIEW");

    expect(approvals).toHaveLength(3);
    expect(reviews).toHaveLength(2);
  });

  it("writes 5 audit records and 2 queue records to mock log", async () => {
    await Promise.all(
      BATCH_SCENARIO_IDS.map((scenarioId, i) =>
        runPipeline(makeBatchMessage(scenarioId, i + 1))
      )
    );

    const raw = readFileSync(MOCK_LOG_PATH, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const records = lines.map((l) => JSON.parse(l));

    const auditRecords = records.filter((r) => r.table === "audit_records");
    const queueRecords = records.filter((r) => r.table === "human_review_queue");

    expect(auditRecords).toHaveLength(5);
    expect(queueRecords).toHaveLength(2);
  });

  it("each pipeline run is independent (no shared state between messages)", async () => {
    const results = await Promise.all(
      BATCH_SCENARIO_IDS.map((scenarioId, i) =>
        runPipeline(makeBatchMessage(scenarioId, i + 1))
      )
    );

    // Each result should have its own requestId (no cross-contamination)
    const requestIds = results.map((r) => r.request.requestId);
    const uniqueIds = new Set(requestIds);
    expect(uniqueIds.size).toBe(5);
  });

  it("all pipeline runs complete without unhandled errors", async () => {
    const results = await Promise.all(
      BATCH_SCENARIO_IDS.map((scenarioId, i) =>
        runPipeline(makeBatchMessage(scenarioId, i + 1))
      )
    );

    for (const result of results) {
      expect(result.auditRecordWritten).toBe(true);
      // criteriaEvalError may be null (success) or contain an error string
      // but the pipeline should still complete
    }
  });
});
