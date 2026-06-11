# PRD: prior-auth-ambient-agent
<!-- prd:version=1.0 -->
<!-- prd:status=draft -->
<!-- prd:author=Paul Lopez -->
<!-- prd:created=2026-06-08 -->
<!-- prd:repo=paullopez-ai/prior-auth-ambient-agent -->
<!-- prd:ui-repo=~/MyNewSoftware/prior-auth-ambient-agent-ui -->
<!-- prd:demo-track=synthetic -->
<!-- prd:hyperscaler-track=gcp -->
<!-- prd:skills-primary=[1,2,3,5] -->
<!-- prd:skills-secondary=[6,7] -->

---

## SECTION 0: PRD METADATA

| Field | Value |
|-------|-------|
| Prototype name | Prior Auth Ambient Agent |
| Core repo | `paullopez-ai/prior-auth-ambient-agent` |
| UI repo | `~/MyNewSoftware/prior-auth-ambient-agent-ui` |
| Primary client type | Healthcare payer |
| Business problem | Always-on, event-triggered prior authorization agent that activates without user invocation |
| Language | TypeScript (Node.js, bun) |
| API framework | Express |
| Workflow framework | LangGraph.js (TypeScript) |
| Inference backend | Vertex AI (Gemini) via Google Cloud AI SDK |
| Event trigger | Google Cloud Pub/Sub |
| Compute | Cloud Run (subscriber service + human review API) |
| Audit sink | BigQuery |
| IaC tool | Terraform |
| Demo track | MOCK_LLM=true, local Pub/Sub emulator, local BigQuery emulator |
| Live demo track | Real GCP: Pub/Sub, Cloud Run, BigQuery, Vertex AI (Gemini) |

### 0.1 What This Prototype Is and Is Not

This prototype demonstrates the **ambient trigger pattern**: an always-on agent that
activates from a Pub/Sub event without any user clicking anything. A prior auth
request message arrives on the topic, the subscriber wakes, the LangGraph pipeline
runs, confidence routing determines the outcome, and a BigQuery audit record is
written. The agent returns to listening.

This is NOT a port of `payer-auth-intelligence`. That repo demonstrates a
user-invoked LangGraph pipeline on AWS Bedrock with a full four-node graph,
HumanReviewNode interrupt, and Next.js UI. This repo references that work as the
"full pipeline" and keeps the LangGraph internals to three focused nodes. The new
architectural work here is:
- The Pub/Sub event contract and subscriber service
- The ambient activation model (no user invocation)
- Vertex AI Gemini as the inference backend
- BigQuery as the audit trail sink
- IAM-scoped access as the trust boundary
- Terraform for GCP infrastructure

---

## SECTION 1: PURPOSE AND PORTFOLIO POSITIONING

### 1.1 One-Paragraph Description

`prior-auth-ambient-agent` is an always-on, event-triggered prior authorization
agent that activates from a Google Cloud Pub/Sub message without any user
invocation. When a prior authorization request arrives on the Pub/Sub topic, a
Cloud Run subscriber service receives the event, instantiates a LangGraph pipeline
backed by Vertex AI Gemini, evaluates the request against clinical criteria,
routes the determination based on confidence (auto-approve above 0.80, human
review queue below), and writes a full audit record to BigQuery. The agent
then returns to listening. No user clicks anything. The pipeline is always-on,
event-driven, and auditable from the first message.

### 1.2 Why This Prototype Exists

The existing portfolio already demonstrates explicit user-invoked prior
authorization pipelines (`payer-auth-intelligence`, `auth-a2a-agent-network`).
What it does not have is an ambient agent: one that activates from an event stream
without human initiation. This pattern is specifically called out in senior AI
architect job descriptions as a preferred capability and is increasingly how
enterprise healthcare AI systems are architected. Additionally, the portfolio has
AWS depth but no standalone GCP prototype. This prototype closes both gaps with a
focused, honest build: the ambient activation layer is the new work; the LangGraph
orchestration pattern references the existing repos.

### 1.3 Portfolio Narrative

This prototype extends the prior authorization narrative arc in the portfolio:
- `prior-auth-radar`: provider-side denial risk detection
- `payer-auth-intelligence`: user-invoked payer-side LangGraph pipeline (AWS)
- `auth-a2a-agent-network`: A2A inter-agent negotiation between provider and payer
- `prior-auth-ambient-agent`: ambient event-triggered payer-side agent (GCP)

The arc now covers user-invoked, agent-to-agent, and ambient activation patterns
across AWS and GCP. In an interview the framing is: "I built the same prior
authorization problem three ways with three different activation patterns to
understand the architectural tradeoffs."

This prototype will be catalogued in the new collection index for post-Optum
prototypes. It is not added to `provider-api-ai-poc-index`.

### 1.4 Demonstrated Skills (Primary)

| Skill | How Demonstrated |
|-------|-----------------|
| Skill 1: Specification Precision | Pub/Sub message payload schema as a versioned Zod contract; LangGraph node output schemas as typed TypeScript interfaces; agent task contracts typed end-to-end from event receipt to BigQuery write |
| Skill 2: Evaluation and Quality Judgment | Confidence threshold routing (0.80 boundary); golden scenario test set with deterministic mock LLM responses; BigQuery audit records surfaced in eval dashboard for post-run quality review |
| Skill 3: Task Decomposition and Multi-Agent Orchestration | Three-node LangGraph StateGraph: CriteriaEvalNode, ConfidenceRoutingNode, AuditWriteNode; each node is a pure function with typed state; pipeline instantiated per Pub/Sub message |
| Skill 5: Trust and Security Design | IAM-scoped Cloud Run service account (least-privilege Pub/Sub subscriber + BigQuery writer only); no PHI; all synthetic data; HumanReviewQueue as explicit trust boundary for sub-threshold confidence; audit trail per event with message ID, model version, confidence, timestamp |

### 1.5 Demonstrated Skills (Secondary)

Skill 6 (Context Architecture): Clinical criteria knowledge embedded as a typed
context object injected into the LangGraph state at pipeline instantiation; policy
context is scoped per request, not global.

Skill 7 (Cost and Token Economics): Token count and estimated Vertex AI cost logged
to BigQuery on every inference call; cost-per-determination visible in the audit
dashboard.

---

## SECTION 2: ARCHITECTURE

### 2.1 System Context Diagram (ASCII)

```
GCP PROJECT: prior-auth-ambient-agent
                                                        
  Publisher (test script or external system)            
       |                                                
       | publishes PriorAuthRequestMessage              
       ▼                                                
  Cloud Pub/Sub Topic                                   
  [prior-auth-requests]                                 
       |                                                
       | push subscription (HTTPS POST)                 
       ▼                                                
  Cloud Run: Subscriber Service        (port 8080)      
  [prior-auth-ambient-agent]                            
       |                                                
       | instantiates per message                       
       ▼                                                
  LangGraph Pipeline (TypeScript, in-process)           
  ┌──────────────────────────────────────────┐          
  │  CriteriaEvalNode                        │          
  │    → calls Vertex AI Gemini              │          
  │    → evaluates against embedded criteria │          
  │    → produces score + rationale          │          
  │                  |                       │          
  │  ConfidenceRoutingNode                   │          
  │    → confidence >= 0.80 → AUTO_APPROVE   │          
  │    → confidence < 0.80  → HUMAN_REVIEW   │          
  │                  |                       │          
  │  AuditWriteNode                          │          
  │    → writes AuditRecord to BigQuery      │          
  │    → if HUMAN_REVIEW: writes to          │          
  │      HumanReviewQueue table              │          
  └──────────────────────────────────────────┘          
       |                          |                     
       ▼                          ▼                     
  BigQuery Dataset               BigQuery Dataset       
  [audit_records]                [human_review_queue]   
                                                        
  Cloud Run: Human Review API  (port 8081)              
  [prior-auth-review-api]                               
    GET  /review-queue                                  
    POST /review-queue/:id/decision                     
    GET  /audit                                         
    GET  /health                                        
       |                                                
       ▼                                                
  UI: prior-auth-ambient-agent-ui                       
  (Next.js, bootstrapped, Cloud Run or local)           
    /          → Agent Dashboard + event publisher      
    /queue     → Human Review Queue                     
    /audit     → BigQuery Audit Trail                   
```

**A2A Message Sequence:**
```
Publisher → Pub/Sub Topic → Push Subscription → Subscriber Service
  → LangGraph Pipeline → Vertex AI Gemini
  → BigQuery audit_records (every message)
  → BigQuery human_review_queue (sub-threshold only)
  → Human Review API → UI
```

**Mermaid Output Requirement:**
Claude Code must generate `docs/architecture.mermaid` as a Phase 1
build artifact using `graph TD` layout. nano-banana renders this for
the README. Not optional.

### 2.2 Core Implementation

**Subscriber Service** (`src/subscriber/`, TypeScript/Express)
- Express HTTP server on port 8080 receiving Pub/Sub push messages
- Validates Pub/Sub message envelope (base64 decode, JSON parse, Zod validate)
- Instantiates one LangGraph pipeline per message
- Returns HTTP 200 to Pub/Sub immediately; processing is async
- Returns HTTP 400 for invalid message schema (Pub/Sub will not retry)
- Returns HTTP 500 for processing errors (Pub/Sub retries with backoff)

**LangGraph Pipeline** (`src/pipeline/`, TypeScript)
- Three nodes in a linear StateGraph: CriteriaEvalNode → ConfidenceRoutingNode
  → AuditWriteNode
- State type: `PriorAuthState` (typed, all fields required)
- Each node: `(state: PriorAuthState) => Partial<PriorAuthState>`
- Pipeline instantiated fresh per message; no shared state between runs

**Human Review API** (`src/review-api/`, TypeScript/Express)
- Separate Express server on port 8081
- Reads from BigQuery `human_review_queue` table
- Accepts review decisions (approve / deny / return-for-info)
- Writes decision back to BigQuery with reviewer timestamp

**Vertex AI Gemini Integration** (`src/clients/vertex.ts`)
- Uses `@google-cloud/vertexai` SDK
- Model: `gemini-2.0-flash` (cost-optimized for classification tasks)
- Structured output binding via Gemini's JSON response schema support
- `MOCK_LLM=true`: returns deterministic fixture from
  `data/mock-responses.json` keyed to scenario ID; never calls GCP

**BigQuery Client** (`src/clients/bigquery.ts`)
- Uses `@google-cloud/bigquery` SDK
- Writes to two tables: `audit_records` and `human_review_queue`
- `MOCK_BQ=true`: writes to local JSON file `data/mock-audit-log.jsonl`
  instead of BigQuery; used for demo track

### 2.3 Data Architecture

**Pub/Sub Message Schema** (`PriorAuthRequestMessage`, Zod):
```typescript
{
  messageId: string            // Pub/Sub message ID
  requestId: string            // unique prior auth request ID
  cptCode: string              // procedure code (e.g. "27447")
  diagnosisCodes: string[]     // ICD-10 codes
  planType: string             // "commercial" | "medicare_advantage" | "medicaid"
  payerId: string              // payer profile ID
  clinicalNotes: string        // free text (synthetic only; no PHI)
  submittedAt: string          // ISO timestamp
  schemaVersion: string        // "1.0"
}
```

**AuditRecord** (BigQuery schema):
```
request_id        STRING    Pub/Sub request ID
message_id        STRING    Pub/Sub message ID
cpt_code          STRING    procedure code
plan_type         STRING    plan type
payer_id          STRING    payer ID
determination     STRING    AUTO_APPROVE | HUMAN_REVIEW
confidence        FLOAT     0.0-1.0
rationale         STRING    model rationale text
model_version     STRING    Gemini model version string
prompt_tokens     INTEGER   input token count
completion_tokens INTEGER   output token count
cost_usd          FLOAT     estimated Vertex AI cost
processing_ms     INTEGER   pipeline duration in ms
processed_at      TIMESTAMP processing timestamp
schema_version    STRING    audit record schema version
```

**HumanReviewQueueRecord** (BigQuery schema, subset of AuditRecord
plus review fields):
```
request_id        STRING
confidence        FLOAT
rationale         STRING
review_status     STRING    PENDING | APPROVED | DENIED | RETURNED
reviewed_by       STRING    nullable
reviewed_at       TIMESTAMP nullable
review_notes      STRING    nullable
queued_at         TIMESTAMP
```

**No real PHI anywhere. All clinical notes are synthetic.**

### 2.4 Key Design Decisions

**Decision 1: Push subscription over pull subscription**
Rationale: Pub/Sub push delivers messages directly to the Cloud Run
HTTP endpoint. Cloud Run scales to zero between messages and scales
up on demand. Pull subscription would require a long-running process
or polling loop. Push + Cloud Run is the correct pattern for
event-triggered, cost-efficient ambient activation.
Trade-off: the subscriber must respond HTTP 200 quickly and process
async; errors must return 500 so Pub/Sub retries.

**Decision 2: Three nodes, not four**
Rationale: `payer-auth-intelligence` has four nodes and a
HumanReviewNode interrupt. This prototype keeps three nodes because
the interrupt pattern is already demonstrated. The new work here is
the ambient activation layer, not the pipeline internals.
Trade-off: less pipeline complexity to demonstrate, but the README
references `payer-auth-intelligence` for the full pattern.

**Decision 3: Gemini 2.0 Flash, not Gemini Ultra**
Rationale: Prior auth determination is a structured classification
task with a defined schema. Flash is cost-optimized for exactly this
use case; Ultra adds latency and cost with no quality benefit for
a constrained output schema.
Trade-off: Flash may be less capable on ambiguous clinical notes;
confidence routing to human review handles this gracefully.

**Decision 4: BigQuery over Cloud SQL or Firestore for audit**
Rationale: The audit trail is append-only, high-volume, and needs
to be queryable by compliance teams who already use BigQuery.
Cloud SQL adds operational overhead; Firestore is document-oriented
and not analytics-native. BigQuery is the correct enterprise audit
sink for this use case.
Trade-off: BigQuery has higher per-query cost and streaming insert
latency (~seconds); acceptable for an audit log.

**Decision 5: Separate Human Review API on its own Cloud Run service**
Rationale: The subscriber service should only receive Pub/Sub events.
A separate HTTP API for the human review UI keeps the two concerns
isolated. They share BigQuery but nothing else.
Trade-off: two Cloud Run services to deploy and manage; cost is
minimal at demo scale.

---

## SECTION 3: DEMO TRACK (SYNTHETIC DATA)

### 3.1 Mock Data Strategy

`data/mock-responses.json` provides deterministic Gemini responses
for four scenario IDs keyed by `scenarioId` in the Pub/Sub message.
`data/mock-audit-log.jsonl` accumulates mock BigQuery writes when
`MOCK_BQ=true`. Both files are hand-authored fixtures; no GCP calls
are made in demo track.

`data/scenarios.json` defines five pre-built scenarios for the UI
publisher form.

### 3.2 Mock Mode

Two independent mock flags:
- `MOCK_LLM=true`: Vertex AI Gemini returns fixtures; never calls GCP
- `MOCK_BQ=true`: BigQuery writes to local JSONL; never calls GCP

Demo track sets both to `true`. Live demo track sets both to `false`.
All tests must set both flags; never call GCP in the test suite.

Local Pub/Sub emulator (`gcloud beta emulators pubsub`) replaces real
Pub/Sub for demo track. The subscriber service connects to the emulator
via `PUBSUB_EMULATOR_HOST=localhost:8085`.

### 3.3 Demo Scenarios

**Scenario 1: Clean Auto-Approve**
Name: `scenario-1-auto-approve`
Pub/Sub payload: CPT 99213, ICD-10 J06.9, commercial, complete notes
Expected: CriteriaEvalNode → confidence 0.91 → AUTO_APPROVE →
AuditRecord written → subscriber returns 200
Demonstrates: Skill 3 (full pipeline run), Skill 1 (typed contract
end-to-end), Skill 7 (cost logged)
Interview value: Show the terminal with the subscriber receiving the
Pub/Sub push, the pipeline completing in ~200ms mock mode, and the
audit log entry appearing. No user clicked anything.

**Scenario 2: Human Review Routing**
Name: `scenario-2-human-review`
Pub/Sub payload: CPT 27447, ICD-10 M17.11, Medicare Advantage, notes
with ambiguous medical necessity
Expected: CriteriaEvalNode → confidence 0.67 → HUMAN_REVIEW →
AuditRecord written → HumanReviewQueueRecord written → appears in
review UI queue
Demonstrates: Skill 5 (trust boundary: confidence gate routes to human
review before any determination is returned), Skill 2 (confidence
threshold functioning correctly)
Interview value: The primary interview scenario. Show the event arriving,
the confidence routing decision, the queue entry, and the review UI.
"No automated determination was made. The system routed to human review
because confidence was below threshold."

**Scenario 3: Invalid Schema (Graceful Rejection)**
Name: `scenario-3-invalid-schema`
Pub/Sub payload: malformed message missing required fields
Expected: Zod validation fails → HTTP 400 returned → Pub/Sub does
NOT retry (400 is a terminal error) → error logged
Demonstrates: Skill 1 (strict schema contract), Skill 5 (invalid input
is rejected at the boundary, not passed downstream)
Interview value: Shows the trust boundary at the entry point. The
agent does not process malformed requests.

**Scenario 4: Batch Publisher (High-Volume Demo)**
Name: `scenario-4-batch`
A publisher script sends 10 messages rapidly. All 10 are processed
and written to the audit log. Mix of AUTO_APPROVE and HUMAN_REVIEW
outcomes visible in the audit dashboard.
Demonstrates: Skill 3 (ambient agent handles concurrent events),
Skill 7 (cumulative cost visible in audit dashboard)
Interview value: Shows the always-on ambient pattern at modest scale.

### 3.4 Demo Track Run Instructions

```bash
# Clone and install
git clone https://github.com/paullopez-ai/prior-auth-ambient-agent
cd prior-auth-ambient-agent
bun install

# Start Pub/Sub emulator (Terminal 1)
gcloud beta emulators pubsub start --project=demo-project
# Creates topic and subscription automatically via setup script

# Setup emulator topic and subscription (Terminal 2, run once)
PUBSUB_EMULATOR_HOST=localhost:8085 bun run scripts/setup-emulator.ts

# Start subscriber service (Terminal 2)
MOCK_LLM=true MOCK_BQ=true \
PUBSUB_EMULATOR_HOST=localhost:8085 \
PUBSUB_PROJECT_ID=demo-project \
bun run src/subscriber/server.ts
# Subscriber running at http://localhost:8080

# Start human review API (Terminal 3)
MOCK_BQ=true bun run src/review-api/server.ts
# Review API running at http://localhost:8081

# Publish Scenario 2 (Terminal 4)
bun run scripts/publish-scenario.ts --scenario scenario-2-human-review
# Expected: subscriber logs pipeline run, confidence 0.67, HUMAN_REVIEW routed
# Expected: mock-audit-log.jsonl has one new entry
# Expected: review queue has one pending item

# Start UI (Terminal 5)
cd ~/MyNewSoftware/prior-auth-ambient-agent-ui
bun dev
# UI at http://localhost:3000
```

---

## SECTION 4: HYPERSCALER TRACK (GCP)

### 4.1 GCP Services Used

| Service | Purpose | Config |
|---------|---------|--------|
| Google Cloud Pub/Sub | Event stream; prior auth request topic | Push subscription to Cloud Run subscriber |
| Cloud Run (subscriber) | Always-on ambient agent subscriber | Min instances: 1; max: 3; port 8080 |
| Cloud Run (review API) | Human review queue API | Min instances: 0; max: 2; port 8081 |
| Vertex AI (Gemini) | LLM inference | gemini-2.0-flash; structured output |
| BigQuery | Audit trail + human review queue | Two tables in `prior_auth_ambient` dataset |
| Cloud IAM | Service account scoping | Subscriber SA: Pub/Sub subscriber + BQ writer only |
| Secret Manager | API keys and credentials | GEMINI_API_KEY (if using API key auth) |
| Artifact Registry | Docker image storage | Two images: subscriber + review-api |
| Cloud Build | CI image builds | Triggered on push to main |

### 4.2 Infrastructure as Code

**IaC tool: Terraform** (consistent with post-Optum prototype collection)

Resources provisioned:
- Pub/Sub topic `prior-auth-requests` and push subscription pointing to
  Cloud Run subscriber URL
- Two Cloud Run services (subscriber + review-api) with IAM bindings
- Service account for subscriber with minimal permissions:
  `roles/pubsub.subscriber` and `roles/bigquery.dataEditor`
- BigQuery dataset `prior_auth_ambient` with two tables
  (`audit_records`, `human_review_queue`) with schema from Section 2.3
- Artifact Registry repository for Docker images
- Secret Manager secret for credentials
- IAM bindings: Pub/Sub can invoke Cloud Run subscriber (push auth)

Estimated monthly cost at demo scale (Cloud Run min-instances=1):
- Cloud Run subscriber (always-on): ~$3-8/month
- Cloud Run review API (scale-to-zero): ~$0.00/month
- Pub/Sub: < $0.01/month at demo volume
- BigQuery: < $0.01/month at demo volume
- Vertex AI Gemini Flash: ~$0.01/100 determinations
- Total: under $10/month if subscriber stays warm

### 4.3 Deployment Instructions

```bash
# Prerequisites: gcloud CLI configured, Docker running, Terraform installed

# Authenticate
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID

# Build and push Docker images
docker build -t subscriber -f docker/Dockerfile.subscriber .
docker build -t review-api -f docker/Dockerfile.review-api .
# Tag and push to Artifact Registry (see infra/terraform/artifact-registry.tf)

# Provision infrastructure
cd infra/terraform
terraform init
terraform plan -var="project_id=YOUR_GCP_PROJECT_ID" -out tfplan
terraform apply tfplan

# Terraform outputs: subscriber_url, review_api_url, pubsub_topic_name

# Publish Scenario 2 against live endpoint
GCP_PROJECT_ID=YOUR_GCP_PROJECT_ID \
bun run scripts/publish-scenario.ts --scenario scenario-2-human-review --live
# Expected: Cloud Run subscriber processes event, BigQuery audit record appears
```

### 4.4 Cost Guardrails

Run `terraform destroy` after each demo session. Cloud Run min-instances=1
for the subscriber is the only meaningful ongoing cost. Set a $20/month GCP
billing alert. BigQuery and Pub/Sub are effectively free at demo volume.

---

## SECTION 5: SKILL BUILD INTENT

<!-- PERSONAL USE ONLY — not in README, not committed to repo.
     Authoring guidance and personal interview prep only. -->

### Skill 1: Specification Precision and Clarity of Intent
**Strength Target:** Strong

**Evidence to Build:**
- `src/contracts/prior-auth-request.ts`: Zod schema for
  `PriorAuthRequestMessage` with field-level descriptions, enum
  constraints, and version field; this is the machine-readable contract
  for every event the system accepts
- `src/contracts/audit-record.ts`: typed `AuditRecord` interface
  matching BigQuery schema exactly; any field mismatch is a TypeScript
  error at compile time
- `src/pipeline/nodes/criteria-eval.ts`: system prompt written as a
  literal specification with exact JSON output schema, classification
  rules, and confidence scoring rubric; same prompt structure governs
  both mock and live Gemini calls

**README Narrative:**
Every message the agent accepts is validated against a versioned Zod
schema before the pipeline is instantiated. If a field is missing, the
wrong type, or outside the allowed enum values, the agent returns HTTP
400 and the message is not retried. The LangGraph node contracts are
TypeScript interfaces that enforce the output shape at compile time,
not just at runtime. The Gemini system prompt specifies the output
JSON schema explicitly so the model produces a parseable structured
response rather than free text requiring post-processing. The contract
is the spec; the code enforces it.

**Interview Talking Point:**
Situation: An ambient agent that processes events without user oversight
cannot rely on a human to notice when the input is malformed or the
output is unstructured.
Task: Design a contract layer that rejects bad input at the boundary and
enforces output structure before the pipeline writes any audit record.
Action: I wrote a versioned Zod input schema with field-level constraints,
TypeScript interfaces for every node output keyed to the BigQuery schema,
and a Gemini system prompt that specifies the exact JSON output format.
Validation failures return HTTP 400 (terminal, no retry). Schema
mismatches are TypeScript compile errors.
Result: Every audit record in BigQuery has a complete, typed schema.
No malformed records exist. [needs metric from Paul: validation rejection
rate in Scenario 3 testing]

---

### Skill 2: Evaluation and Quality Judgment
**Strength Target:** Strong

**Evidence to Build:**
- `tests/scenarios/`: five golden scenario tests with deterministic mock
  LLM responses; each test asserts the correct determination, confidence
  tier, and BigQuery write
- `src/pipeline/nodes/confidence-routing.ts`: confidence threshold
  documented with rationale (0.80 chosen to match payer-auth-intelligence
  for portfolio consistency); threshold is a configurable env var
  `CONFIDENCE_THRESHOLD` defaulting to 0.80
- `src/review-api/routes/audit.ts`: `GET /audit` returns audit records
  with confidence distribution; the UI audit dashboard surfaces this as
  a quality review artifact after a batch run

**README Narrative:**
The confidence threshold is not arbitrary. Every determination below
0.80 is withheld from automatic processing and queued for human review.
The five golden scenario tests verify this routing with deterministic
mock responses: two auto-approve scenarios, two human-review scenarios,
and one invalid-schema rejection. The audit dashboard in the UI shows
the confidence distribution across all processed events so the threshold
can be evaluated against real workload patterns after live deployment.

**Interview Talking Point:**
Situation: An ambient agent that runs without user oversight has no
natural checkpoint where a human can review the quality of its outputs
before they take effect.
Task: Build quality controls that are automatic, testable, and visible
in the audit record.
Action: I implemented a confidence threshold with a configurable env
var so it can be tuned per deployment, five golden scenario tests that
run in mock mode to verify routing logic before any live deployment,
and a BigQuery audit table that surfaces confidence scores across all
processed events for post-deployment quality review.
Result: No determination below the confidence threshold reaches an
automated outcome. The audit dashboard makes quality review possible
without requiring access to the agent's internals. [needs metric from
Paul: confidence distribution from first live demo run]

---

### Skill 3: Task Decomposition and Multi-Agent Orchestration
**Strength Target:** Strong

**Evidence to Build:**
- `src/pipeline/graph.ts`: LangGraph StateGraph with three nodes and
  typed state; each node is a pure function; edges are deterministic
  (no conditional edges; routing happens inside ConfidenceRoutingNode
  by writing to state)
- `src/pipeline/state.ts`: `PriorAuthState` with all fields typed and
  required; no optional fields that could cause silent state gaps
- `src/subscriber/server.ts`: one pipeline instantiation per Pub/Sub
  message; no shared pipeline state between concurrent messages

**README Narrative:**
The pipeline decomposes the determination into three responsibilities
because each has a different failure mode. CriteriaEvalNode calls
Gemini and can fail on model errors or timeout. ConfidenceRoutingNode
is pure logic with no external calls and cannot fail. AuditWriteNode
calls BigQuery and can fail on write errors without affecting the
determination already made. This decomposition means a BigQuery write
failure does not retry the Gemini call. Each node failure is isolated.
The subscriber instantiates a fresh pipeline per message so no state
leaks between concurrent events.

**Interview Talking Point:**
Situation: An ambient agent processes concurrent events from a Pub/Sub
topic. State leakage between pipeline runs would produce incorrect
determinations for different requests.
Task: Decompose the pipeline so each node has one responsibility and
node failures are isolated.
Action: I wrote a three-node LangGraph StateGraph where each node is a
pure function with no side effects except its assigned external call.
CriteriaEvalNode handles inference, ConfidenceRoutingNode handles
routing logic, AuditWriteNode handles persistence. The subscriber
instantiates a fresh pipeline per message so no state is shared.
Result: A BigQuery write failure does not cause a Gemini retry. A
Gemini timeout does not corrupt the state for a concurrent message.
[needs metric from Paul: pipeline success rate in Scenario 4 batch test]

---

### Skill 5: Trust and Security Design
**Strength Target:** Strong

**Evidence to Build:**
- `infra/terraform/iam.tf`: Cloud Run subscriber service account scoped
  to `roles/pubsub.subscriber` and `roles/bigquery.dataEditor` only;
  no broader permissions; IAM documented in README
- `src/pipeline/nodes/confidence-routing.ts`: explicit trust boundary
  classification: AUTO_APPROVE (>= 0.80) vs. HUMAN_REVIEW (< 0.80);
  HUMAN_REVIEW determination never produces an automated outcome;
  written to human_review_queue table, not auto-applied
- `src/contracts/audit-record.ts`: every AuditRecord includes
  `messageId`, `modelVersion`, `confidence`, `processingMs`, and
  `processedAt`; full audit trail per event
- `src/subscriber/server.ts`: Pub/Sub message authentication validated
  via Google-signed JWT on the push endpoint before processing
- `data/mock-responses.json`: all clinical notes are synthetic; no PHI
  constraint enforced in Zod schema (clinicalNotes is a string with
  a max-length constraint and a synthetic data comment)

**README Narrative:**
The service account running the Cloud Run subscriber has exactly two
permissions: subscribe to the Pub/Sub topic and write to BigQuery. It
cannot read from BigQuery, cannot call other GCP services, and cannot
publish to Pub/Sub. This is IAM least-privilege applied to the ambient
agent's trust boundary. Every determination at the HUMAN_REVIEW tier
writes to the queue table and stops; it does not produce an automated
outcome. The audit record for every event includes the model version,
confidence score, and processing timestamp so every determination is
attributable and reviewable. The push endpoint validates the
Google-signed JWT from Pub/Sub before accepting any message.

**Interview Talking Point:**
Situation: A payer compliance team asks: if this agent makes a
determination automatically, what is the audit trail, and how do we
know it did not have excessive permissions?
Task: Design the IAM boundary and audit architecture before writing
the first line of pipeline code.
Action: I scoped the Cloud Run service account to two permissions,
wrote IAM Terraform before the pipeline code so the constraint existed
before the system was deployed, and structured the BigQuery audit schema
so every event is attributable: message ID, model version, confidence,
processing time, and timestamp. Determinations below the confidence
threshold write to the human review queue and do not auto-apply.
Result: The Terraform IAM configuration is the trust boundary
documentation. Any compliance reviewer can read the iam.tf file and
understand exactly what the agent can and cannot do.

---

## SECTION 6: REPO STRUCTURE

### 6.1 Core Repo

```
paullopez-ai/prior-auth-ambient-agent/
├── README.md                              # Public-facing; see Section 8
├── CLAUDE.md                              # Project bible; see Section 7.1
├── package.json                           # bun workspaces
├── tsconfig.json
├── .env.example
├── docker/
│   ├── Dockerfile.subscriber              # Cloud Run subscriber image
│   └── Dockerfile.review-api             # Cloud Run review API image
├── docs/
│   ├── architecture.mermaid              # Build artifact; nano-banana input
│   └── interview-demo-guide.md           # 5-minute demo walkthrough
├── src/
│   ├── contracts/
│   │   ├── prior-auth-request.ts         # Zod PriorAuthRequestMessage [Skill 1]
│   │   ├── audit-record.ts               # AuditRecord TypeScript type [Skill 1,5]
│   │   └── review-queue-record.ts        # HumanReviewQueueRecord type
│   ├── pipeline/
│   │   ├── graph.ts                      # LangGraph StateGraph       [Skill 3]
│   │   ├── state.ts                      # PriorAuthState type        [Skill 3]
│   │   └── nodes/
│   │       ├── criteria-eval.ts          # Gemini inference node      [Skill 1,2]
│   │       ├── confidence-routing.ts     # Routing node               [Skill 2,5]
│   │       └── audit-write.ts            # BigQuery write node        [Skill 5,7]
│   ├── clients/
│   │   ├── vertex.ts                     # Vertex AI Gemini client    [Skill 7]
│   │   └── bigquery.ts                   # BigQuery client            [Skill 5]
│   ├── subscriber/
│   │   └── server.ts                     # Pub/Sub push subscriber    [Skill 1,3,5]
│   └── review-api/
│       ├── server.ts                     # Human review API server
│       └── routes/
│           ├── queue.ts                  # GET/POST review queue
│           ├── audit.ts                  # GET audit records          [Skill 2,7]
│           └── health.ts                 # GET health
├── scripts/
│   ├── setup-emulator.ts                 # Create topic + subscription in emulator
│   ├── publish-scenario.ts               # Publish a named scenario to Pub/Sub
│   └── publish-batch.ts                  # Publish 10 messages (Scenario 4)
├── data/
│   ├── mock-responses.json               # Deterministic Gemini fixtures [Skill 2]
│   ├── mock-audit-log.jsonl              # Local BigQuery mock (MOCK_BQ=true)
│   └── scenarios.json                    # Five pre-built scenario payloads
├── infra/
│   └── terraform/
│       ├── main.tf                       # Provider, project config
│       ├── pubsub.tf                     # Topic + push subscription
│       ├── cloud-run.tf                  # Subscriber + review-api services
│       ├── bigquery.tf                   # Dataset + tables with schema
│       ├── iam.tf                        # Service account + bindings  [Skill 5]
│       ├── artifact-registry.tf          # Docker image registry
│       ├── secret-manager.tf             # Credentials
│       └── outputs.tf                    # subscriber_url, review_api_url
└── tests/
    ├── scenarios/
    │   ├── scenario-1-auto-approve.test.ts
    │   ├── scenario-2-human-review.test.ts
    │   ├── scenario-3-invalid-schema.test.ts
    │   └── scenario-4-batch.test.ts
    ├── pipeline/
    │   ├── criteria-eval.test.ts
    │   ├── confidence-routing.test.ts
    │   └── audit-write.test.ts
    └── contracts/
        └── prior-auth-request.test.ts    # Zod schema validation tests
```

### 6.2 UI Companion Repo

```
prior-auth-ambient-agent-ui/             # ~/MyNewSoftware/prior-auth-ambient-agent-ui
├── app/
│   ├── page.tsx                         # Agent Dashboard + event publisher
│   ├── queue/page.tsx                   # Human Review Queue
│   ├── audit/page.tsx                   # BigQuery Audit Trail
│   ├── api/
│   │   ├── publish/route.ts             # POST: publishes scenario to Pub/Sub emulator
│   │   ├── queue/route.ts               # GET: proxies review API /review-queue
│   │   ├── queue/[id]/decision/route.ts # POST: proxies review API decision endpoint
│   │   └── audit/route.ts              # GET: proxies review API /audit
│   ├── layout.tsx                       # ThemeProvider [bootstrap - do not modify]
│   └── globals.css                      # OKLCH tokens [bootstrap - do not modify base]
├── components/
│   ├── theme-provider.tsx               # [bootstrap - do not modify]
│   ├── theme-toggle.tsx                 # [bootstrap - do not modify]
│   ├── scenario-publisher.tsx           # Scenario dropdown + Publish button
│   ├── agent-status-card.tsx            # Subscriber health + last event timestamp
│   ├── determination-badge.tsx          # AUTO_APPROVE / HUMAN_REVIEW badge
│   ├── confidence-bar.tsx               # Visual confidence score bar
│   ├── audit-record-list.tsx            # Scrollable audit log
│   ├── audit-record-card.tsx            # Single audit record detail
│   ├── review-queue-list.tsx            # Pending human review items
│   └── review-actions.tsx               # Approve / Deny / Return buttons
├── lib/
│   ├── utils.ts                         # cn() helper [bootstrap - do not modify]
│   ├── api-client.ts                    # Typed fetch wrappers
│   └── types.ts                         # UI TypeScript types (mirrors contracts/)
└── CLAUDE.md                            # UI project bible; see Section 7.2
```

---

## SECTION 7: CLAUDE.md FILES

### 7.1 Core Repo CLAUDE.md

```markdown
# CLAUDE.md — prior-auth-ambient-agent

## Project Identity
Always-on, event-triggered prior authorization agent on GCP.
Activates from Google Cloud Pub/Sub push message without user invocation.
Three-node LangGraph pipeline: CriteriaEvalNode (Vertex AI Gemini) →
ConfidenceRoutingNode → AuditWriteNode (BigQuery).
Confidence >= 0.80 → AUTO_APPROVE. Confidence < 0.80 → HUMAN_REVIEW queue.
Two Cloud Run services: subscriber (port 8080) and review API (port 8081).

## Stack
- Runtime: Node.js / TypeScript (bun)
- Subscriber + Review API: Express
- Pipeline: LangGraph.js TypeScript StateGraph
- LLM: Vertex AI Gemini (gemini-2.0-flash) via @google-cloud/vertexai
- Event: Google Cloud Pub/Sub (push subscription)
- Audit: Google BigQuery via @google-cloud/bigquery
- IaC: Terraform (GCP: Pub/Sub, Cloud Run, BigQuery, IAM, Artifact Registry)
- Testing: Vitest

## Critical Constraints
- MOCK_LLM=true and MOCK_BQ=true for all tests; never call GCP in test suite
- No PHI anywhere; all clinical notes are synthetic
- TypeScript strict mode throughout
- One LangGraph pipeline instantiation per Pub/Sub message; no shared state
- Subscriber service account: roles/pubsub.subscriber + roles/bigquery.dataEditor only
- Never commit .env, *.tfvars, terraform.tfstate, or service account key files

## Architecture Principles
The ambient trigger is the point. No user clicks anything. A Pub/Sub message
arrives, the pipeline runs, BigQuery gets an audit record, the agent returns
to listening. CriteriaEvalNode calls Gemini. ConfidenceRoutingNode is pure
logic. AuditWriteNode calls BigQuery. Node failures are isolated.
This prototype references payer-auth-intelligence for the full pipeline
pattern; the new work here is the ambient activation layer.

## File Ownership
- src/contracts/: Zod schemas and TypeScript types; Claude Code builds
- src/pipeline/: LangGraph graph, state, and nodes; Claude Code builds
- src/clients/: Vertex AI and BigQuery clients; Claude Code builds
- src/subscriber/: Pub/Sub push subscriber Express server; Claude Code builds
- src/review-api/: Human review API Express server; Claude Code builds
- scripts/: Emulator setup and scenario publisher; Claude Code builds
- data/mock-responses.json: deterministic Gemini fixtures; Claude Code builds
- infra/terraform/: Terraform GCP IaC; Claude Code builds
- docs/architecture.mermaid: build artifact; Phase 1; not optional

## Environment Variables
MOCK_LLM=true                  # set false for live Gemini calls
MOCK_BQ=true                   # set false for live BigQuery writes
PUBSUB_EMULATOR_HOST=localhost:8085  # demo track only
PUBSUB_PROJECT_ID=demo-project       # demo track; real project ID for live
GCP_PROJECT_ID=                # required for live track
SUBSCRIBER_PORT=8080
REVIEW_API_PORT=8081
CONFIDENCE_THRESHOLD=0.80      # configurable routing boundary
VERTEX_AI_LOCATION=us-central1 # Vertex AI region
GEMINI_MODEL=gemini-2.0-flash

## Autonomous Build Rule
Work through phases without stopping to ask unless hitting a Manual
Execution Gate. Run bun install, vitest (MOCK_LLM=true MOCK_BQ=true),
and Express smoke tests autonomously. Never run terraform apply,
terraform destroy, or gcloud commands autonomously.

## Manual Execution Gates
Gate 1 — after Terraform files are written:
  STOP. Run:
    cd infra/terraform
    terraform init
    terraform plan -var="project_id=YOUR_PROJECT_ID" -out tfplan
  Expected: plan with no errors; review resource list before applying
  Tell Paul: "Gate 1 reached. Review plan and run terraform apply when ready."

Gate 2 — after Docker images are written:
  STOP. Run:
    docker build -t subscriber -f docker/Dockerfile.subscriber .
    docker build -t review-api -f docker/Dockerfile.review-api .
  Expected: both images build cleanly
  Tell Paul: "Gate 2 reached. Confirm both images build before pushing to Artifact Registry."

After each gate confirmation, continue to the next phase automatically.

## What Claude Code Runs Autonomously
- bun install
- vitest (MOCK_LLM=true MOCK_BQ=true only)
- Express smoke tests with emulator
- All file scaffolding, type definitions, and fixture generation
- docs/architecture.mermaid generation

## Build Priority Order
1. src/contracts/ (Zod schemas + TypeScript types) — foundation
2. src/clients/ (vertex.ts + bigquery.ts with MOCK_LLM/MOCK_BQ flags)
3. data/mock-responses.json + data/scenarios.json fixtures
4. src/pipeline/ (state, graph, three nodes)
5. src/subscriber/server.ts
6. src/review-api/server.ts + routes
7. scripts/ (setup-emulator, publish-scenario, publish-batch)
8. Vitest tests (all MOCK_LLM=true MOCK_BQ=true)
9. docs/architecture.mermaid + README
10. docker/ Dockerfiles → Gate 2
11. infra/terraform/ → Gate 1
12. UI (separate Claude Code session)

## Active Work
[ ] Phase 1: src/contracts/, src/clients/, mock fixtures, docs/architecture.mermaid
[ ] Phase 2: src/pipeline/ (state + 3 nodes + graph)
[ ] Phase 3: src/subscriber/server.ts
[ ] Phase 4: src/review-api/server.ts + routes
[ ] Phase 5: scripts/ + Vitest tests
[ ] Phase 6: README + interview-demo-guide.md
[ ] Phase 7: docker/ Dockerfiles → Gate 2
[ ] Phase 8: infra/terraform/ → Gate 1
[ ] Phase 9: UI (separate Claude Code session)
```

### 7.2 UI Companion Repo CLAUDE.md

```markdown
# CLAUDE.md — prior-auth-ambient-agent-ui

## Project Identity
Next.js dashboard UI for the prior-auth-ambient-agent demo.
Three screens: Agent Dashboard (publish events + live audit feed),
Human Review Queue (approve / deny / return), Audit Trail (BigQuery log).

## Bootstrap Origin
Scaffolded with Paul's /bootstrap command. The following files must
NOT be modified or regenerated under any circumstances:
- components/theme-provider.tsx
- components/theme-toggle.tsx
- lib/utils.ts
- app/globals.css (add new tokens below the existing base layer only)

## Core Repo Boundary
This session builds ONLY the UI companion. The core application lives at
~/MyNewSoftware/prior-auth-ambient-agent. Do NOT create, scaffold, or
modify any files in that repo from this session. Do NOT generate any
TypeScript Pub/Sub, LangGraph, BigQuery, Vertex AI, or Terraform code here.
The only connection is via fetch calls to the review API at localhost:8081.

## Stack (pre-installed by bootstrap — do not reinstall)
- Next.js 16+ (App Router, TypeScript, Tailwind v4, Turbopack)
- shadcn/ui base-vega; 14 components available
- @hugeicons/react: HugeiconsIcon wrapper for ALL icons
- Framer Motion: AnimatePresence for list transitions
- next-themes: ThemeProvider wired in layout.tsx
- OKLCH tokens: --brand (amber), --primary (blue)

## Component Rules (non-negotiable)
- ALL icons: <HugeiconsIcon icon={XxxIcon} className="h-4 w-4" />
- NEVER import from lucide-react
- Use cn() from lib/utils for all conditional className merging
- Card / CardHeader / CardContent for all panels
- No <form> HTML tags anywhere; use onClick / onChange handlers
- Determination badge variants:
    AUTO_APPROVE → className="bg-green-500 text-white"
    HUMAN_REVIEW → variant="destructive"
- Confidence bar: green if >= 0.80, amber if 0.60-0.79, red if < 0.60

## Screens
app/page.tsx        — Agent Dashboard: scenario publisher, subscriber
                      health card, live audit feed (polls every 5s)
app/queue/page.tsx  — Human Review Queue: pending HUMAN_REVIEW items
                      with approve/deny/return actions
app/audit/page.tsx  — Audit Trail: full BigQuery audit log, scrollable,
                      with determination badge and confidence bar per record

## API Routes (proxy to review API on localhost:8081)
POST app/api/publish/route.ts           — publishes scenario to Pub/Sub emulator
GET  app/api/queue/route.ts             — → review API GET /review-queue
POST app/api/queue/[id]/decision/route.ts — → review API POST decision
GET  app/api/audit/route.ts            — → review API GET /audit

## Data Flow
- Scenario publisher POSTs to /api/publish which calls Pub/Sub emulator
- Agent Dashboard polls /api/audit every 5s via useEffect
- Review queue fetches on load; refreshes after each decision action
- Review API must be running on localhost:8081
- Show clear connection error if review API is unreachable

## Active Work
[ ] scenario-publisher.tsx + agent-status-card.tsx
[ ] app/page.tsx Agent Dashboard
[ ] determination-badge.tsx + confidence-bar.tsx
[ ] audit-record-card.tsx + audit-record-list.tsx
[ ] app/audit/page.tsx Audit Trail
[ ] review-queue-list.tsx + review-actions.tsx
[ ] app/queue/page.tsx Human Review Queue
[ ] All four API proxy routes
[ ] lib/api-client.ts + lib/types.ts
```

---

## SECTION 8: README NARRATIVE

### 8.1 Header Block

```markdown
# prior-auth-ambient-agent

An always-on, event-triggered prior authorization agent on GCP.
No user invokes it. A Pub/Sub message arrives, the agent wakes,
evaluates the request, routes the determination, writes an audit
record to BigQuery, and returns to listening.

The existing prior auth portfolio covers user-invoked pipelines
(payer-auth-intelligence) and agent-to-agent negotiation
(auth-a2a-agent-network). This prototype adds the third activation
pattern: ambient event-driven. A Pub/Sub topic receives prior auth
requests from upstream systems. A Cloud Run subscriber processes
each event through a three-node LangGraph pipeline backed by Vertex
AI Gemini. Requests above the confidence threshold are auto-approved.
Requests below it route to a human review queue. Every event produces
a BigQuery audit record with confidence, rationale, model version,
and cost.

**Demo Track:** Pub/Sub emulator + MOCK_LLM=true + MOCK_BQ=true (zero GCP calls)
**Live Demo Track:** Real GCP: Pub/Sub, Cloud Run, Vertex AI Gemini, BigQuery
**Related Repos:** [payer-auth-intelligence](https://github.com/paullopez-ai/payer-auth-intelligence) · [auth-a2a-agent-network](https://github.com/paullopez-ai/auth-a2a-agent-network)
```

### 8.2 Architecture Section

Reproduce the ASCII diagram from Section 2.1.

<!-- DIAGRAM: insert rendered architecture.mermaid image here -->

Follow with:

The subscriber service is the ambient activation layer. It is always
listening. When a Pub/Sub push arrives, it validates the message schema,
instantiates a fresh LangGraph pipeline, and processes the event. The
pipeline runs three nodes in sequence: CriteriaEvalNode calls Vertex AI
Gemini with the clinical request and a structured output schema;
ConfidenceRoutingNode applies the 0.80 threshold and assigns the
determination tier; AuditWriteNode writes the full audit record to
BigQuery regardless of outcome. If the determination is HUMAN_REVIEW,
a second record goes to the review queue table. The subscriber then
returns HTTP 200 to Pub/Sub and resumes listening.

### 8.3 Demonstrated Capabilities

#### Specification Precision

> *From the Architect:* An ambient agent that processes events without
> user oversight has no natural checkpoint where a human can catch a
> malformed input or an unexpected output before it reaches the audit
> log. I solved this with contracts at both ends. The Pub/Sub message
> is validated against a versioned Zod schema before the pipeline is
> instantiated. Invalid messages return HTTP 400 and are not retried.
> The Gemini system prompt specifies the exact JSON output schema so the
> model produces a parseable structured response, not free text requiring
> parsing. The TypeScript interfaces for every node output are keyed to
> the BigQuery schema, so a field mismatch is a compile error, not a
> runtime surprise.

**Key implementation:** [`src/contracts/prior-auth-request.ts`](src/contracts/prior-auth-request.ts) — versioned Zod schema; [`src/pipeline/nodes/criteria-eval.ts`](src/pipeline/nodes/criteria-eval.ts) — structured output prompt

#### Evaluation and Quality Judgment

> *From the Architect:* The confidence threshold is the quality gate.
> Every determination below 0.80 is withheld from automatic processing
> and queued for human review. I did not pick 0.80 arbitrarily: it
> matches the threshold used in payer-auth-intelligence so the portfolio
> tells a consistent story about where the autonomous/supervised
> boundary sits. Five golden scenario tests verify the routing logic with
> deterministic mock responses before any live GCP call is made. The
> BigQuery audit table surfaces the confidence distribution across all
> processed events so the threshold can be evaluated against real
> workload patterns after live deployment.

**Key implementation:** [`src/pipeline/nodes/confidence-routing.ts`](src/pipeline/nodes/confidence-routing.ts) — threshold routing; [`tests/scenarios/`](tests/scenarios/) — five golden scenario tests

#### Task Decomposition and Multi-Agent Orchestration

> *From the Architect:* I kept the pipeline to three nodes deliberately.
> Each node has one external dependency: CriteriaEvalNode calls Gemini,
> ConfidenceRoutingNode has no external calls, AuditWriteNode calls
> BigQuery. A Gemini timeout does not retry the BigQuery write. A
> BigQuery failure does not repeat the Gemini call. The subscriber
> instantiates a fresh pipeline per message so no state leaks between
> concurrent events. The full four-node pattern with interrupt is in
> payer-auth-intelligence; this prototype focuses the LangGraph work on
> the ambient activation context.

**Key implementation:** [`src/pipeline/graph.ts`](src/pipeline/graph.ts) — three-node StateGraph; [`src/subscriber/server.ts`](src/subscriber/server.ts) — per-message instantiation

#### Trust and Security Design

> *From the Architect:* The IAM configuration is the trust boundary
> documentation. The Cloud Run service account has exactly two
> permissions: subscribe to the Pub/Sub topic and write to BigQuery.
> I wrote the Terraform IAM bindings before writing the pipeline code
> so the constraint existed before the system was deployable. Every
> determination below the confidence threshold writes to the human
> review queue and stops. It does not produce an automated outcome.
> Every audit record includes the message ID, model version, confidence
> score, and processing timestamp so every determination is fully
> attributable.

**Key implementation:** [`infra/terraform/iam.tf`](infra/terraform/iam.tf) — least-privilege service account; [`src/pipeline/nodes/audit-write.ts`](src/pipeline/nodes/audit-write.ts) — full audit trail per event

### 8.4 Demo Track Setup

Reproduce exact commands from Section 3.4.

### 8.5 Live Demo Track Setup

Reproduce exact commands from Section 4.3 with cost guardrails from
Section 4.4.

### 8.6 Interview Demo Guide

Content in `docs/interview-demo-guide.md`. Five scenarios:
1. Scenario 2 (5 min): publish the human-review event, watch the
   subscriber log, show the BigQuery audit record, show the review
   queue in the UI, explain the confidence routing decision.
2. Architecture walkthrough (3 min): ASCII diagram, explain each
   component, explain why push subscription + Cloud Run is the right
   pattern for ambient activation.
3. Scenario 4 batch (2 min): publish 10 events, show the audit
   dashboard fill up, point out the confidence distribution.
4. Design decisions (3 min): why three nodes not four, why Gemini
   Flash not Ultra, why BigQuery not Firestore, why push not pull.
5. Activation pattern comparison (2 min): contrast with
   payer-auth-intelligence (user-invoked) and auth-a2a-agent-network
   (agent-to-agent). Explain when each pattern is appropriate.

---

## SECTION 9: BUILD SEQUENCE

### Phase 1: Foundation (Days 1-2)
- Scaffold repo; configure bun, TypeScript strict, Vitest
- Implement `src/contracts/` (Zod schemas + TypeScript types)
- Implement `src/clients/vertex.ts` and `src/clients/bigquery.ts`
  (both with MOCK_LLM/MOCK_BQ flag routing)
- Author `data/mock-responses.json` (4 scenarios) and
  `data/scenarios.json` (5 scenario payloads)
- Generate `docs/architecture.mermaid`; write CLAUDE.md; commit both
- Confirm: `bun run src/subscriber/server.ts` (stub) starts cleanly

### Phase 2: Pipeline (Days 3-4)
- Implement `src/pipeline/state.ts` (PriorAuthState type)
- Implement three pipeline nodes (criteria-eval, confidence-routing,
  audit-write)
- Implement `src/pipeline/graph.ts` (StateGraph wiring)
- Unit tests for all three nodes (MOCK_LLM=true MOCK_BQ=true)

### Phase 3: Subscriber Service (Day 5)
- Implement `src/subscriber/server.ts` (Express + Pub/Sub push handler)
- Zod validation at entry point
- Per-message pipeline instantiation
- Integration test: POST a mock Pub/Sub envelope to the subscriber

### Phase 4: Review API (Day 6)
- Implement `src/review-api/server.ts` and all routes
- GET /review-queue, POST decision, GET /audit, GET /health
- Reads from mock-audit-log.jsonl (MOCK_BQ=true)

### Phase 5: Scripts + Test Suite (Day 7)
- Implement `scripts/setup-emulator.ts`
- Implement `scripts/publish-scenario.ts`
- Implement `scripts/publish-batch.ts`
- Five golden scenario Vitest tests
- Confirm: full demo track runs (see Section 3.4)

### Phase 6: README + Demo Polish (Day 8)
- README complete through Section 8.5
- `docs/interview-demo-guide.md` written and validated
- Repo pushed to GitHub

### Phase 7: Dockerfiles (Day 9) → Gate 2
- `docker/Dockerfile.subscriber`
- `docker/Dockerfile.review-api`
- Both images build cleanly locally → Gate 2

## Docker commands
  Please run:
  docker build -t subscriber -f docker/Dockerfile.subscriber .
  docker build -t review-api -f docker/Dockerfile.review-api .


### Phase 8: Terraform (Days 10-11) → Gate 1
- All Terraform files written
- `terraform plan` validates cleanly → Gate 1
- Paul runs `terraform apply` manually when ready for live demo

### Terraform instructions
 Gate 1 reached. Terraform files are written.                                                                                       
                                                                                                                                     
  What was created (infra/terraform/):                                                                                               
                                                                  
  ┌──────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────┐  
  │         File         │                                                Contents                                                │
  ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ main.tf              │ Provider config, google_project_service for 7 required APIs                                            │
  ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ variables.tf         │ project_id, subscriber_image, review_api_image, mock_llm/bq, confidence_threshold, BQ settings         │  
  ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ artifact_registry.tf │ Docker repo prior-auth                                                                                 │  
  ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ bigquery.tf          │ Dataset + audit_records table + human_review_queue table (schemas match TypeScript contracts exactly)  │
  ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ cloud_run.tf         │ prior-auth-subscriber (port 8080) + prior-auth-review-api (port 8081) with liveness probes, env vars,  │
  │                      │ CPU/memory limits                                                                                      │  
  ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ pubsub.tf            │ Topic prior-auth-requests + push subscription with OIDC auth → subscriber URL                          │  
  ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ iam.tf               │ 3 service accounts + all IAM bindings (subscriber: pubsub.subscriber + bq.dataEditor +                 │
  │                      │ aiplatform.user; review-api: bq.dataViewer + bq.jobUser + bq.dataEditor; Pub/Sub OIDC chain)           │  
  ├──────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ outputs.tf           │ Subscriber/review-api URLs, topic, subscription, AR repo URI, dataset, SA emails                       │  
  └──────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────┘  
  
  Please run:                                                                                                                        
  cd infra/terraform                                              
  terraform init    
  terraform plan \
    -var="project_id=YOUR_PROJECT_ID" \
    -var="subscriber_image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/prior-auth/subscriber:latest" \
    -var="review_api_image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/prior-auth/review-api:latest" \
    -out tfplan                                                                                                                      
                                                                                                                                     
  Review the resource list, then run terraform apply tfplan when ready. After that, Phase 9 (UI) is a separate Claude Code session   
  per CLAUDE.md.                                                                                                                     
                                                                  
✻ Cooked for 3m 1s                                                                                                                   
                                                                  
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ 
---

### Phase 9: UI Companion (Days 12-14, separate Claude Code session)
- Manual pre-condition: `/bootstrap prior-auth-ambient-agent-ui`
  in `~/MyNewSoftware`
- Drop PRD into bootstrapped folder
- Open new Claude Code session with UI directing prompt
- Build all three screens and four API routes per Sections 6.2 and 7.2

### Estimated Total Build Time: 14 focused days

---

## SECTION 10: SUCCESS CRITERIA

| Criterion | Definition of Done |
|-----------|-------------------|
| Demo track boots | Subscriber + review API start; GET /health returns ok |
| Scenario 2 runs | Pub/Sub emulator message processed; HUMAN_REVIEW written to mock audit log; review queue has one item |
| Confidence routing | Scenario 1 produces AUTO_APPROVE; Scenario 2 produces HUMAN_REVIEW |
| Scenario 3 (invalid schema) | HTTP 400 returned; no audit record written |
| Scenario 4 (batch) | 10 messages processed; audit log has 10 records |
| All tests pass | Vitest suite green with MOCK_LLM=true MOCK_BQ=true |
| Dockerfiles build | Both images build cleanly; Gate 2 confirmed |
| Terraform plan clean | terraform plan produces valid plan; Gate 1 confirmed |
| `docs/architecture.mermaid` | Valid Mermaid; renders in nano-banana |
| README quality | Any engineer can clone and run Scenario 2 in under 15 minutes |
| UI: Agent Dashboard | Scenario publisher works; audit feed updates after publish |
| UI: Review Queue | Pending item from Scenario 2 visible; approve action clears it |

---

## SECTION 11: DEPENDENCIES

### 11.1 Core Repo Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| @google-cloud/vertexai | latest | Vertex AI Gemini inference |
| @google-cloud/bigquery | ^7.x | BigQuery audit writes |
| @google-cloud/pubsub | ^4.x | Pub/Sub emulator client |
| @langchain/langgraph | latest | LangGraph StateGraph pipeline |
| express | ^4.x | Subscriber + review API HTTP server |
| zod | ^3.x | Message schema validation |
| vitest | latest | Unit and integration testing |
| tsx | latest | TypeScript execution |

### 11.2 UI Companion Dependencies (pre-installed by bootstrap)

| Dependency | Notes |
|-----------|-------|
| next 16+ | App Router, Turbopack |
| typescript | Strict mode |
| tailwindcss v4 | tw-animate-css included |
| shadcn/ui (base-vega) | 14 components pre-added |
| @hugeicons/react | HugeiconsIcon wrapper only |
| framer-motion | AnimatePresence for audit feed updates |
| next-themes | ThemeProvider wired in layout.tsx |
| clsx + tailwind-merge | Via cn() in lib/utils |

**External accounts required:**
- Demo track: none (Pub/Sub emulator, mock LLM, mock BQ)
- Live demo track: GCP project with billing enabled

---

## SECTION 12: CONSTRAINTS

**Always applicable:**
- No PHI or real patient data anywhere; all clinical notes are synthetic
- MOCK_LLM=true and MOCK_BQ=true for all tests; never call GCP in tests
- All development on personal equipment
- Healthcare vertical not referenced in Skygile public materials until
  after UHG departure
- No `<form>` HTML elements in UI; use onClick / onChange handlers
- No lucide-react; use HugeiconsIcon from @hugeicons/react
- Portfolio and interview asset only; not for production deployment
- Do not add to `provider-api-ai-poc-index`; new collection index TBD
- Never commit .env, *.tfvars, terraform.tfstate, or GCP key files

**Prototype-specific:**
- One pipeline instantiation per Pub/Sub message; no shared state
- Subscriber service account: two permissions only (enforced in iam.tf)
- This prototype references payer-auth-intelligence for the full
  pipeline pattern; do not rebuild the full four-node graph here

---

## SECTION 13: RELATIONSHIP TO EXISTING REPOS

| Repo | Relationship |
|------|-------------|
| `payer-auth-intelligence` | The "full pipeline" reference; this prototype uses a simplified three-node version of the same LangGraph pattern; referenced explicitly in README |
| `auth-a2a-agent-network` | Third activation pattern in the prior auth arc; A2A negotiation vs. ambient event-triggered |
| `prior-auth-radar` | Provider-side counterpart; this prototype is payer-side ambient |
| `clinical-rules-mcp-server` | Optional: CriteriaEvalNode could call this MCP server for criteria lookup; not required for the prototype |

---

## SECTION 14: OPEN QUESTIONS

| # | Question | Owner | Status |
|---|---------|-------|-------|
| 1 | Should CriteriaEvalNode optionally call `clinical-rules-mcp-server` for criteria lookup, or use embedded synthetic criteria only? Embedded is simpler and keeps this repo standalone. | Paul | Open — recommendation: embedded criteria for v1; MCP integration as a Phase 2 note in README |
| 2 | Should the UI be deployed to Cloud Run as a third service in the Terraform, or remain local-only for the portfolio demo? | Paul | Open — recommendation: local-only for v1; Cloud Run deployment optional in README |
| 3 | Should Vertex AI Agent Builder be included or skipped? The prior conversation concluded it is optional noise given LangGraph is already handling orchestration. | Paul | Closed — skip Vertex AI Agent Builder; LangGraph is the orchestration layer |
| 4 | Which GCP region for Vertex AI and Cloud Run? | Paul | Open — `us-central1` recommended as the region with broadest Gemini model availability |
