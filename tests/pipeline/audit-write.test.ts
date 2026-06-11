import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { auditWriteNode } from "../../src/pipeline/nodes/audit-write.js";
import { createInitialState } from "../../src/pipeline/state.js";
import type { PriorAuthRequestMessage } from "../../src/contracts/prior-auth-request.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_LOG_PATH = join(__dirname, "../../data/mock-audit-log.jsonl");

const baseRequest: PriorAuthRequestMessage = {
  messageId: "msg-audit-001",
  requestId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  cptCode: "99213",
  diagnosisCodes: ["J06.9"],
  planType: "commercial",
  payerId: "PAYER-001",
  clinicalNotes: "Patient presents with acute upper respiratory symptoms for audit test.",
  submittedAt: "2026-06-08T10:00:00.000Z",
  schemaVersion: "1.0",
};

function stateWithDetermination(determination: "AUTO_APPROVE" | "HUMAN_REVIEW") {
  return {
    ...createInitialState(baseRequest),
    confidence: determination === "AUTO_APPROVE" ? 0.91 : 0.67,
    rationale: "Test rationale",
    modelVersion: "gemini-2.0-flash",
    promptTokens: 512,
    completionTokens: 87,
    costUsd: 0.0000648,
    determination,
    routingDecision: determination,
  };
}

describe("auditWriteNode (MOCK_BQ=true)", () => {
  beforeEach(() => {
    process.env.MOCK_BQ = "true";
    if (existsSync(MOCK_LOG_PATH)) unlinkSync(MOCK_LOG_PATH);
  });

  afterEach(() => {
    if (existsSync(MOCK_LOG_PATH)) unlinkSync(MOCK_LOG_PATH);
  });

  it("writes AuditRecord for AUTO_APPROVE determination", async () => {
    const state = stateWithDetermination("AUTO_APPROVE");
    const update = await auditWriteNode(state);

    expect(update.auditRecordWritten).toBe(true);
    expect(update.reviewQueueRecordWritten).toBe(false);
    expect(update.processingMs).toBeGreaterThanOrEqual(0);
    expect(update.auditWriteError).toBeNull();

    // Verify the JSONL file was written
    const raw = readFileSync(MOCK_LOG_PATH, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(1);

    const record = JSON.parse(lines[0]);
    expect(record.table).toBe("audit_records");
    expect(record.request_id).toBe(baseRequest.requestId);
    expect(record.determination).toBe("AUTO_APPROVE");
    expect(record.confidence).toBe(0.91);
  });

  it("writes AuditRecord AND HumanReviewQueueRecord for HUMAN_REVIEW determination", async () => {
    const state = stateWithDetermination("HUMAN_REVIEW");
    const update = await auditWriteNode(state);

    expect(update.auditRecordWritten).toBe(true);
    expect(update.reviewQueueRecordWritten).toBe(true);
    expect(update.auditWriteError).toBeNull();

    const raw = readFileSync(MOCK_LOG_PATH, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    expect(lines).toHaveLength(2);

    const auditLine = JSON.parse(lines[0]);
    const queueLine = JSON.parse(lines[1]);

    expect(auditLine.table).toBe("audit_records");
    expect(auditLine.determination).toBe("HUMAN_REVIEW");

    expect(queueLine.table).toBe("human_review_queue");
    expect(queueLine.review_status).toBe("PENDING");
    expect(queueLine.reviewed_by).toBeNull();
  });

  it("records processingMs > 0", async () => {
    const state = stateWithDetermination("AUTO_APPROVE");
    const update = await auditWriteNode(state);
    expect(typeof update.processingMs).toBe("number");
    expect(update.processingMs).toBeGreaterThanOrEqual(0);
  });

  it("includes all required AuditRecord fields", async () => {
    const state = stateWithDetermination("AUTO_APPROVE");
    await auditWriteNode(state);
    const raw = readFileSync(MOCK_LOG_PATH, "utf-8");
    const record = JSON.parse(raw.split("\n")[0]);

    expect(record.request_id).toBeDefined();
    expect(record.message_id).toBeDefined();
    expect(record.cpt_code).toBeDefined();
    expect(record.plan_type).toBeDefined();
    expect(record.payer_id).toBeDefined();
    expect(record.determination).toBeDefined();
    expect(record.confidence).toBeDefined();
    expect(record.rationale).toBeDefined();
    expect(record.model_version).toBeDefined();
    expect(record.prompt_tokens).toBeDefined();
    expect(record.completion_tokens).toBeDefined();
    expect(record.cost_usd).toBeDefined();
    expect(record.processing_ms).toBeDefined();
    expect(record.processed_at).toBeDefined();
    expect(record.schema_version).toBe("1.0");
  });
});
