import { appendFileSync, readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { AuditRecord, HumanReviewQueueRecord } from "../contracts/audit-record.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MOCK_AUDIT_LOG_PATH = join(__dirname, "../../data/mock-audit-log.jsonl");
const DATASET_ID = "prior_auth_ambient";
const AUDIT_TABLE = "audit_records";
const QUEUE_TABLE = "human_review_queue";

// Ensure the mock audit log file exists
function ensureMockLogExists(): void {
  if (!existsSync(MOCK_AUDIT_LOG_PATH)) {
    writeFileSync(MOCK_AUDIT_LOG_PATH, "", "utf-8");
  }
}

export async function writeAuditRecord(record: AuditRecord): Promise<void> {
  const mockBq = process.env.MOCK_BQ === "true";

  if (mockBq) {
    ensureMockLogExists();
    const line = JSON.stringify({ table: AUDIT_TABLE, ...record }) + "\n";
    appendFileSync(MOCK_AUDIT_LOG_PATH, line, "utf-8");
    return;
  }

  // Live BigQuery path
  const { BigQuery } = await import("@google-cloud/bigquery");
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("GCP_PROJECT_ID required for live BigQuery writes");

  const bq = new BigQuery({ projectId });
  await bq.dataset(DATASET_ID).table(AUDIT_TABLE).insert([record]);
}

export async function writeReviewQueueRecord(record: HumanReviewQueueRecord): Promise<void> {
  const mockBq = process.env.MOCK_BQ === "true";

  if (mockBq) {
    ensureMockLogExists();
    const line = JSON.stringify({ table: QUEUE_TABLE, ...record }) + "\n";
    appendFileSync(MOCK_AUDIT_LOG_PATH, line, "utf-8");
    return;
  }

  const { BigQuery } = await import("@google-cloud/bigquery");
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("GCP_PROJECT_ID required for live BigQuery writes");

  const bq = new BigQuery({ projectId });
  await bq.dataset(DATASET_ID).table(QUEUE_TABLE).insert([record]);
}

export async function getAuditRecords(): Promise<AuditRecord[]> {
  const mockBq = process.env.MOCK_BQ === "true";

  if (mockBq) {
    if (!existsSync(MOCK_AUDIT_LOG_PATH)) return [];
    const raw = readFileSync(MOCK_AUDIT_LOG_PATH, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
      .filter((r) => r.table === AUDIT_TABLE)
      .map(({ table: _table, ...rest }) => rest as AuditRecord)
      .reverse(); // newest first
  }

  const { BigQuery } = await import("@google-cloud/bigquery");
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("GCP_PROJECT_ID required");

  const bq = new BigQuery({ projectId });
  const [rows] = await bq.query({
    query: `SELECT * FROM \`${projectId}.${DATASET_ID}.${AUDIT_TABLE}\` ORDER BY processed_at DESC LIMIT 100`,
  });
  return rows as AuditRecord[];
}

export async function getReviewQueueRecords(): Promise<HumanReviewQueueRecord[]> {
  const mockBq = process.env.MOCK_BQ === "true";

  if (mockBq) {
    if (!existsSync(MOCK_AUDIT_LOG_PATH)) return [];
    const raw = readFileSync(MOCK_AUDIT_LOG_PATH, "utf-8");
    const allRecords = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
      .filter((r) => r.table === QUEUE_TABLE)
      .map(({ table: _table, ...rest }) => rest as HumanReviewQueueRecord);

    // Return only latest status per request_id
    const byId = new Map<string, HumanReviewQueueRecord>();
    for (const record of allRecords) {
      byId.set(record.request_id, record);
    }
    return Array.from(byId.values()).reverse();
  }

  const { BigQuery } = await import("@google-cloud/bigquery");
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("GCP_PROJECT_ID required");

  const bq = new BigQuery({ projectId });
  const [rows] = await bq.query({
    query: `SELECT * FROM \`${projectId}.${DATASET_ID}.${QUEUE_TABLE}\` ORDER BY queued_at DESC`,
  });
  return rows as HumanReviewQueueRecord[];
}

export async function updateReviewDecision(
  requestId: string,
  decision: "APPROVED" | "DENIED" | "RETURNED",
  reviewedBy: string,
  reviewNotes: string | null
): Promise<void> {
  const mockBq = process.env.MOCK_BQ === "true";
  const now = new Date().toISOString();

  if (mockBq) {
    // Read all lines, update the matching record, rewrite the file
    if (!existsSync(MOCK_AUDIT_LOG_PATH)) return;
    const raw = readFileSync(MOCK_AUDIT_LOG_PATH, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const updated = lines.map((line) => {
      const parsed = JSON.parse(line);
      if (parsed.table === QUEUE_TABLE && parsed.request_id === requestId) {
        return JSON.stringify({
          ...parsed,
          review_status: decision,
          reviewed_by: reviewedBy,
          reviewed_at: now,
          review_notes: reviewNotes,
        });
      }
      return line;
    });
    writeFileSync(MOCK_AUDIT_LOG_PATH, updated.join("\n") + "\n", "utf-8");
    return;
  }

  const { BigQuery } = await import("@google-cloud/bigquery");
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("GCP_PROJECT_ID required");

  const bq = new BigQuery({ projectId });
  await bq.query({
    query: `UPDATE \`${projectId}.${DATASET_ID}.${QUEUE_TABLE}\`
            SET review_status = @decision,
                reviewed_by = @reviewedBy,
                reviewed_at = @reviewedAt,
                review_notes = @reviewNotes
            WHERE request_id = @requestId`,
    params: {
      decision,
      reviewedBy,
      reviewedAt: now,
      reviewNotes,
      requestId,
    },
  });
}
