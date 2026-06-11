output "subscriber_url" {
  description = "Cloud Run URL for the subscriber service"
  value       = google_cloud_run_v2_service.subscriber.uri
}

output "review_api_url" {
  description = "Cloud Run URL for the review API service"
  value       = google_cloud_run_v2_service.review_api.uri
}

output "pubsub_topic" {
  description = "Full Pub/Sub topic name"
  value       = google_pubsub_topic.prior_auth_requests.id
}

output "pubsub_subscription" {
  description = "Full Pub/Sub subscription name"
  value       = google_pubsub_subscription.push_sub.id
}

output "artifact_registry_repo" {
  description = "Artifact Registry repository URI (prefix for image tags)"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.prior_auth.repository_id}"
}

output "bigquery_dataset" {
  description = "BigQuery dataset ID"
  value       = google_bigquery_dataset.prior_auth_audit.dataset_id
}

output "subscriber_sa_email" {
  description = "Subscriber service account email"
  value       = google_service_account.subscriber.email
}

output "review_api_sa_email" {
  description = "Review API service account email"
  value       = google_service_account.review_api.email
}
