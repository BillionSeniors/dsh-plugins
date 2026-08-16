@echo off
rem Stop DeepSeek Harness (kill the process listening on port 3080)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3080" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>&1
)
echo DeepSeek Harness has been stopped.
pause
