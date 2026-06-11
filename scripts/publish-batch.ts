/**
 * publish-batch.ts — Publish 10 messages for the Scenario 4 batch demo.
 * Mix of AUTO_APPROVE and HUMAN_REVIEW scenario IDs to demonstrate confidence distribution.
 *
 * Usage:
 *   PUBSUB_EMULATOR_HOST=localhost:8085 bun run scripts/publish-batch.ts
 */
import { PubSub } from "@google-cloud/pubsub";
import { randomUUID } from "crypto";

const BATCH_SCENARIO_IDS = [
  "scenario-4-batch-approve-1",
  "scenario-4-batch-approve-2",
  "scenario-4-batch-approve-3",
  "scenario-4-batch-review-1",
  "scenario-4-batch-review-2",
  "scenario-4-batch-approve-1",
  "scenario-4-batch-approve-2",
  "scenario-4-batch-review-1",
  "scenario-4-batch-approve-3",
  "scenario-4-batch-review-2",
];

const CPT_CODES = ["99213", "27447", "70553", "43239", "29827", "99214", "20610", "97110", "90834", "99205"];
const PLAN_TYPES = ["commercial", "medicare_advantage", "medicaid", "commercial", "commercial",
                    "medicare_advantage", "commercial", "medicaid", "commercial", "medicare_advantage"];
const PAYER_IDS = ["PAYER-ANTHEM-001", "PAYER-HUMANA-001", "PAYER-BCBS-001", "PAYER-MEDICAID-TN-001",
                   "PAYER-AETNA-001", "PAYER-HUMANA-002", "PAYER-ANTHEM-002", "PAYER-MEDICAID-GA-001",
                   "PAYER-BCBS-002", "PAYER-CIGNA-001"];
const ICD10_CODES = [["J06.9"], ["M17.11"], ["G35"], ["K21.0", "K22.2"], ["M75.1"],
                     ["J45.41"], ["M25.561"], ["M54.5"], ["F32.1"], ["Z00.00"]];

async function publishBatch() {
  const projectId = process.env.PUBSUB_PROJECT_ID ?? "demo-project";
  const pubsub = new PubSub({ projectId });
  const topicName = "prior-auth-requests";
  const topic = pubsub.topic(topicName);

  console.log(`[publish-batch] Publishing ${BATCH_SCENARIO_IDS.length} messages to ${topicName}...`);

  const publishedIds: string[] = [];
  for (let i = 0; i < BATCH_SCENARIO_IDS.length; i++) {
    const scenarioId = BATCH_SCENARIO_IDS[i];
    const payload = {
      requestId: randomUUID(),
      cptCode: CPT_CODES[i],
      diagnosisCodes: ICD10_CODES[i],
      planType: PLAN_TYPES[i] as "commercial" | "medicare_advantage" | "medicaid",
      payerId: PAYER_IDS[i],
      clinicalNotes: `Synthetic clinical notes for batch message ${i + 1}. Patient presents with documented medical necessity for requested procedure. Prior conservative treatment documented per plan guidelines.`,
      submittedAt: new Date().toISOString(),
      schemaVersion: "1.0" as const,
      scenarioId,
    };

    const messageId = await topic.publish(Buffer.from(JSON.stringify(payload)));
    publishedIds.push(messageId);
    console.log(`[publish-batch] [${i + 1}/10] Published | scenarioId=${scenarioId} | pubsubId=${messageId}`);
  }

  console.log(`[publish-batch] Batch complete. ${publishedIds.length} messages published.`);
  console.log("[publish-batch] Expected: 6 AUTO_APPROVE, 4 HUMAN_REVIEW determinations");
  console.log("[publish-batch] Check data/mock-audit-log.jsonl for results.");
}

publishBatch().catch((err) => {
  console.error("[publish-batch] Fatal:", err);
  process.exit(1);
});
