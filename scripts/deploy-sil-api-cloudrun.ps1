param(
  [string]$ProjectId = "encompax-prod",
  [string]$Region = "us-central1",
  [string]$ServiceName = "encompax-sil-api",
  [string]$ImageName = "encompax-sil-api",
  [string]$AllowedOrigins = "https://sil.encompax.io,https://www.encompax.com,https://encompax.com,http://localhost:5173",
  [string]$EncompaxApiBaseUrl = "https://api.encompax.io/api",
  [string]$SilFirestoreEnabled = "true",
  [string]$SilFirestorePrimaryEnabled = "true",
  [string]$DatabaseUrl = "file:/tmp/sil-dev.db"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud is required but was not found on PATH. Install Google Cloud SDK or run this from an environment that has it."
}

$image = "gcr.io/$ProjectId/$ImageName"
$envFile = Join-Path $env:TEMP "sil-cloudrun-env-$ServiceName.yaml"
@"
ALLOWED_ORIGINS: "$AllowedOrigins"
ENCOMPAX_API_BASE_URL: "$EncompaxApiBaseUrl"
SIL_AUTH_REQUIRED: "true"
SIL_FIRESTORE_ENABLED: "$SilFirestoreEnabled"
SIL_FIRESTORE_PRIMARY_ENABLED: "$SilFirestorePrimaryEnabled"
SIL_FIRESTORE_PROJECT_ID: "$ProjectId"
DATABASE_URL: "$DatabaseUrl"
"@ | Set-Content -Path $envFile -Encoding UTF8

Push-Location "$PSScriptRoot\..\backend"
try {
  gcloud config set project $ProjectId
  gcloud builds submit --tag $image .
  gcloud run deploy $ServiceName `
    --image $image `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --env-vars-file $envFile
}
finally {
  if (Test-Path $envFile) { Remove-Item -LiteralPath $envFile -Force }
  Pop-Location
}


