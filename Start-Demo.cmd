@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\phaser\dist\phaser.min.js" (
  echo Installing the local Phaser renderer for the first launch...
  call npm.cmd ci --ignore-scripts --no-audit --no-fund
  if errorlevel 1 (
    echo Installation failed. Please check your connection and try again.
    pause
    exit /b 1
  )
)
echo AI Town demo: http://127.0.0.1:4173
echo Keep this window open. Press Ctrl+C to stop.
start "" "http://127.0.0.1:4173"
node server.mjs
pause
