import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { runPipeline } from "../../src/pipeline/graph.js";
import type { PriorAuthRequestMessage } from "../../src/contracts/prior-auth-request.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_LOG_PATH = join(__dirname, "../../data/mock-audit-log.jsonl");

const scenario1Message: PriorAuthRequestMessage = {
  messageId: "pubsub-sc1-001",
  requestId: "11111111-1111-1111-1111-111111111111",
  cptCode: "99213",
  diagnosisCodes: ["J06.9"],
  planType: "commercial",
  payerId: "PAYER-ANTHEM-001",
  clinicalNotes:
    "Patient presents with 3-day history of sore throat, runny nose, and low-grade fever (99.8F). No strep on rapid test. Diagnosis: acute upper respiratory infection (J06.9). Supportive care recommended.",
  submittedAt: "2026-06-08T10:00:00.000Z",
  schemaVersion: "1.0",
  scenarioId: "scenario-1-auto-approve",
};

describe("Scenario 1: Clean Auto-Approve", () => {
  beforeEach(() => {
    process.env.MOCK_LLM = "true";
    process.env.MOCK_BQ = "true";
    if (existsSync(MOCK_LOG_PATH)) unlinkSync(MOCK_LOG_PATH);
  });

  afterEach(() => {
    if (existsSync(MOCK_LOG_PATH)) unlinkSync(MOCK_LOG_PATH);
  });

  it("produces AUTO_APPROVE determination with confidence >= 0.80", async () => {
    const finalState = await runPipeline(scenario1Message);

    expect(finalState.routingDecision).toBe("AUTO_APPROVE");
    expect(finalState.confidence).toBeGreaterThanOrEqual(0.80);
  });

  it("writes one AuditRecord to mock log (no queue record)", async () => {
    await runPipeline(scenario1Message);

    const raw = readFileSync(MOCK_LOG_PATH, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    // 1 audit_records entry, 0 human_review_queue entries
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).table).toBe("audit_records");
    expect(JSON.parse(lines[0]).determination).toBe("AUTO_APPROVE");
  });

  it("audit record contains cost and token fields", async () => {
    await runPipeline(scenario1Message);

    const raw = readFileSync(MOCK_LOG_PATH, "utf-8");
    const record = JSON.parse(raw.split("\n")[0]);
    expect(record.prompt_tokens).toBeGreaterThan(0);
    expect(record.completion_tokens).toBeGreaterThan(0);
    expect(record.cost_usd).toBeGreaterThan(0);
    expect(record.processing_ms).toBeGreaterThanOrEqual(0);
  });

  it("pipeline state reflects a clean run (no errors)", async () => {
    const finalState = await runPipeline(scenario1Message);
    expect(finalState.criteriaEvalError).toBeNull();
    expect(finalState.auditWriteError).toBeNull();
    expect(finalState.auditRecordWritten).toBe(true);
    expect(finalState.reviewQueueRecordWritten).toBe(false);
  });
});
