# Interview Demo Guide — prior-auth-ambient-agent

A 15-minute walkthrough covering five scenarios. Scenario 2 is the primary demo.
Have all five terminals open and services running before the interview starts.

---

## Pre-Demo Setup Checklist

```bash
# Terminal 1: Pub/Sub emulator running
gcloud beta emulators pubsub start --project=demo-project

# Terminal 2: Subscriber service running
MOCK_LLM=true MOCK_BQ=true PUBSUB_EMULATOR_HOST=localhost:8085 \
PUBSUB_PROJECT_ID=demo-project bun run src/subscriber/server.ts

# Terminal 3: Human review API running
MOCK_BQ=true bun run src/review-api/server.ts

# Terminal 4: Publisher terminal (ready to run scripts)

# Terminal 5: UI running (if using UI)
# cd ~/MyNewSoftware/prior-auth-ambient-agent-ui && bun dev

# Verify services before interview:
curl http://localhost:8080/health  # subscriber
curl http://localhost:8081/health  # review API
```

---

## Scenario 1: Architecture Walkthrough (3 min)

**Context:** Before running any code, walk through the architecture.

**Talking points:**

1. Point to the ASCII diagram in README.md or architecture.mermaid:
   - "This is an ambient agent. Nothing here triggers it — a message arrives on a Pub/Sub topic and it wakes up."
   - "The publisher on the left represents any upstream system: an EHR, a provider portal, an EDI feed."
   - "The subscriber on the right is always listening. It's a Cloud Run service with a push subscription."

2. Walk through the message flow:
   - "A prior auth request arrives as a Pub/Sub message. The subscriber decodes it and validates it against a versioned Zod schema."
   - "If it's valid, it instantiates a fresh LangGraph pipeline. One pipeline per message — no shared state between concurrent events."
   - "Three nodes: CriteriaEvalNode calls Gemini, ConfidenceRoutingNode applies the 0.80 threshold, AuditWriteNode writes to BigQuery."

3. Explain why push subscription:
   - "I chose push over pull because Cloud Run scales to zero between messages. With pull I'd need a polling loop. Push + Cloud Run is event-driven and cost-efficient — about $3-8/month for the always-on subscriber."

---

## Scenario 2: Human Review Routing (5 min) — PRIMARY DEMO

**Context:** The most important scenario. Total knee arthroplasty under Medicare Advantage with ambiguous medical necessity documentation. Confidence 0.67 → HUMAN_REVIEW.

**Run in Terminal 4:**
```bash
PUBSUB_EMULATOR_HOST=localhost:8085 PUBSUB_PROJECT_ID=demo-project \
bun run scripts/publish-scenario.ts --scenario scenario-2-human-review
```

**Watch Terminal 2 (subscriber logs):**
```
[subscriber] Accepted message | requestId=... | cptCode=27447 | planType=medicare_advantage
[subscriber] Pipeline complete | determination=HUMAN_REVIEW | confidence=0.67 | processingMs=~50ms
```

**Talking points after running:**

1. Point to the subscriber log:
   - "No user clicked anything. A message arrived on Pub/Sub, the pipeline ran in about 50 milliseconds in mock mode, and the subscriber returned to listening."
   - "Confidence came back at 0.67. That's below the 0.80 threshold."

2. Explain the routing decision:
   - "The ConfidenceRoutingNode applied the threshold: 0.67 is below 0.80, so the determination is HUMAN_REVIEW. No automated outcome was produced. It was written to the human review queue and stopped."
   - "This is the trust boundary. The agent makes no automated decision when confidence is below threshold."

3. Show the audit log (cat data/mock-audit-log.jsonl | python3 -m json.tool | head -40):
   - "Every event produces a BigQuery audit record. You can see: request ID, model version, confidence score, token counts, estimated cost, processing time. Every determination is attributable."

4. Show the review queue (curl http://localhost:8081/review-queue):
   - "The review queue has one pending item. The confidence is 0.67, the rationale explains the documentation gap."
   - "A human reviewer can open the UI, see this item, and decide: approve, deny, or return for more information."

5. Key point to land:
   - "In the compliance conversation: what's the audit trail and what can the agent do with its permissions? The BigQuery audit record answers the first question. The Terraform IAM file answers the second — two permissions only: subscribe and write."

---

## Scenario 3: Auto-Approve (2 min)

**Run in Terminal 4:**
```bash
PUBSUB_EMULATOR_HOST=localhost:8085 PUBSUB_PROJECT_ID=demo-project \
bun run scripts/publish-scenario.ts --scenario scenario-1-auto-approve
```

**Watch subscriber log:**
```
[subscriber] Pipeline complete | determination=AUTO_APPROVE | confidence=0.91 | processingMs=~50ms
```

**Talking points:**
- "Office visit for acute URI. Confidence 0.91 — well above 0.80. AUTO_APPROVE, no queue entry."
- "Compare to Scenario 2: same pipeline, same threshold, different outcome based on the clinical documentation quality."
- "The confidence distribution across a batch run is visible in the audit dashboard — you can evaluate the threshold against real workload patterns."

---

## Scenario 4: Batch Demo (2 min)

**Run in Terminal 4:**
```bash
PUBSUB_EMULATOR_HOST=localhost:8085 PUBSUB_PROJECT_ID=demo-project \
bun run scripts/publish-batch.ts
```

**Watch subscriber log:** 10 messages processed in sequence.

**Talking points:**
- "Ten messages, mix of AUTO_APPROVE and HUMAN_REVIEW. The audit log fills up."
- "In mock mode this runs in about 500ms for all 10. In live Gemini mode, roughly 2 seconds per determination — parallel event processing would be faster."
- "Cumulative cost visible in the audit records. At Gemini Flash pricing, 100 determinations cost about $0.01."

---

## Scenario 5: Design Decisions Deep Dive (3 min)

Questions the interviewer is likely to ask:

**"Why three nodes and not more?"**
> The full four-node pattern with HumanReviewNode interrupt is in payer-auth-intelligence. I kept three nodes here because the new architectural work is the ambient activation layer, not the pipeline internals. CriteriaEvalNode isolates the Gemini call, ConfidenceRoutingNode is pure logic with no external calls and cannot fail, AuditWriteNode isolates the BigQuery write. A BigQuery failure doesn't retry the Gemini call. Failure modes are isolated.

**"Why Gemini Flash and not Ultra?"**
> Prior auth determination is a structured classification task. I give the model a JSON output schema and scoring rubric. Flash is cost-optimized for constrained output schemas. Ultra adds latency and cost with no quality improvement for this task. If clinical notes were more ambiguous, the confidence routing handles it — it routes to human review rather than forcing the model to produce a high-confidence determination on weak input.

**"Why BigQuery for audit?"**
> Append-only, high-volume, needs to be queryable by compliance teams who already use BigQuery. Cloud SQL adds operational overhead. Firestore is document-oriented and not analytics-native. BigQuery is the correct enterprise audit sink. Trade-off is streaming insert latency of a few seconds, which is acceptable for an audit log.

**"How does this compare to payer-auth-intelligence?"**
> payer-auth-intelligence is user-invoked — a human opens the UI and submits a request. This prototype is ambient — nothing triggers it, events arrive from an upstream system and it processes them without any human initiation. Different activation pattern, same problem domain. auth-a2a-agent-network adds a third pattern: agent-to-agent negotiation where a provider AI and a payer AI negotiate directly. I built all three to understand the architectural tradeoffs of each activation model.

---

## Fallback: If Something Breaks

- Pub/Sub emulator not running: show the subscriber logs from a previous demo run
- Review API down: show the raw JSONL file and explain what the API surfaces
- Mock audit log not updating: check MOCK_BQ=true is set; tail the JSONL file manually
- Demo track always zero GCP calls — nothing should fail on network or credentials
