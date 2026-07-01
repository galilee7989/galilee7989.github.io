@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在啟動禱告信後台管理...
start "" http://127.0.0.1:4330/
node scripts/admin-server.mjs
pause
