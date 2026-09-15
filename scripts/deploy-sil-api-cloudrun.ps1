param(
  [string]$ProjectId = "encompax-prod",
  [string]$Region = "us-central1",
  [string]$ServiceName = "encompax-sil-api",
  [string]$ImageName = "encompax-sil-api",
  [string]$AllowedOrigins = "https://sil.encompax.io,https://www.encompax.com,https://encompax.com,http://localhost:5173",
  [string]$EncompaxApiBaseUrl = "https://api.encompax.io/api",
  [string]$MarengoApiBaseUrl = "https://marengo.encompax.io",
  [string]$SilFirestoreEnabled = "true",
  [string]$SilFirestorePrimaryEnabled = "true",
  [string]$UploadBucket = $env:SIL_UPLOAD_BUCKET,
  [string]$ServiceAccount = "encompax-sil-runtime@encompax-prod.iam.gserviceaccount.com",
  [string]$ImageTag = (Get-Date -Format 'yyyyMMddHHmmss'),
  [switch]$NoTraffic,
  [string]$Tag,
  [string]$DatabaseUrl = "file:/tmp/sil-dev.db"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud is required but was not found on PATH. Install Google Cloud SDK or run this from an environment that has it."
}

if ($SilFirestorePrimaryEnabled -ne "true" -or $UploadBucket -notmatch '^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$') {
  throw "Cloud SIL intake requires Firestore primary storage and -UploadBucket with a private bucket name (no gs://)."
}
$bucketJson = gcloud storage buckets describe "gs://$UploadBucket" --project $ProjectId --raw --format=json
if ($LASTEXITCODE -ne 0) { throw "Upload bucket preflight failed; no build or deploy was started." }
$bucket = ($bucketJson -join "`n") | ConvertFrom-Json
if ($bucket.iamConfiguration.uniformBucketLevelAccess.enabled -ne $true -or $bucket.iamConfiguration.publicAccessPrevention -ne "enforced") {
  throw "Upload bucket must have uniform bucket-level access and public access prevention enforced."
}

$image = "gcr.io/${ProjectId}/${ImageName}:$ImageTag"
$environment = [ordered]@{
  ALLOWED_ORIGINS = $AllowedOrigins
  ENCOMPAX_API_BASE_URL = $EncompaxApiBaseUrl
  MARENGO_API_BASE = $MarengoApiBaseUrl
  SIL_AUTH_REQUIRED = "true"
  SIL_FIRESTORE_ENABLED = $SilFirestoreEnabled
  SIL_FIRESTORE_PRIMARY_ENABLED = $SilFirestorePrimaryEnabled
  SIL_FIRESTORE_PROJECT_ID = $ProjectId
  SIL_UPLOAD_BUCKET = $UploadBucket
  DATABASE_URL = $DatabaseUrl
}
foreach ($value in $environment.Values) {
  if ([string]$value -match '[~\r\n]') { throw "Deployment environment values cannot contain ~ or newlines." }
}
$environmentUpdate = '^~^' + (($environment.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '~')
$deploymentOptions = @('--service-account', $ServiceAccount)
if ($NoTraffic) { $deploymentOptions += '--no-traffic' }
if ($Tag) { $deploymentOptions += @('--tag', $Tag) }

Push-Location "$PSScriptRoot\..\backend"
try {
  gcloud builds submit --project $ProjectId --tag $image .
  if ($LASTEXITCODE -ne 0) { throw "Cloud Build failed; deployment was not attempted." }
  gcloud run deploy $ServiceName `
    --project $ProjectId `
    --image $image `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --update-env-vars $environmentUpdate @deploymentOptions
  if ($LASTEXITCODE -ne 0) { throw "Cloud Run deployment failed." }
}
finally {
  Pop-Location
}


