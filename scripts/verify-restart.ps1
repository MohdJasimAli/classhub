# Verifies that reminder state survives a server restart.
#
# Reminders are stored in the database, not in memory, so restarting the
# process must not produce duplicate emails. This script:
#   1. creates a resource whose last date is exactly 24 hours away
#   2. runs the sweep and records how many reminders were created
#   3. kills and restarts the API
#   4. re-checks that the count is unchanged, and that a further sweep is a no-op
#
# Usage (API must be running first):
#   powershell -ExecutionPolicy Bypass -File scripts\verify-restart.ps1
$ErrorActionPreference = 'Stop'
$base = "http://localhost:5000/api"
$serverDir = "E:\Project\CODE\BuddyWork\server"
$pass = 0; $fail = 0

function Check($name, $cond, $extra) {
  if ($cond) { $script:pass++; Write-Host "  PASS  $name" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL  $name  $extra" -ForegroundColor Red }
}

function Login($e, $p) {
  (Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ email = $e; password = $p } | ConvertTo-Json)).data.token
}

function Api($method, $path, $token, $body) {
  $p = @{ Uri = "$base$path"; Method = $method; Headers = @{ Authorization = "Bearer $token" } }
  if ($null -ne $body) { $p.ContentType = 'application/json'; $p.Body = ($body | ConvertTo-Json -Depth 8) }
  try { return @{ ok = $true; r = Invoke-RestMethod @p } }
  catch {
    $code = 0
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    return @{ ok = $false; code = $code; msg = $_.ErrorDetails.Message }
  }
}

$at = Login "admin@classhub.edu" "Admin@12345"
$H = 3600000

Write-Host "`n=== SETUP: resource due in exactly 24 hours ===" -ForegroundColor Cyan
$deadline = (Get-Date).ToUniversalTime().AddHours(24).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$r = Api POST "/resources" $at @{
  type = "ASSIGNMENT"; title = "RESTART CHECK - 24h material"
  questionText = "Q?"; answerText = "A."; lastDate = $deadline; isPublished = $true
}
if (-not $r.ok) { Write-Host "  setup failed: $($r.msg)" -ForegroundColor Red; exit 1 }
$id = $r.r.data.id
Write-Host "  created resource $id due $deadline"

Write-Host "`n=== 1. SWEEP BEFORE RESTART ===" -ForegroundColor Cyan
$r = Api POST "/admin/reminders/run" $at
Write-Host "  remindersCreated=$($r.r.data.remindersCreated) emailsSent=$($r.r.data.emailsSent)"
Check "sweep created reminders" ($r.r.data.remindersCreated -ge 1) "got $($r.r.data.remindersCreated)"

$r = Api GET "/admin/reminders?limit=200" $at
$before = @($r.r.data | Where-Object { $_.targetId -eq $id }).Count
Check "reminder rows recorded" ($before -ge 1) "got $before"

Write-Host "`n=== 2. RESTARTING THE API ===" -ForegroundColor Cyan
# Only the process that owns port 5000 is restarted. Never kill every node
# process: the tooling that launches this script may itself be node-based.
$listener = Get-NetTCPConnection -State Listen -LocalPort 5000 -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listener) {
  Write-Host "  stopping PID $($listener.OwningProcess) (owner of port 5000)"
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
} else {
  Write-Host "  no listener on port 5000 to stop"
}
Start-Sleep -Seconds 4

Start-Process -FilePath "npx.cmd" -ArgumentList "tsx", "src/index.ts" -WorkingDirectory $serverDir `
  -RedirectStandardOutput "$serverDir\debug.log" -RedirectStandardError "$serverDir\debug.err" -WindowStyle Hidden

# Poll for readiness rather than sleeping a fixed amount.
$up = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  try {
    if ((Invoke-RestMethod -Uri "$base/health" -TimeoutSec 3).data.status -eq 'ok') { $up = $true; break }
  } catch { }
}
Check "API is back up" $up ""

Write-Host "`n=== 3. SWEEP AFTER RESTART ===" -ForegroundColor Cyan
$at = Login "admin@classhub.edu" "Admin@12345"
$r = Api GET "/admin/reminders?limit=200" $at
$after = @($r.r.data | Where-Object { $_.targetId -eq $id }).Count
Write-Host "  reminders for resource: before=$before after=$after"
Check "reminder state persisted (no duplicates)" ($after -eq $before) "$before -> $after"

$r = Api POST "/admin/reminders/run" $at
Check "post-restart sweep creates nothing new" ($r.r.data.remindersCreated -eq 0) "got $($r.r.data.remindersCreated)"
Check "post-restart sweep blocks duplicates" ($r.r.data.duplicatesPrevented -ge 1) "got $($r.r.data.duplicatesPrevented)"

Write-Host "`n=== 4. CLEANUP ===" -ForegroundColor Cyan
$r = Api DELETE "/resources/$id" $at
Check "delete test resource" ($r.ok) "got $($r.code) $($r.msg)"

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  PASSED: $pass   FAILED: $fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "==========================================`n" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
