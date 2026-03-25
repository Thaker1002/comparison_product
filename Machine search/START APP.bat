@echo off
title MultiSearch App
color 0A
echo.
echo  ============================================
echo    MultiSearch -- Starting App...
echo  ============================================
echo.
echo  [1] Checking Python environment...

cd /d "C:\Users\thake\Downloads\ZED\product_comparision\Machine search"

if not exist ".venv\Scripts\python.exe" (
    echo.
    echo  [ERROR] Virtual environment not found!
    echo  Please run setup.py first.
    echo.
    pause
    exit /b 1
)

echo  [2] Starting MultiSearch server...
echo.
echo  ============================================
echo   App is running at: http://localhost:5000
echo   Open your browser and go to that address.
echo   Press Ctrl+C in this window to stop.
echo  ============================================
echo.

start "" "http://localhost:5000"

.venv\Scripts\python app.py

echo.
echo  App has stopped.
pause
