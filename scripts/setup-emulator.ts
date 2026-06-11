/**
 * setup-emulator.ts — Create the Pub/Sub topic and push subscription in the local emulator.
 *
 * Run once after starting the Pub/Sub emulator:
 *   PUBSUB_EMULATOR_HOST=localhost:8085 bun run scripts/setup-emulator.ts
 */
import { PubSub } from "@google-cloud/pubsub";

const PROJECT_ID = process.env.PUBSUB_PROJECT_ID ?? "demo-project";
const TOPIC_NAME = "prior-auth-requests";
const SUBSCRIPTION_NAME = "prior-auth-subscriber-push";
const SUBSCRIBER_URL = `http://localhost:${process.env.SUBSCRIBER_PORT ?? "8080"}/pubsub/push`;

async function setupEmulator() {
  const pubsub = new PubSub({ projectId: PROJECT_ID });

  // Create topic
  try {
    await pubsub.createTopic(TOPIC_NAME);
    console.log(`[setup-emulator] Created topic: ${TOPIC_NAME}`);
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code === 6) {
      console.log(`[setup-emulator] Topic already exists: ${TOPIC_NAME}`);
    } else {
      throw err;
    }
  }

  // Create push subscription pointing to local subscriber
  const topic = pubsub.topic(TOPIC_NAME);
  try {
    await topic.createSubscription(SUBSCRIPTION_NAME, {
      pushConfig: { pushEndpoint: SUBSCRIBER_URL },
    });
    console.log(`[setup-emulator] Created push subscription: ${SUBSCRIPTION_NAME} → ${SUBSCRIBER_URL}`);
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code === 6) {
      console.log(`[setup-emulator] Subscription already exists: ${SUBSCRIPTION_NAME}`);
    } else {
      throw err;
    }
  }

  console.log("[setup-emulator] Emulator setup complete.");
  console.log(`[setup-emulator] Topic:        projects/${PROJECT_ID}/topics/${TOPIC_NAME}`);
  console.log(`[setup-emulator] Subscription: projects/${PROJECT_ID}/subscriptions/${SUBSCRIPTION_NAME}`);
}

setupEmulator().catch((err) => {
  console.error("[setup-emulator] Fatal error:", err);
  process.exit(1);
});
