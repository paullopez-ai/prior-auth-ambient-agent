import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { runPipeline } from "../../src/pipeline/graph.js";
import type { PriorAuthRequestMessage } from "../../src/contracts/prior-auth-request.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_LOG_PATH = join(__dirname, "../../data/mock-audit-log.jsonl");

const scenario2Message: PriorAuthRequestMessage = {
  messageId: "pubsub-sc2-001",
  requestId: "22222222-2222-2222-2222-222222222222",
  cptCode: "27447",
  diagnosisCodes: ["M17.11"],
  planType: "medicare_advantage",
  payerId: "PAYER-HUMANA-001",
  clinicalNotes:
    "Patient is a 68-year-old male with bilateral knee osteoarthritis, worse on the right. Reports knee pain limiting daily activities. Has completed some physical therapy in the past. X-ray shows moderate joint space narrowing. Requesting total knee arthroplasty on right knee.",
  submittedAt: "2026-06-08T10:05:00.000Z",
  schemaVersion: "1.0",
  scenarioId: "scenario-2-human-review",
};

describe("Scenario 2: Human Review Routing (primary interview scenario)", () => {
  beforeEach(() => {
    process.env.MOCK_LLM = "true";
    process.env.MOCK_BQ = "true";
    if (existsSync(MOCK_LOG_PATH)) unlinkSync(MOCK_LOG_PATH);
  });

  afterEach(() => {
    if (existsSync(MOCK_LOG_PATH)) unlinkSync(MOCK_LOG_PATH);
  });

  it("produces HUMAN_REVIEW determination with confidence < 0.80", async () => {
    const finalState = await runPipeline(scenario2Message);

    expect(finalState.routingDecision).toBe("HUMAN_REVIEW");
    expect(finalState.confidence).toBeLessThan(0.80);
  });

  it("writes two records: one audit_record + one human_review_queue", async () => {
    await runPipeline(scenario2Message);

    const raw = readFileSync(MOCK_LOG_PATH, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(2);

    const auditRecord = JSON.parse(lines[0]);
    const queueRecord = JSON.parse(lines[1]);

    expect(auditRecord.table).toBe("audit_records");
    expect(auditRecord.determination).toBe("HUMAN_REVIEW");

    expect(queueRecord.table).toBe("human_review_queue");
    expect(queueRecord.review_status).toBe("PENDING");
  });

  it("queue record has null review fields (awaiting human review)", async () => {
    await runPipeline(scenario2Message);

    const raw = readFileSync(MOCK_LOG_PATH, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const queueRecord = JSON.parse(lines[1]);

    expect(queueRecord.reviewed_by).toBeNull();
    expect(queueRecord.reviewed_at).toBeNull();
    expect(queueRecord.review_notes).toBeNull();
  });

  it("pipeline state shows both records written", async () => {
    const finalState = await runPipeline(scenario2Message);
    expect(finalState.auditRecordWritten).toBe(true);
    expect(finalState.reviewQueueRecordWritten).toBe(true);
    expect(finalState.criteriaEvalError).toBeNull();
    expect(finalState.auditWriteError).toBeNull();
  });

  it("determination is not auto-applied — only queued for human review", async () => {
    const finalState = await runPipeline(scenario2Message);
    // The routing decision is HUMAN_REVIEW — no automated outcome produced
    expect(finalState.routingDecision).toBe("HUMAN_REVIEW");
    // Confirm it was queued, not auto-applied
    expect(finalState.reviewQueueRecordWritten).toBe(true);
  });
});
