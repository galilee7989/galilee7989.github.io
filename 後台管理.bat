@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Check if the admin port is already listening; if so, just open the browser.
netstat -ano 2>nul | findstr ":4330" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [!] Port 4330 is already in use - the admin seems to be running already.
  echo     Opening the browser to the existing admin without starting another one.
  start "" http://127.0.0.1:4330/
  pause
  exit /b 0
)
echo 正在啟動禱告信後台管理...
start "" http://127.0.0.1:4330/
node scripts/admin-server.mjs
pause
