resource "google_artifact_registry_repository" "prior_auth" {
  repository_id = "prior-auth"
  location      = var.region
  format        = "DOCKER"
  description   = "Docker images for prior-auth-ambient-agent"

  depends_on = [google_project_service.apis]
}
