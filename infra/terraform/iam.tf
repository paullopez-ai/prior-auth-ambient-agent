# ── Service Accounts ──────────────────────────────────────────────────────────

resource "google_service_account" "subscriber" {
  account_id   = "prior-auth-subscriber"
  display_name = "Prior Auth Subscriber"
  description  = "Runtime SA for the prior-auth subscriber Cloud Run service"
}

resource "google_service_account" "review_api" {
  account_id   = "prior-auth-review-api"
  display_name = "Prior Auth Review API"
  description  = "Runtime SA for the prior-auth review-api Cloud Run service"
}

# Dedicated SA that Pub/Sub uses as its OIDC identity when pushing to Cloud Run
resource "google_service_account" "pubsub_invoker" {
  account_id   = "prior-auth-pubsub-invoker"
  display_name = "Prior Auth Pub/Sub Invoker"
  description  = "Used by the Pub/Sub push subscription to invoke the subscriber Cloud Run service"
}

# ── Subscriber SA roles ───────────────────────────────────────────────────────
# Per CLAUDE.md: roles/pubsub.subscriber + roles/bigquery.dataEditor
# roles/aiplatform.user is also required for live Vertex AI calls

resource "google_project_iam_member" "subscriber_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.subscriber.email}"
}

resource "google_project_iam_member" "subscriber_bq_editor" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.subscriber.email}"
}

# Required for live Vertex AI / Gemini calls (MOCK_LLM=false)
resource "google_project_iam_member" "subscriber_vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.subscriber.email}"
}

# ── Review API SA roles ───────────────────────────────────────────────────────

resource "google_project_iam_member" "review_api_bq_viewer" {
  project = var.project_id
  role    = "roles/bigquery.dataViewer"
  member  = "serviceAccount:${google_service_account.review_api.email}"
}

# BigQuery job user is required to run queries
resource "google_project_iam_member" "review_api_bq_job_user" {
  project = var.project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.review_api.email}"
}

# The review-api also writes decisions back to human_review_queue
resource "google_project_iam_member" "review_api_bq_editor" {
  project = var.project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.review_api.email}"
}

# ── Pub/Sub push → Cloud Run auth ────────────────────────────────────────────
# Allow the pubsub_invoker SA to invoke the subscriber service
resource "google_cloud_run_v2_service_iam_member" "subscriber_pubsub_invoker" {
  name     = google_cloud_run_v2_service.subscriber.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_invoker.email}"
}

# Allow Pub/Sub's Google-managed SA to create tokens as pubsub_invoker
# This is what lets Pub/Sub attach an OIDC token to push requests
resource "google_service_account_iam_member" "pubsub_sa_token_creator" {
  service_account_id = google_service_account.pubsub_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# ── Review API: allow unauthenticated access (UI + demo) ─────────────────────
resource "google_cloud_run_v2_service_iam_member" "review_api_public" {
  name     = google_cloud_run_v2_service.review_api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Artifact Registry push access for CI/CD ──────────────────────────────────
resource "google_artifact_registry_repository_iam_member" "subscriber_ar_reader" {
  repository = google_artifact_registry_repository.prior_auth.name
  location   = var.region
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.subscriber.email}"
}

resource "google_artifact_registry_repository_iam_member" "review_api_ar_reader" {
  repository = google_artifact_registry_repository.prior_auth.name
  location   = var.region
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.review_api.email}"
}
