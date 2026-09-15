$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'deploy-sil-api-cloudrun.ps1'
$global:SilDeployTestCalls = [System.Collections.Generic.List[object]]::new()
$global:SilDeployTestMode = 'success'

# This fixture shadows gcloud; no cloud command, build, deployment, or IAM write runs.
function global:gcloud {
  $global:SilDeployTestCalls.Add(@($args))
  $global:LASTEXITCODE = 0
  if ($args[0] -eq 'storage') {
    if ($global:SilDeployTestMode -eq 'bucket-failure') { $global:LASTEXITCODE = 1; return }
    $prevention = if ($global:SilDeployTestMode -eq 'public') { 'inherited' } else { 'enforced' }
    return (@{ iamConfiguration = @{ uniformBucketLevelAccess = @{ enabled = $true }; publicAccessPrevention = $prevention } } | ConvertTo-Json -Depth 4)
  }
  if ($args[0] -eq 'builds' -and $global:SilDeployTestMode -eq 'build-failure') { $global:LASTEXITCODE = 1 }
  if ($args[0] -eq 'run' -and $global:SilDeployTestMode -eq 'deploy-failure') { $global:LASTEXITCODE = 1 }
}

try {
  foreach ($case in @(
    @{ mode = 'missing'; count = 0; expected = 'requires Firestore' },
    @{ mode = 'public'; count = 1; expected = 'public access prevention' },
    @{ mode = 'bucket-failure'; count = 1; expected = 'preflight failed' },
    @{ mode = 'build-failure'; count = 2; expected = 'Cloud Build failed' },
    @{ mode = 'deploy-failure'; count = 3; expected = 'deployment failed' },
    @{ mode = 'success'; count = 3; expected = $null }
  )) {
    $global:SilDeployTestMode = $case.mode
    $global:SilDeployTestCalls.Clear()
    $failure = $null
    $bucket = if ($case.mode -eq 'missing') { '' } else { 'isolated-test-bucket' }
    try { & $scriptPath -UploadBucket $bucket | Out-Null } catch { $failure = $_.Exception.Message }
    if ($global:SilDeployTestCalls.Count -ne $case.count) { throw "Wrong command count for $($case.mode)." }
    if ($case.expected -and $failure -notlike "*$($case.expected)*") { throw "Expected error was absent: $($case.mode): $failure" }
    if (-not $case.expected -and $failure) { throw $failure }
    if ($case.mode -eq 'success') {
      $deployment = $global:SilDeployTestCalls[2]
      $index = [Array]::IndexOf($deployment, '--update-env-vars')
      if ($index -lt 0 -or $deployment[$index + 1] -notlike '^~^*SIL_UPLOAD_BUCKET=isolated-test-bucket*') { throw 'Environment updates not preserved.' }
      if ($deployment -contains '--env-vars-file' -or $deployment -contains '--set-env-vars') { throw 'Unrelated environment values would be removed.' }
    }
    Write-Output "PASS: $($case.mode)"
  }
} finally {
  Remove-Item Function:\gcloud
  Remove-Variable SilDeployTestCalls, SilDeployTestMode -Scope Global
}
