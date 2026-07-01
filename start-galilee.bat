@echo off
setlocal

set "PORT=48732"
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo Galilee static site launcher
echo Project: %ROOT%
echo URL: http://127.0.0.1:%PORT%/
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

echo Building static site...
call npm.cmd run build
if errorlevel 1 (
  echo ERROR: build failed.
  pause
  exit /b 1
)

echo.
echo Serving at http://127.0.0.1:%PORT%/
echo Press Ctrl+C to stop the server.
echo.

node scripts\serve-dist.mjs

endlocal
