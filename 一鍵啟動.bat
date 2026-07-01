@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ============================================
echo    加利利傳道會 一鍵啟動
echo ============================================
where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js，請先安裝 Node.js。
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo 首次執行，安裝相依套件中，請稍候...
  call npm.cmd install
  if errorlevel 1 ( echo 安裝失敗 & pause & exit /b 1 )
)
echo 建置網站中，請稍候（約 10-30 秒）...
call npm.cmd run build
if errorlevel 1 ( echo 建置失敗 & pause & exit /b 1 )
echo 啟動前站與後台管理...
start "加利利-前站" cmd /k "chcp 65001>nul&&set PORT=48732&&node scripts\serve-dist.mjs"
start "加利利-後台管理" cmd /k "chcp 65001>nul&&node scripts\admin-server.mjs"
timeout /t 3 >nul
start "" http://127.0.0.1:48732/
echo.
echo 前站： http://127.0.0.1:48732/
echo 後台： http://127.0.0.1:4330/   （預設密碼 galilee2026）
echo.
echo 前站與後台各自在新視窗執行，關閉請在該視窗按 Ctrl+C。
echo 這個視窗可以直接關閉。
echo.
pause
endlocal
