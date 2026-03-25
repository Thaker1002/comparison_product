# Thaker's Quest Thailand - Startup Script
# Runs both backend (port 3001) and frontend (port 5173) concurrently
# Safe to run multiple times - kills any stale listeners first

$NodePath = "C:\Program Files\nodejs"
$env:PATH = "$NodePath;" + $env:PATH

$RootDir = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Thaker's Quest Thailand" -ForegroundColor Cyan
Write-Host "  Smart Product Price Comparison" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Check Node.js ─────────────────────────────────────────────────────────────
try {
    $nodeVersion = & "$NodePath\node.exe" --version 2>&1
    $npmVersion  = & "$NodePath\npm.cmd"  --version 2>&1
    Write-Host "  Node.js : $nodeVersion" -ForegroundColor Green
    Write-Host "  npm     : $npmVersion"  -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Node.js not found at $NodePath" -ForegroundColor Red
    Write-Host "  Please install Node.js from https://nodejs.org" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# ── Kill stale listeners on ports 3001 and 5173 ───────────────────────────────
Write-Host "  Checking for stale processes..." -ForegroundColor DarkGray

foreach ($port in @(3001, 5173)) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $conns) {
            $procId = $conn.OwningProcess
            if ($procId -and $procId -ne 0) {
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "  Stopping $($proc.Name) (PID $procId) on port $port..." -ForegroundColor Yellow
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } catch { }
}

# Give OS a moment to release the ports
Start-Sleep -Seconds 1

Write-Host "  Ports cleared." -ForegroundColor DarkGray
Write-Host ""

# ── Check .env exists ─────────────────────────────────────────────────────────
if (-not (Test-Path "$RootDir\backend\.env")) {
    Write-Host "  ERROR: backend\.env not found!" -ForegroundColor Red
    Write-Host "  Copy backend\.env.example to backend\.env" -ForegroundColor Yellow
    Write-Host "  and set your FIRECRAWL_API_KEY." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Install dependencies if needed ────────────────────────────────────────────
if (-not (Test-Path "$RootDir\backend\node_modules")) {
    Write-Host "  Installing backend dependencies..." -ForegroundColor Yellow
    & "$NodePath\npm.cmd" install --prefix "$RootDir\backend"
}

if (-not (Test-Path "$RootDir\frontend\node_modules")) {
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Yellow
    & "$NodePath\npm.cmd" install --prefix "$RootDir\frontend"
}

# ── Launch backend ─────────────────────────────────────────────────────────────
Write-Host "  Starting Backend  -> http://localhost:3001 ..." -ForegroundColor Magenta

$backendCmd = (
    "`$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; " +
    "Write-Host '' ; " +
    "Write-Host '  [BACKEND] Thaker''s Quest API — port 3001' -ForegroundColor Magenta; " +
    "Write-Host '' ; " +
    "Set-Location '$RootDir\backend'; " +
    "& 'C:\Program Files\nodejs\node.exe' src/index.js"
)
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal

# Give backend time to bind before starting frontend
Start-Sleep -Seconds 2

# ── Launch frontend ────────────────────────────────────────────────────────────
Write-Host "  Starting Frontend -> http://localhost:5173 ..." -ForegroundColor Cyan

$frontendCmd = (
    "`$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; " +
    "Write-Host '' ; " +
    "Write-Host '  [FRONTEND] Thaker''s Quest UI — port 5173' -ForegroundColor Cyan; " +
    "Write-Host '' ; " +
    "Set-Location '$RootDir\frontend'; " +
    "& 'C:\Program Files\nodejs\npm.cmd' run dev"
)
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal

# Wait for Vite to boot
Start-Sleep -Seconds 4

# ── Summary ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Both servers are running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend : http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend  : http://localhost:3001" -ForegroundColor Magenta
Write-Host "  Health   : http://localhost:3001/health" -ForegroundColor DarkGray
Write-Host "  Markets  : http://localhost:3001/api/marketplaces" -ForegroundColor DarkGray
Write-Host ""

# ── Open browser ───────────────────────────────────────────────────────────────
try {
    Start-Process "http://localhost:5173"
    Write-Host "  Browser opened automatically!" -ForegroundColor Green
} catch {
    Write-Host "  Open your browser to http://localhost:5173" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Firecrawl API  : (configured in backend\.env)" -ForegroundColor DarkGray
Write-Host "  Close the backend/frontend windows to stop the servers." -ForegroundColor DarkGray
Write-Host ""
