@echo off
setlocal EnableDelayedExpansion
title Thaker's Quest — Starting Up...
color 0B

echo.
echo  ========================================
echo    Thaker's Quest Thailand
echo    Smart Product Price Comparison
echo  ========================================
echo.

:: ── Check Node.js ─────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    :: Try the default install path
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else (
        echo  [ERROR] Node.js not found.
        echo  Please install Node.js from https://nodejs.org
        echo.
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%v in ('node --version 2^>^&1') do set NODE_VER=%%v
echo  Node.js: %NODE_VER%   npm:
for /f "tokens=*" %%v in ('npm --version 2^>^&1') do echo            %%v

echo.

:: ── Kill anything already on ports 3001 / 5173 ────────────────────────────
echo  Checking for stale processes on ports 3001 and 5173...

for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr /R ":3001 " ^| findstr LISTENING') do (
    if not "%%p"=="" (
        echo  Stopping old backend  ^(PID %%p^)...
        taskkill /PID %%p /F >nul 2>&1
    )
)

for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr /R ":5173 " ^| findstr LISTENING') do (
    if not "%%p"=="" (
        echo  Stopping old frontend ^(PID %%p^)...
        taskkill /PID %%p /F >nul 2>&1
    )
)

:: Small wait to let ports free up
timeout /t 1 /nobreak >nul

:: ── Install dependencies if needed ────────────────────────────────────────
if not exist "%~dp0backend\node_modules" (
    echo  Installing backend dependencies...
    pushd "%~dp0backend"
    call npm install
    popd
)

if not exist "%~dp0frontend\node_modules" (
    echo  Installing frontend dependencies...
    pushd "%~dp0frontend"
    call npm install
    popd
)

:: ── Check .env exists ─────────────────────────────────────────────────────
if not exist "%~dp0backend\.env" (
    echo.
    echo  [WARNING] backend\.env not found!
    echo  Copy backend\.env.example to backend\.env
    echo  and fill in your FIRECRAWL_API_KEY.
    echo.
    pause
    exit /b 1
)

echo.
echo  Starting servers...
echo.

:: ── Launch backend in its own window ──────────────────────────────────────
start "Thaker's Quest — BACKEND (port 3001)" /D "%~dp0backend" cmd /k "set PATH=C:\Program Files\nodejs;%PATH% && echo [BACKEND] Starting on port 3001... && node src/index.js"

:: Short pause so backend can bind before frontend starts
timeout /t 2 /nobreak >nul

:: ── Launch frontend in its own window ─────────────────────────────────────
start "Thaker's Quest — FRONTEND (port 5173)" /D "%~dp0frontend" cmd /k "set PATH=C:\Program Files\nodejs;%PATH% && echo [FRONTEND] Starting Vite dev server... && npm run dev"

:: Wait for frontend to be ready
timeout /t 4 /nobreak >nul

:: ── Open browser ──────────────────────────────────────────────────────────
echo.
echo  ========================================
echo    Both servers are running!
echo  ========================================
echo.
echo    Frontend : http://localhost:5173
echo    Backend  : http://localhost:3001
echo    Health   : http://localhost:3001/health
echo.
echo  Opening browser...
start "" "http://localhost:5173"

echo.
echo  This window can be closed.
echo  The servers run in their own cmd windows.
echo  Close those windows to stop the servers.
echo.
pause
