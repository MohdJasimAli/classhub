# ClassHub API smoke test (PowerShell). Requires the API to be running.
# Exercises the full flow: auth, RBAC, resource CRUD, uploads, file access,
# notifications and the last-date reminder pipeline.
$ErrorActionPreference = 'Stop'
$base = "http://localhost:5000/api"
$pass = 0; $fail = 0

function Check($name, $cond, $extra) {
  if ($cond) { $script:pass++; Write-Host "  PASS  $name" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL  $name  $extra" -ForegroundColor Red }
}

function Login($email, $password) {
  try {
    $r = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
      -Body (@{ email = $email; password = $password } | ConvertTo-Json)
    return $r.data.token
  } catch { return $null }
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

# Builds and sends a multipart/form-data body.
#
# NOTE: this deliberately uses HttpClient rather than Invoke-RestMethod.
# Windows PowerShell 5.1 coerces a [byte[]] -Body into a string, which
# corrupts the multipart framing: the second file's part headers get read as
# file content and the upload is rejected by the magic-byte check.
function Send-Multipart($path, $token, $fields, $files) {
  $b = "----classhub" + [Guid]::NewGuid().ToString("N")
  $nl = "`r`n"

  $segments = New-Object System.Collections.Generic.List[byte]
  $utf8 = [Text.Encoding]::UTF8

  foreach ($k in $fields.Keys) {
    $chunk = "--$b$nl" + "Content-Disposition: form-data; name=`"$k`"$nl" + $nl + "$($fields[$k])$nl"
    $segments.AddRange($utf8.GetBytes($chunk))
  }
  foreach ($k in $files.Keys) {
    $f = $files[$k]
    $chunk = "--$b$nl" + "Content-Disposition: form-data; name=`"$k`"; filename=`"$($f.Name)`"$nl" +
             "Content-Type: $($f.Type)$nl" + $nl
    $segments.AddRange($utf8.GetBytes($chunk))
    $segments.AddRange($f.Bytes)
    $segments.AddRange($utf8.GetBytes($nl))
  }
  $segments.AddRange($utf8.GetBytes("--$b--$nl"))

  $body = $segments.ToArray()

  # Windows PowerShell 5.1 does not load this assembly by default.
  Add-Type -AssemblyName System.Net.Http

  $client = New-Object System.Net.Http.HttpClient
  $content = New-Object System.Net.Http.ByteArrayContent -ArgumentList (,$body)
  $content.Headers.ContentType =
    [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("multipart/form-data; boundary=$b")
  $req = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, "$base$path")
  $req.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)
  $req.Content = $content

  try {
    $resp = $client.SendAsync($req).GetAwaiter().GetResult()
    $text = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if ($resp.IsSuccessStatusCode) {
      return @{ ok = $true; r = ($text | ConvertFrom-Json) }
    }
    return @{ ok = $false; code = [int]$resp.StatusCode; msg = $text }
  } catch {
    return @{ ok = $false; code = 0; msg = $_.Exception.Message }
  } finally {
    $client.Dispose()
  }
}

function Pdf($name) {
  $bytes = [Text.Encoding]::ASCII.GetBytes("%PDF-1.4`n1 0 obj<</Type/Catalog>>endobj`ntrailer<</Root 1 0 R>>`n%%EOF")
  return @{ Name = $name; Type = "application/pdf"; Bytes = $bytes }
}

# `$path` is the API-relative path returned by the API (e.g. "/files/<name>").
function Get-File($path, $token) {
  try {
    $r = Invoke-WebRequest -Uri "$base$path" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing -TimeoutSec 15
    return $r.StatusCode
  } catch {
    $c = 0
    try { $c = [int]$_.Exception.Response.StatusCode } catch {}
    return $c
  }
}

$H = 3600000
$D = 86400000
$iso = { param($ms) (Get-Date).ToUniversalTime().AddMilliseconds($ms).ToString("yyyy-MM-ddTHH:mm:ss.fffZ") }

Write-Host "`n=== 1. AUTHENTICATION ===" -ForegroundColor Cyan
$at = Login "admin@classhub.edu" "Admin@12345"
Check "admin login" ($null -ne $at) ""

# The students are provisioned by the test through the admin API rather than
# assumed to exist as seed data. The previous version hardcoded
# jasm@student.classhub.edu and mei@student.classhub.edu, which meant the suite
# silently started failing the moment anyone edited or deleted the seed
# accounts on their development database. A unique suffix keeps re-runs working.
$run = [int][double]::Parse((Get-Date -UFormat %s))
$smokePass = "SmokeTest@12345"
$stu1Email = "smoke.student1.$run@example.test"
$stu2Email = "smoke.student2.$run@example.test"

$created1 = Api POST "/auth/students" $at @{ name = "Smoke Student One"; email = $stu1Email; password = $smokePass }
Check "admin creates a student" ($created1.ok) "got $($created1.code) $($created1.msg)"
$st = Login $stu1Email $smokePass
Check "student login" ($null -ne $st) ""

$r = Api POST "/auth/login" "" @{ email = "admin@classhub.edu"; password = "wrong" }
Check "wrong password -> 401" ($r.code -eq 401) "got $($r.code)"
$r = Api GET "/auth/me" "not.a.jwt"
Check "invalid token -> 401" ($r.code -eq 401) "got $($r.code)"

Write-Host "`n=== 2. RBAC ===" -ForegroundColor Cyan
foreach ($ep in @("/admin/students", "/admin/reminders")) {
  $r = Api GET $ep $st
  Check "student blocked from GET $ep (403)" ($r.code -eq 403) "got $($r.code)"
}
$r = Api POST "/admin/reminders/run" $st
Check "student blocked from reminder sweep (403)" ($r.code -eq 403) "got $($r.code)"
$r = Api POST "/resources" $st @{ type="QUIZ"; title="Hack attempt"; lastDate=(& $iso (7*$D)); questionText="Q?"; answerText="A." }
Check "student blocked from POST /resources (403)" ($r.code -eq 403) "got $($r.code)"
$r = Api DELETE "/resources/anything" $st
Check "student blocked from DELETE (403)" ($r.code -eq 403) "got $($r.code)"

Write-Host "`n=== 3. ADMIN UPLOADS QUESTION + ANSWER + LAST DATE ===" -ForegroundColor Cyan
$r = Send-Multipart "/resources" $at @{
  type = "QUIZ"; title = "SMOKE Quiz Material"; description = "created by smoke test"
  questionText = "1. What is 2 + 2?"; answerText = "1. B - 4"
  lastDate = (& $iso (7*$D)); isPublished = "true"
} @{ questionFile = (Pdf "question paper.pdf"); answerFile = (Pdf "model answer.pdf") }
Check "create with two files (201)" ($r.ok) "$($r.msg)"
$rid = $r.r.data.id
Check "question file stored safely" ($r.r.data.questionFile.url -match '^/files/\d+-[0-9a-f-]{36}\.pdf$') "got $($r.r.data.questionFile.url)"
Check "answer file stored safely"   ($r.r.data.answerFile.url -match '^/files/\d+-[0-9a-f-]{36}\.pdf$') "got $($r.r.data.answerFile.url)"
Check "display names preserved" ($r.r.data.questionFile.name -eq "question paper.pdf") "got $($r.r.data.questionFile.name)"
Check "isPublished coerced from multipart string" ($r.r.data.isPublished -eq $true) ""
Check "hasQuestion / hasAnswer" ($r.r.data.hasQuestion -and $r.r.data.hasAnswer) ""

# API-relative paths, used directly by Get-File.
$aq = $r.r.data.questionFile.url
$ab = $r.r.data.answerFile.url

Write-Host "`n=== 4. VALIDATION ===" -ForegroundColor Cyan

# Create a draft explicitly. The suite used to rely on a draft that the dev
# seed happened to leave behind, so it reported a false failure on any database
# that had been cleaned up or was otherwise all-published.
$r = Send-Multipart "/resources" $at @{ type="QUIZ"; title="SMOKE Draft (not published)"; questionText="Draft Q?"; answerText="Draft A."; lastDate=(& $iso (7*$D)); isPublished="false" } $null
Check "create draft (201)" ($r.ok) "got $($r.code) $($r.msg)"
$draftId = $r.r.data.id

$r = Send-Multipart "/resources" $at @{ type="QUIZ"; title="No answer"; lastDate=(& $iso (7*$D)); questionText="Q?" } $null
Check "missing answer -> 400" ($r.code -eq 400) "got $($r.code)"
$r = Send-Multipart "/resources" $at @{ type="QUIZ"; title="No question"; lastDate=(& $iso (7*$D)); answerText="A." } $null
Check "missing question -> 400" ($r.code -eq 400) "got $($r.code)"
$r = Send-Multipart "/resources" $at @{ type="QUIZ"; title="Past date"; questionText="Q?"; answerText="A."; lastDate=(& $iso (-1*$D)) } $null
Check "past last date -> 422" ($r.code -eq 422) "got $($r.code)"
$r = Send-Multipart "/resources" $at @{ type="QUIZ"; title="ab"; questionText="Q?"; answerText="A."; lastDate=(& $iso (7*$D)) } $null
Check "short title -> 422" ($r.code -eq 422) "got $($r.code)"

$exe = @{ Name = "evil.exe"; Type = "application/octet-stream"; Bytes = [byte[]](0x4D,0x5A,0x90,0x00) }
$r = Send-Multipart "/resources" $at @{ type="QUIZ"; title="Bad ext"; questionText="Q?"; lastDate=(& $iso (7*$D)) } @{ answerFile = $exe }
Check "disallowed extension -> 400" ($r.code -eq 400) "got $($r.code)"
$disguised = @{ Name = "doc.pdf"; Type = "application/pdf"; Bytes = [byte[]](0x4D,0x5A,0x90,0x00,0x03,0x00,0x00,0x00,0x04,0x00) }
$r = Send-Multipart "/resources" $at @{ type="QUIZ"; title="Disguised"; questionText="Q?"; lastDate=(& $iso (7*$D)) } @{ answerFile = $disguised }
Check "magic-byte mismatch -> 400" ($r.code -eq 400) "got $($r.code)"

Write-Host "`n=== 5. STUDENT READS THE MATERIAL ===" -ForegroundColor Cyan
$created2 = Api POST "/auth/students" $at @{ name = "Smoke Student Two"; email = $stu2Email; password = $smokePass }
Check "admin creates a second student" ($created2.ok) "got $($created2.code) $($created2.msg)"
$mt = Login $stu2Email $smokePass
Check "second student login" ($null -ne $mt) ""
$r = Api GET "/resources/$rid" $mt
Check "student opens resource (200)" ($r.ok) "$($r.msg)"
Check "student sees the question" ($r.r.data.questionText -match "2 \+ 2") ""
Check "student sees the answer"   ($r.r.data.answerText -match "B - 4") ""
Check "phase reported" ($r.r.data.phase -eq "OPEN") "got $($r.r.data.phase)"

$r = Api GET "/resources?limit=100" $st
$drafts = @($r.r.data | Where-Object { $_.isPublished -eq $false })
Check "student sees only published" ($drafts.Count -eq 0) "got $($drafts.Count)"

$r = Api PATCH "/resources/$rid/publish" $at @{ isPublished = $false }
Check "admin unpublishes" ($r.ok -and $r.r.data.isPublished -eq $false) "got $($r.code) $($r.msg)"
$hidden = Api GET "/resources/$rid" $mt
Check "unpublished hidden from student (404)" ($hidden.code -eq 404) "got $($hidden.code)"
$r = Api PATCH "/resources/$rid/publish" $at @{ isPublished = $true }
Check "admin republishes" ($r.ok) "got $($r.code) $($r.msg)"

Write-Host "`n=== 6. FILE ACCESS CONTROL ===" -ForegroundColor Cyan
Check "student downloads published file (200)" ((Get-File $aq $mt) -eq 200) "got $((Get-File $aq $mt))"
Check "other student downloads it too (200)" ((Get-File $aq $st) -eq 200) "got $((Get-File $aq $st))"
Check "answer file downloads (200)" ((Get-File $ab $mt) -eq 200) "got $((Get-File $ab $mt))"
Check "admin downloads any (200)" ((Get-File $aq $at) -eq 200) ""
Check "unauthenticated blocked (401)" ((Get-File $aq "") -eq 401) "got $((Get-File $aq ''))"
Check "unknown file -> 404" ((Get-File "/files/0000000000-00000000-0000-0000-000000000000.pdf" $at) -eq 404) ""
Check "path traversal blocked" ((Get-File "/files/..%2F..%2F.env" $at) -ge 400) "got $((Get-File '/files/..%2F..%2F.env' $at))"

Write-Host "`n=== 7. NOTIFICATIONS ===" -ForegroundColor Cyan
$r = Api GET "/notifications/unread-count" $mt
$uc = $r.r.data.count
Check "unread count > 0" ($uc -gt 0) "got $uc"
$r = Api GET "/notifications" $mt
$nid = $r.r.data.items[0].id
$r = Api PATCH "/notifications/$nid/read" $mt
Check "mark one read" ($r.ok) ""
$r = Api PATCH "/notifications/$nid/read" $mt
Check "idempotent re-read" ($r.ok) ""
$jr = Api GET "/notifications" $st
$r = Api PATCH "/notifications/$($jr.r.data.items[0].id)/read" $mt
Check "cannot touch another user's notification (404)" ($r.code -eq 404) "got $($r.code)"
$r = Api PATCH "/notifications/read-all" $mt
Check "mark all read" ($r.ok -and $r.r.data.unreadCount -eq 0) ""

Write-Host "`n=== 8. DASHBOARDS ===" -ForegroundColor Cyan
$r = Api GET "/dashboard" $at
Check "admin dashboard" ($r.ok -and $r.r.data.role -eq "ADMIN") ""
Check "admin sees drafts" ($r.r.data.stats.draftResources -ge 1) "got $($r.r.data.stats.draftResources)"
$r = Api GET "/dashboard" $mt
Check "student dashboard" ($r.ok -and $r.r.data.role -eq "STUDENT") ""

Write-Host "`n=== 9. 24-HOUR REMINDER ===" -ForegroundColor Cyan
$rd = Send-Multipart "/resources" $at @{
  type = "ASSIGNMENT"; title = "SMOKE Reminder Target"; questionText = "Q?"; answerText = "A."
  lastDate = (& $iso (24*$H)); isPublished = "true"
} $null
Check "create resource due in exactly 24h" ($rd.ok) "$($rd.msg)"
$target = $rd.r.data.id

$r = Api POST "/admin/reminders/run" $at
Check "sweep #1 sends reminders" ($r.r.data.remindersCreated -ge 1) "got $($r.r.data.remindersCreated)"

foreach ($i in 2..3) {
  $r = Api POST "/admin/reminders/run" $at
  Check "sweep #$i creates 0" ($r.r.data.remindersCreated -eq 0) "got $($r.r.data.remindersCreated)"
  Check "sweep #$i blocks duplicates" ($r.r.data.duplicatesPrevented -ge 1) "got $($r.r.data.duplicatesPrevented)"
}

$r = Api GET "/admin/reminders?limit=200" $at
$rows = @($r.r.data | Where-Object { $_.targetId -eq $target })
$before = $rows.Count
Check "reminder rows recorded" ($before -ge 1) "got $before"

# Restart safety is verified separately by scripts/verify-restart.ps1, because
# restarting the server from inside a test run is slow and fragile. It is also
# covered automatically by the "resumes correctly after a simulated server
# restart" case in the Vitest suite.

Write-Host "`n=== 10. CLEANUP ===" -ForegroundColor Cyan
$r = Api DELETE "/resources/$rid" $at
Check "delete resource" ($r.ok) "$($r.msg)"
$r = Api DELETE "/resources/$target" $at
Check "delete reminder target" ($r.ok) "$($r.msg)"

# Remove every row this run created, so repeated runs do not slowly fill the
# database with junk. Matching is on the suite's own prefixes, so real data is
# never touched. Anything left behind by an older, interrupted run is swept up
# by the same patterns.
# NOTE: `limit` is capped at 100 by the API; asking for more returns a 400 and
# would silently turn the checks below into a false pass.
$resLeft = @(Api GET "/resources?limit=100" $at).r.data | Where-Object { $_.title -like "SMOKE*" }
foreach ($stale in $resLeft) { Api DELETE "/resources/$($stale.id)" $at | Out-Null }
# Students are soft-deleted by default, so ?hard=true is required to actually
# remove the row rather than leave it sitting there as inactive.
$stuLeft = @(Api GET "/admin/students?limit=100" $at).r.data | Where-Object { $_.email -like "*@example.test" }
foreach ($s in $stuLeft) { Api DELETE "/admin/students/$($s.id)?hard=true" $at | Out-Null }

$leftRes = @(Api GET "/resources?limit=100" $at).r.data | Where-Object { $_.title -like "SMOKE*" }
Check "no SMOKE resources left behind" ($leftRes.Count -eq 0) "got $($leftRes.Count)"
$leftStu = @(Api GET "/admin/students?limit=100" $at).r.data | Where-Object { $_.email -like "*@example.test" }
Check "no smoke students left behind" ($leftStu.Count -eq 0) "got $($leftStu.Count)"

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "  PASSED: $pass   FAILED: $fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "==========================================`n" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
