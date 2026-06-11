resource "google_bigquery_dataset" "prior_auth_audit" {
  dataset_id  = var.bigquery_dataset_id
  location    = var.bigquery_location
  description = "Prior auth pipeline audit records and human review queue"

  delete_contents_on_destroy = false

  depends_on = [google_project_service.apis]
}

# ── audit_records — one row per pipeline run ──────────────────────────────────
resource "google_bigquery_table" "audit_records" {
  dataset_id          = google_bigquery_dataset.prior_auth_audit.dataset_id
  table_id            = "audit_records"
  deletion_protection = true

  schema = jsonencode([
    { name = "request_id",        type = "STRING",    mode = "REQUIRED", description = "Pub/Sub request ID" },
    { name = "message_id",        type = "STRING",    mode = "REQUIRED", description = "Pub/Sub message ID" },
    { name = "cpt_code",          type = "STRING",    mode = "REQUIRED", description = "CPT procedure code" },
    { name = "plan_type",         type = "STRING",    mode = "REQUIRED", description = "Health plan type" },
    { name = "payer_id",          type = "STRING",    mode = "REQUIRED", description = "Payer profile ID" },
    { name = "determination",     type = "STRING",    mode = "REQUIRED", description = "AUTO_APPROVE or HUMAN_REVIEW" },
    { name = "confidence",        type = "FLOAT64",   mode = "REQUIRED", description = "Model confidence score 0.0 – 1.0" },
    { name = "rationale",         type = "STRING",    mode = "REQUIRED", description = "Model rationale text" },
    { name = "model_version",     type = "STRING",    mode = "REQUIRED", description = "Gemini model version string" },
    { name = "prompt_tokens",     type = "INT64",     mode = "REQUIRED", description = "Input token count" },
    { name = "completion_tokens", type = "INT64",     mode = "REQUIRED", description = "Output token count" },
    { name = "cost_usd",          type = "FLOAT64",   mode = "REQUIRED", description = "Estimated Vertex AI cost in USD" },
    { name = "processing_ms",     type = "INT64",     mode = "REQUIRED", description = "Pipeline duration in milliseconds" },
    { name = "processed_at",      type = "TIMESTAMP", mode = "REQUIRED", description = "ISO 8601 completion timestamp" },
    { name = "schema_version",    type = "STRING",    mode = "REQUIRED", description = "Audit record schema version" },
  ])
}

# ── human_review_queue — sub-threshold messages only ─────────────────────────
resource "google_bigquery_table" "human_review_queue" {
  dataset_id          = google_bigquery_dataset.prior_auth_audit.dataset_id
  table_id            = "human_review_queue"
  deletion_protection = true

  schema = jsonencode([
    { name = "request_id",    type = "STRING",    mode = "REQUIRED", description = "Pub/Sub request ID" },
    { name = "message_id",    type = "STRING",    mode = "REQUIRED", description = "Pub/Sub message ID" },
    { name = "cpt_code",      type = "STRING",    mode = "REQUIRED", description = "CPT procedure code" },
    { name = "plan_type",     type = "STRING",    mode = "REQUIRED", description = "Health plan type" },
    { name = "payer_id",      type = "STRING",    mode = "REQUIRED", description = "Payer profile ID" },
    { name = "confidence",    type = "FLOAT64",   mode = "REQUIRED", description = "Model confidence score" },
    { name = "rationale",     type = "STRING",    mode = "REQUIRED", description = "Model rationale text" },
    { name = "clinical_notes", type = "STRING",   mode = "REQUIRED", description = "Synthetic clinical notes" },
    { name = "review_status", type = "STRING",    mode = "REQUIRED", description = "PENDING | APPROVED | DENIED | RETURNED" },
    { name = "reviewed_by",   type = "STRING",    mode = "NULLABLE", description = "Reviewer identity" },
    { name = "reviewed_at",   type = "TIMESTAMP", mode = "NULLABLE", description = "Review completion timestamp" },
    { name = "review_notes",  type = "STRING",    mode = "NULLABLE", description = "Reviewer notes" },
    { name = "queued_at",     type = "TIMESTAMP", mode = "REQUIRED", description = "Timestamp when queued for review" },
  ])
}
