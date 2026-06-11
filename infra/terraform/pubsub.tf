resource "google_pubsub_topic" "prior_auth_requests" {
  name = "prior-auth-requests"

  message_retention_duration = "86600s" # ~24 hours

  depends_on = [google_project_service.apis]
}

resource "google_pubsub_subscription" "push_sub" {
  name  = "prior-auth-push-sub"
  topic = google_pubsub_topic.prior_auth_requests.name

  push_config {
    # Cloud Run URL is resolved after the service is created
    push_endpoint = "${google_cloud_run_v2_service.subscriber.uri}/pubsub/push"

    oidc_token {
      service_account_email = google_service_account.pubsub_invoker.email
      audience              = google_cloud_run_v2_service.subscriber.uri
    }
  }

  # Exponential backoff retry policy; terminal failures (HTTP 400) are not retried
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  # Messages not acknowledged within 60 s are redelivered
  ack_deadline_seconds = 60

  # Hold undelivered messages for 7 days
  message_retention_duration = "604800s"

  depends_on = [
    google_cloud_run_v2_service.subscriber,
    google_service_account.pubsub_invoker,
    google_cloud_run_v2_service_iam_member.subscriber_pubsub_invoker,
    google_service_account_iam_member.pubsub_sa_token_creator,
  ]
}
