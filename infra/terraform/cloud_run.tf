# ── Subscriber Service (port 8080) ───────────────────────────────────────────
resource "google_cloud_run_v2_service" "subscriber" {
  name     = "prior-auth-subscriber"
  location = var.region

  template {
    service_account = google_service_account.subscriber.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = var.subscriber_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "SUBSCRIBER_PORT"
        value = "8080"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "PUBSUB_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "MOCK_LLM"
        value = var.mock_llm
      }
      env {
        name  = "MOCK_BQ"
        value = var.mock_bq
      }
      env {
        name  = "CONFIDENCE_THRESHOLD"
        value = var.confidence_threshold
      }
      env {
        name  = "VERTEX_AI_LOCATION"
        value = var.region
      }
      env {
        name  = "GEMINI_MODEL"
        value = var.gemini_model
      }
      env {
        name  = "BIGQUERY_DATASET_ID"
        value = var.bigquery_dataset_id
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 5
        period_seconds        = 30
        failure_threshold     = 3
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_service_account.subscriber,
  ]
}

# ── Review API Service (port 8081) ───────────────────────────────────────────
resource "google_cloud_run_v2_service" "review_api" {
  name     = "prior-auth-review-api"
  location = var.region

  template {
    service_account = google_service_account.review_api.email

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    containers {
      image = var.review_api_image

      ports {
        container_port = 8081
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        cpu_idle = true
      }

      env {
        name  = "REVIEW_API_PORT"
        value = "8081"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "MOCK_BQ"
        value = var.mock_bq
      }
      env {
        name  = "BIGQUERY_DATASET_ID"
        value = var.bigquery_dataset_id
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8081
        }
        initial_delay_seconds = 5
        period_seconds        = 30
        failure_threshold     = 3
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_service_account.review_api,
  ]
}
