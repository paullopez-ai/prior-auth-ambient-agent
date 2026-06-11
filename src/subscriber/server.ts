import express, { type Request, type Response } from "express";
import { PriorAuthRequestSchema } from "../contracts/prior-auth-request.js";
import { runPipeline } from "../pipeline/graph.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = parseInt(process.env.SUBSCRIBER_PORT ?? "8080", 10);

/**
 * POST /pubsub/push — Pub/Sub push subscription endpoint.
 *
 * Pub/Sub delivers messages as HTTP POST with a JSON envelope:
 * {
 *   "message": {
 *     "data": "<base64-encoded JSON payload>",
 *     "messageId": "...",
 *     "publishTime": "..."
 *   },
 *   "subscription": "projects/.../subscriptions/..."
 * }
 *
 * Response contract:
 *   HTTP 200 — message acknowledged; Pub/Sub will not redeliver
 *   HTTP 400 — malformed envelope or schema validation failure; terminal (no retry)
 *   HTTP 500 — processing error; Pub/Sub retries with backoff
 *
 * Processing is async: we acknowledge immediately (HTTP 200) and run the pipeline.
 * This prevents Pub/Sub from timing out on the push while the LLM call executes.
 */
app.post("/pubsub/push", (req: Request, res: Response) => {
  const envelope = req.body as {
    message?: { data?: string; messageId?: string; publishTime?: string };
    subscription?: string;
  };

  // Validate envelope structure
  if (!envelope.message?.data) {
    console.error("[subscriber] Invalid Pub/Sub envelope: missing message.data");
    res.status(400).json({ error: "Invalid Pub/Sub envelope: missing message.data" });
    return;
  }

  // Decode base64 payload
  let rawPayload: unknown;
  try {
    const decoded = Buffer.from(envelope.message.data, "base64").toString("utf-8");
    rawPayload = JSON.parse(decoded);
  } catch (err) {
    console.error("[subscriber] Failed to decode Pub/Sub message data:", err);
    res.status(400).json({ error: "Failed to decode message data" });
    return;
  }

  // Inject Pub/Sub messageId into payload (it lives in the envelope, not the data)
  const payloadWithMessageId = {
    ...(rawPayload as Record<string, unknown>),
    messageId: envelope.message.messageId ?? "unknown",
  };

  // Validate against versioned Zod schema
  const parsed = PriorAuthRequestSchema.safeParse(payloadWithMessageId);
  if (!parsed.success) {
    console.error(
      "[subscriber] Schema validation failed:",
      JSON.stringify(parsed.error.flatten())
    );
    res.status(400).json({
      error: "Schema validation failed",
      details: parsed.error.flatten(),
    });
    return;
  }

  const message = parsed.data;
  console.log(
    `[subscriber] Accepted message | requestId=${message.requestId} | cptCode=${message.cptCode} | planType=${message.planType} | scenarioId=${message.scenarioId ?? "none"}`
  );

  // Acknowledge immediately; process async
  res.status(200).json({ status: "accepted" });

  // Run the LangGraph pipeline without blocking the HTTP response
  setImmediate(() => {
    runPipeline(message)
      .then((finalState) => {
        console.log(
          `[subscriber] Pipeline complete | requestId=${message.requestId} | determination=${finalState.routingDecision} | confidence=${finalState.confidence?.toFixed(2)} | processingMs=${finalState.processingMs} | auditWritten=${finalState.auditRecordWritten}`
        );
        if (finalState.criteriaEvalError) {
          console.warn(`[subscriber] CriteriaEvalNode error: ${finalState.criteriaEvalError}`);
        }
        if (finalState.auditWriteError) {
          console.error(`[subscriber] AuditWriteNode error: ${finalState.auditWriteError}`);
        }
      })
      .catch((err) => {
        console.error(
          `[subscriber] Unhandled pipeline error | requestId=${message.requestId}:`,
          err
        );
      });
  });
});

/**
 * GET /health — liveness check for Cloud Run and demo startup verification.
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "prior-auth-ambient-agent-subscriber",
    mockLlm: process.env.MOCK_LLM === "true",
    mockBq: process.env.MOCK_BQ === "true",
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD ?? "0.80"),
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[subscriber] Listening on port ${PORT}`);
  console.log(`[subscriber] MOCK_LLM=${process.env.MOCK_LLM ?? "false"} MOCK_BQ=${process.env.MOCK_BQ ?? "false"}`);
  console.log(
    `[subscriber] PUBSUB_EMULATOR_HOST=${process.env.PUBSUB_EMULATOR_HOST ?? "(not set — live mode)"}`
  );
});

export default app;
