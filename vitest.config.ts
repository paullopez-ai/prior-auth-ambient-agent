import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    env: {
      MOCK_LLM: "true",
      MOCK_BQ: "true",
      CONFIDENCE_THRESHOLD: "0.80",
      PUBSUB_PROJECT_ID: "demo-project",
      SUBSCRIBER_PORT: "8080",
      REVIEW_API_PORT: "8081",
    },
  },
});
