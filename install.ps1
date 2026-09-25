# ---------------------------------------------------------------------------
# install.ps1
#
# One-shot installer for the Resource Dashboard. Installs dependencies with
# pnpm, works around the pnpm "ignored build scripts" prompt for esbuild
# (required for Vite to run), verifies the Community Sheet workbook exists,
# and then starts the app (API on :3001, Vite on :5173).
#
# Usage (from the resource-dashboard folder):
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   .\install.ps1              (if your execution policy allows local scripts)
#   .\install.ps1 -NoStart     (install only, don't start the dev servers)
#   .\install.ps1 -Clean       (delete node_modules first for a fresh install)
# ---------------------------------------------------------------------------

param(
  [switch]$NoStart,
  [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Write-Step($msg) { Write-Host "`n== $msg ==" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

Write-Step "Resource Dashboard installer"

# --- 1. Check prerequisites -------------------------------------------------
Write-Step "Checking prerequisites"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js is not installed or not on PATH. Install Node.js 18+ from https://nodejs.org and re-run this script." -ForegroundColor Red
  exit 1
}
Write-Ok "Node.js found: $(node --version)"

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
  Write-Warn "pnpm not found on PATH. Attempting to enable it via corepack..."
  try {
    corepack enable
    corepack prepare pnpm@latest --activate
  } catch {
    Write-Host "Could not enable pnpm automatically. Install it manually: npm install -g pnpm" -ForegroundColor Red
    exit 1
  }
}
Write-Ok "pnpm found: $(pnpm --version)"

# --- 2. Verify the data workbook exists -------------------------------------
Write-Step "Checking for Community Sheet.xlsx"
if (-not (Test-Path (Join-Path $root 'Community Sheet.xlsx'))) {
  Write-Warn "'Community Sheet.xlsx' was not found in the project root."
  Write-Warn "The API server will fail to start until this file is present."
} else {
  Write-Ok "Found Community Sheet.xlsx"
}

# --- 3. Optionally clean node_modules ---------------------------------------
if ($Clean) {
  Write-Step "Removing existing node_modules (Clean requested)"
  Remove-Item -Recurse -Force (Join-Path $root 'node_modules') -ErrorAction SilentlyContinue
  Write-Ok "node_modules removed"
}

# --- 4. Install dependencies -------------------------------------------------
Write-Step "Installing dependencies (pnpm install)"
pnpm install
if ($LASTEXITCODE -ne 0) {
  Write-Host "pnpm install failed. See output above." -ForegroundColor Red
  exit 1
}
Write-Ok "Dependencies installed"

# --- 5. Approve & run native build scripts (esbuild needs this on pnpm) -----
# pnpm blocks postinstall/build scripts by default. esbuild ships a platform
# binary download script that must run, or Vite fails with
# "Cannot find package '...esbuild/index.js'".
Write-Step "Approving and running required native build scripts (esbuild)"
try {
  pnpm approve-builds esbuild
} catch {
  Write-Warn "pnpm approve-builds reported an issue (may already be approved) - continuing"
}
pnpm rebuild esbuild
if ($LASTEXITCODE -ne 0) {
  Write-Warn "pnpm rebuild esbuild reported a non-zero exit - continuing anyway"
}
Write-Ok "Native build scripts complete"

# --- 6. Sanity check: confirm vite/esbuild resolve properly -----------------
Write-Step "Verifying install"
$esbuildBinary = Get-ChildItem -Path (Join-Path $root 'node_modules\.pnpm') -Filter 'esbuild@*' -Directory -ErrorAction SilentlyContinue
if ($esbuildBinary) {
  Write-Ok "esbuild package present"
} else {
  Write-Warn "Could not confirm esbuild install location - if 'pnpm dev' fails, re-run with -Clean"
}

Write-Ok "Install complete!"

# --- 7. Start the app --------------------------------------------------------
if ($NoStart) {
  Write-Host "`nSkipping app start (-NoStart passed). Run 'pnpm dev' or '.\restart.ps1' to start it later." -ForegroundColor Cyan
  exit 0
}

Write-Step "Starting app (pnpm dev)"
Write-Host "API will be at http://localhost:3001, Web app at http://localhost:5173" -ForegroundColor Cyan
pnpm dev
