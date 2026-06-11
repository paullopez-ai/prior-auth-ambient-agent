variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "subscriber_image" {
  description = "Full Docker image URI for the subscriber service (e.g. us-central1-docker.pkg.dev/PROJECT/prior-auth/subscriber:latest)"
  type        = string
}

variable "review_api_image" {
  description = "Full Docker image URI for the review-api service (e.g. us-central1-docker.pkg.dev/PROJECT/prior-auth/review-api:latest)"
  type        = string
}

variable "mock_llm" {
  description = "Set to 'true' to use mock Gemini responses (demo/test mode)"
  type        = string
  default     = "false"
}

variable "mock_bq" {
  description = "Set to 'true' to write BigQuery records to a local JSONL file instead of GCP"
  type        = string
  default     = "false"
}

variable "confidence_threshold" {
  description = "Routing threshold: scores >= this value are AUTO_APPROVE"
  type        = string
  default     = "0.80"
}

variable "gemini_model" {
  description = "Vertex AI Gemini model ID"
  type        = string
  default     = "gemini-2.0-flash"
}

variable "bigquery_dataset_id" {
  description = "BigQuery dataset ID for audit and review queue tables"
  type        = string
  default     = "prior_auth_audit"
}

variable "bigquery_location" {
  description = "BigQuery dataset location"
  type        = string
  default     = "US"
}
