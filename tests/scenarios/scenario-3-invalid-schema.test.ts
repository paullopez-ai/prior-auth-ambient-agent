import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/subscriber/server.js";
import { PriorAuthRequestSchema } from "../../src/contracts/prior-auth-request.js";

function makePubSubEnvelope(payload: unknown) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64");
  return {
    message: {
      data,
      messageId: "pubsub-sc3-001",
      publishTime: "2026-06-08T10:10:00.000Z",
    },
    subscription: "projects/demo-project/subscriptions/prior-auth-subscriber-push",
  };
}

describe("Scenario 3: Invalid Schema — Graceful Rejection", () => {
  it("Zod rejects payload with missing required fields", () => {
    const malformed = {
      requestId: "not-a-uuid",
      cptCode: "INVALID",
      diagnosisCodes: [],
      planType: "unknown_plan",
      schemaVersion: "1.0",
    };
    const result = PriorAuthRequestSchema.safeParse(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should flag: requestId, cptCode, diagnosisCodes, planType, missing fields
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("subscriber returns HTTP 400 for malformed envelope (missing message.data)", async () => {
    const res = await request(app)
      .post("/pubsub/push")
      .send({ message: {}, subscription: "test" });
    expect(res.status).toBe(400);
  });

  it("subscriber returns HTTP 400 for invalid JSON in message.data", async () => {
    const res = await request(app).post("/pubsub/push").send({
      message: {
        data: Buffer.from("not-valid-json").toString("base64"),
        messageId: "msg-001",
      },
    });
    expect(res.status).toBe(400);
  });

  it("subscriber returns HTTP 400 for schema-invalid payload", async () => {
    const invalidPayload = {
      requestId: "not-a-uuid",
      cptCode: "INVALID",
      diagnosisCodes: [],
      planType: "unknown_plan",
      schemaVersion: "1.0",
    };
    const res = await request(app)
      .post("/pubsub/push")
      .send(makePubSubEnvelope(invalidPayload));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Schema validation failed");
  });

  it("subscriber returns HTTP 200 for valid payload (schema accepted)", async () => {
    const validPayload = {
      requestId: "11111111-1111-1111-1111-111111111111",
      cptCode: "99213",
      diagnosisCodes: ["J06.9"],
      planType: "commercial",
      payerId: "PAYER-001",
      clinicalNotes: "Patient presents with acute upper respiratory symptoms for test.",
      submittedAt: "2026-06-08T10:00:00.000Z",
      schemaVersion: "1.0",
      scenarioId: "scenario-1-auto-approve",
    };
    const res = await request(app)
      .post("/pubsub/push")
      .send(makePubSubEnvelope(validPayload));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("accepted");
  });
});
