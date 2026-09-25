# ---------------------------------------------------------------------------
# restart.ps1
#
# Stops any running instance of the Resource Dashboard (API on :3001 and the
# Vite dev server on :5173) and starts a fresh one. Safe to run repeatedly
# after making code changes - it always kills leftover/duplicate processes
# first so you never end up with stale servers answering requests.
#
# Usage (from the resource-dashboard folder, or anywhere - path is resolved
# relative to this script):
#   powershell -ExecutionPolicy Bypass -File .\restart.ps1
#   .\restart.ps1              (if your execution policy allows local scripts)
#   .\restart.ps1 -NoBrowser   (skip auto-opening the browser)
# ---------------------------------------------------------------------------

param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "== Resource Dashboard restart ==" -ForegroundColor Cyan

# --- 1. Stop anything listening on our ports (API 3001, Vite 5173) ---------
function Stop-Port($port) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns | Select-Object -Unique OwningProcess) {
    $procId = $c.OwningProcess
    if ($procId -and $procId -ne 0) {
      Write-Host "  Killing PID $procId (listening on port $port)" -ForegroundColor Yellow
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host "Stopping processes on ports 3001 (API) and 5173 (Vite)..."
Stop-Port 3001
Stop-Port 5173

# --- 2. Stop any leftover PowerShell background jobs from previous runs ----
$jobs = Get-Job -ErrorAction SilentlyContinue
if ($jobs) {
  Write-Host "Stopping $($jobs.Count) leftover background job(s)..."
  $jobs | Stop-Job -ErrorAction SilentlyContinue
  $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
}

# --- 3. Belt-and-braces: kill any remaining node.exe process --------------
# (covers cases where the port lookup missed something, e.g. a hung process)
$nodeProcs = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcs) {
  Write-Host "Force-killing $($nodeProcs.Count) remaining node.exe process(es)..." -ForegroundColor Yellow
  $nodeProcs | Stop-Process -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 800

# --- 4. Start the app (API + Vite together) in a new window ----------------
Write-Host "Starting app (pnpm dev)..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command', "cd '$root'; pnpm dev"
)

# --- 5. Wait for the API to come up, then optionally open the browser ------
$maxWaitSec = 20
$elapsed = 0
$apiUp = $false
while ($elapsed -lt $maxWaitSec) {
  Start-Sleep -Seconds 1
  $elapsed++
  $listening = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
  if ($listening) { $apiUp = $true; break }
}

if ($apiUp) {
  Write-Host "API is up on http://localhost:3001" -ForegroundColor Green
} else {
  Write-Host "API did not come up within $maxWaitSec s - check the new terminal window for errors." -ForegroundColor Red
}

if (-not $NoBrowser) {
  Start-Sleep -Seconds 2
  Start-Process "http://localhost:5173"
}

Write-Host "== Done ==" -ForegroundColor Cyan
