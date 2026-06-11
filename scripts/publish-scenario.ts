/**
 * publish-scenario.ts — Publish a named scenario payload to the Pub/Sub topic.
 *
 * Usage:
 *   PUBSUB_EMULATOR_HOST=localhost:8085 bun run scripts/publish-scenario.ts --scenario scenario-2-human-review
 *   GCP_PROJECT_ID=my-project bun run scripts/publish-scenario.ts --scenario scenario-1-auto-approve --live
 */
import { PubSub } from "@google-cloud/pubsub";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Scenario {
  id: string;
  name: string;
  description: string;
  payload: Record<string, unknown>;
}

function parseArgs(): { scenario: string; live: boolean } {
  const args = process.argv.slice(2);
  const scenarioIdx = args.indexOf("--scenario");
  const scenario = scenarioIdx >= 0 ? args[scenarioIdx + 1] : null;
  if (!scenario) {
    console.error("Usage: publish-scenario.ts --scenario <scenario-id> [--live]");
    process.exit(1);
  }
  return { scenario, live: args.includes("--live") };
}

async function publish() {
  const { scenario: scenarioId, live } = parseArgs();

  const scenariosPath = join(__dirname, "../data/scenarios.json");
  const scenarios: Scenario[] = JSON.parse(readFileSync(scenariosPath, "utf-8"));
  const scenario = scenarios.find((s) => s.id === scenarioId);

  if (!scenario) {
    console.error(`[publish-scenario] Unknown scenario: ${scenarioId}`);
    console.error(`Available: ${scenarios.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  const projectId = live
    ? (process.env.GCP_PROJECT_ID ?? (() => { throw new Error("GCP_PROJECT_ID required for --live"); })())
    : (process.env.PUBSUB_PROJECT_ID ?? "demo-project");

  const pubsub = new PubSub({ projectId });
  const topicName = "prior-auth-requests";

  // Override requestId with a fresh UUID for each publish so each run is unique
  const payload = {
    ...scenario.payload,
    requestId: randomUUID(),
    submittedAt: new Date().toISOString(),
  };

  const messageBuffer = Buffer.from(JSON.stringify(payload));
  const messageId = await pubsub.topic(topicName).publish(messageBuffer);

  console.log(`[publish-scenario] Published scenario: ${scenario.name}`);
  console.log(`[publish-scenario] Description: ${scenario.description}`);
  console.log(`[publish-scenario] Pub/Sub messageId: ${messageId}`);
  console.log(`[publish-scenario] requestId: ${payload.requestId as string}`);
  console.log(`[publish-scenario] scenarioId: ${payload.scenarioId as string ?? "none"}`);
  console.log(`[publish-scenario] mode: ${live ? "LIVE GCP" : "emulator"}`);
}

publish().catch((err) => {
  console.error("[publish-scenario] Fatal:", err);
  process.exit(1);
});
