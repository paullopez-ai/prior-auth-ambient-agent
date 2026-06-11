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
[x] Phase 1: src/contracts/, src/clients/, mock fixtures, docs/architecture.mermaid
[x] Phase 2: src/pipeline/ (state + 3 nodes + graph)
[x] Phase 3: src/subscriber/server.ts
[x] Phase 4: src/review-api/server.ts + routes
[x] Phase 5: scripts/ + Vitest tests
[x] Phase 6: README + interview-demo-guide.md
[x] Phase 7: docker/ Dockerfiles → Gate 2
[x] Phase 8: infra/terraform/ → Gate 1
[ ] Phase 9: UI (separate Claude Code session)
