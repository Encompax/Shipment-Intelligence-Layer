param(
  [string]$ProjectId = "encompax-prod",
  [string]$Region = "us-central1",
  [string]$ServiceName = "encompax-sil-api",
  [string]$ImageName = "encompax-sil-api",
  [string]$AllowedOrigins = "https://sil.encompax.io,http://localhost:5173",
  [string]$EncompaxApiBaseUrl = "https://api.encompax.io/api"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud is required but was not found on PATH. Install Google Cloud SDK or run this from an environment that has it."
}

$image = "gcr.io/$ProjectId/$ImageName"

Push-Location "$PSScriptRoot\..\backend"
try {
  gcloud config set project $ProjectId
  gcloud builds submit --tag $image .
  gcloud run deploy $ServiceName `
    --image $image `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --set-env-vars "ALLOWED_ORIGINS=$AllowedOrigins,ENCOMPAX_API_BASE_URL=$EncompaxApiBaseUrl"
}
finally {
  Pop-Location
}
