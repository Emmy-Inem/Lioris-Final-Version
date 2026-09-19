<#
.SYNOPSIS
  Deploy every Lioris Supabase edge function and report which secrets are still missing.

.DESCRIPTION
  PowerShell twin of scripts/deploy-supabase.sh (Windows PowerShell 5.1+ / PowerShell 7).
  -DryRun     Read-only checks (login / link / secrets list) run, but deploy commands are only PRINTED
              and no smoke requests are sent.
  -SkipSmoke  Skip the post-deploy smoke checks.
  -Only       Deploy only these functions, e.g. -Only send-push,turn-credentials

  Never contains or prints secret values: `supabase secrets list` output is reduced to NAMES.
  Apply the SQL migrations FIRST (see docs/security/deploy.md).
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$SkipSmoke,
  [string[]]$Only = @()
)

$ErrorActionPreference = 'Continue'

$ProjectRef  = 'fdtnbluslkabwsmspbem'
$SupabaseUrl = "https://$ProjectRef.supabase.co"
# Public (publishable) key - safe to embed, it ships in every client bundle.
$AnonKey = if ($env:SUPABASE_ANON_KEY) { $env:SUPABASE_ANON_KEY } else { 'sb_publishable_TB0Pw8k2oJQTmoO951YaIQ_xzOyGpZF' }

# Functions deployed with --no-verify-jwt (mirrors supabase/config.toml).
$JwtOff = @('overpass-proxy', 'purge-expired-verification-documents', 'send-push', 'report-client-error')

$RequiredSecrets = @(
  'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'ALLOWED_ORIGINS', 'REQUIRE_ADMIN_MFA',
  'CRON_SECRET', 'PUSH_WEBHOOK_SECRET', 'TURN_KEY_ID', 'TURN_KEY_API_TOKEN'
)
$OptionalSecrets = @('EXPO_ACCESS_TOKEN')

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Ok($m)   { Write-Host "  [ OK ] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red }

if ($DryRun) { Write-Host '== DRY RUN: nothing will be deployed ==' }

# ---------------------------------------------------------------- 1. CLI, login, link
Write-Host ''
Write-Host '== 1. Supabase CLI =='
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Bad 'supabase CLI not found. Install: https://supabase.com/docs/guides/cli'
  exit 1
}
$ver = (& supabase --version 2>$null | Select-Object -First 1)
Ok "CLI $ver"

& supabase projects list *> $null
if ($LASTEXITCODE -eq 0) { Ok 'logged in' } else { Bad 'not logged in. Run: supabase login'; exit 1 }

$linked = ''
$refFile = Join-Path $Root 'supabase/.temp/project-ref'
if (Test-Path $refFile) { $linked = (Get-Content $refFile -Raw).Trim() }
if ($linked -eq $ProjectRef) {
  Ok "linked to $ProjectRef"
} else {
  $shown = if ($linked) { $linked } else { 'none' }
  Bad "not linked to $ProjectRef (linked: $shown). Run: supabase link --project-ref $ProjectRef"
  exit 1
}

# ---------------------------------------------------------------- 2. secrets (names only)
Write-Host ''
Write-Host '== 2. Secrets (names only, values are never read) =='
$raw = & supabase secrets list --project-ref $ProjectRef 2>$null
$present = @()
foreach ($line in $raw) {
  if ($line -match '^\s*([A-Za-z0-9_]+)\s*\|' -and $Matches[1] -ne 'NAME') { $present += $Matches[1] }
}
if ($present.Count -eq 0) {
  Warn 'could not read the secrets list (empty or CLI output format changed); treat every secret as unverified'
}
$missing = 0
foreach ($s in $RequiredSecrets) {
  if ($present -contains $s) { Ok "$s set" }
  else { Bad "$s MISSING   -> supabase secrets set $s=<value>"; $missing++ }
}
foreach ($s in $OptionalSecrets) {
  if ($present -contains $s) { Ok "$s set (optional)" } else { Warn "$s not set (optional)" }
}

# ---------------------------------------------------------------- 3. deploy
Write-Host ''
Write-Host '== 3. Deploy functions =='
$functions = @()
foreach ($d in Get-ChildItem (Join-Path $Root 'supabase/functions') -Directory) {
  if ($d.Name -eq '_shared') { continue }
  if (-not (Test-Path (Join-Path $d.FullName 'index.ts'))) { continue }
  if ($Only.Count -gt 0 -and ($Only -notcontains $d.Name)) { continue }
  $functions += $d.Name
}

$failed = @()
foreach ($fn in $functions) {
  $cmdArgs = @('functions', 'deploy', $fn, '--project-ref', $ProjectRef)
  if ($JwtOff -contains $fn) { $cmdArgs += '--no-verify-jwt' }
  if ($DryRun) {
    Write-Host "  [dry-run] supabase $($cmdArgs -join ' ')"
  } else {
    Write-Host "  `$ supabase $($cmdArgs -join ' ')"
    & supabase @cmdArgs
    if ($LASTEXITCODE -ne 0) { $failed += $fn }
  }
}
if ($failed.Count -gt 0) { Bad "deploy failed for: $($failed -join ', ')" } else { Ok "$($functions.Count) function(s) processed" }

# ---------------------------------------------------------------- 4. smoke checks
Write-Host ''
Write-Host '== 4. Smoke checks (anon key, no user session) =='
if ($DryRun -or $SkipSmoke) {
  Write-Host '  skipped. Would POST {} to each function and expect:'
  Write-Host '    gemini-proxy, admin-delete-user, admin-impersonate-user, delete-my-account, turn-credentials -> 401'
  Write-Host '    purge-expired-verification-documents, send-push -> 401 (500 = secret not set yet)'
  Write-Host '    overpass-proxy -> 400 (invalid coordinates)   report-client-error -> 400/202/204'
} else {
  $expectations = @{
    'gemini-proxy'                         = @(401)
    'admin-delete-user'                    = @(401)
    'admin-impersonate-user'               = @(401)
    'delete-my-account'                    = @(401)
    'turn-credentials'                     = @(401)
    'purge-expired-verification-documents' = @(401)
    'send-push'                            = @(401)
    'overpass-proxy'                       = @(400)
    'report-client-error'                  = @(400, 202, 204)
  }
  $smokeFail = 0
  foreach ($fn in $functions) {
    if (-not $expectations.ContainsKey($fn)) { Warn "${fn}: no smoke expectation defined"; continue }
    $code = 0
    try {
      $resp = Invoke-WebRequest -Uri "$SupabaseUrl/functions/v1/$fn" -Method Post -Body '{}' `
        -ContentType 'application/json' -UseBasicParsing -TimeoutSec 20 `
        -Headers @{ apikey = $AnonKey; Authorization = "Bearer $AnonKey" }
      $code = [int]$resp.StatusCode
    } catch {
      if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    }
    $exp = $expectations[$fn] -join '/'
    if ($expectations[$fn] -contains $code) { Ok "$fn -> $code (expected $exp)" }
    else { Bad "$fn -> $code (expected $exp)"; $smokeFail++ }
  }
  if ($smokeFail -gt 0) { Bad "$smokeFail smoke check(s) failed" }
}

# ---------------------------------------------------------------- 5. summary
Write-Host ''
Write-Host '== Summary =='
if ($missing -gt 0) { Bad "$missing required secret(s) missing (see above)" }
if ($failed.Count -gt 0) { Bad "deploy failures: $($failed -join ', ')" }
Write-Host 'Next: create the send-push Database Webhook (docs/operations/push-notifications.md) and run scripts/verify-production.sh'
if ($missing -eq 0 -and $failed.Count -eq 0) { exit 0 } else { exit 1 }
