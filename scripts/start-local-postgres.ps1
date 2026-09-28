<#
.SYNOPSIS
    Starts the local PostgreSQL server that ClassHub's development database uses.

.DESCRIPTION
    The database is a portable PostgreSQL 17 install in
    C:\Users\Lenovo\.classhub-postgres - it is NOT a Windows service, so Windows
    will not start it for you after a reboot. Run this script once per session
    before `npm run dev`.

    It is idempotent: if the server is already listening on the port it does
    nothing and exits successfully.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\start-local-postgres.ps1
#>

$ErrorActionPreference = 'Stop'

$home_ = Join-Path $env:USERPROFILE '.classhub-postgres'
$exe   = Join-Path $home_ 'bin\postgres.exe'
$data  = Join-Path $home_ 'data'
$port  = 5433

if (-not (Test-Path $exe)) {
    Write-Host "PostgreSQL is not installed at $home_" -ForegroundColor Red
    Write-Host "See README.md > Local database for how to install it, or use"
    Write-Host "'docker compose up db' if you have Docker Desktop."
    exit 1
}

$already = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($already) {
    Write-Host "PostgreSQL already running on port $port." -ForegroundColor Green
    exit 0
}

Write-Host "Starting PostgreSQL on port $port ..."
Start-Process -FilePath $exe `
    -ArgumentList '-D', $data, '-p', $port `
    -WorkingDirectory (Split-Path $exe) `
    -RedirectStandardOutput (Join-Path $home_ 'pg.out') `
    -RedirectStandardError (Join-Path $home_ 'pg.err') `
    -WindowStyle Hidden

for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        Write-Host "PostgreSQL is up on port $port." -ForegroundColor Green
        exit 0
    }
}

Write-Host "PostgreSQL did not start. See $home_\pg.err" -ForegroundColor Red
Get-Content (Join-Path $home_ 'pg.err') -ErrorAction SilentlyContinue | Select-Object -Last 10
exit 1
