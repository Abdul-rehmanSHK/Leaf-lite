@echo off
echo ========================================================
echo   Starting LeafLite Studio (Backend :8000 + Frontend :3000)
echo ========================================================
echo Launching services and waiting for startup...
start /b "" powershell -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:3000'"
npm run dev
pause
