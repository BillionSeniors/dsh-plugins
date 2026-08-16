@echo off
rem DeepSeek Harness launcher (simple & stable)
set "DSH_ROOT=D:\Deepseek_Harness"
set "DSH_HOME=%DSH_ROOT%\data"
set "PATH=%DSH_ROOT%\tools\node;%PATH%"
set "npm_config_cache=%DSH_ROOT%\.caches\npm"
rem API keys for image recognition (dsh-vision-router / Doubao)
set "ARK_API_KEY=你的ARK_API_KEY"
set "ZHIPU_API_KEY=你的ZHIPU_API_KEY"
cd /d "%DSH_ROOT%"

netstat -ano | findstr ":3080" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo DeepSeek Harness is already running: http://127.0.0.1:3080
    start "" http://127.0.0.1:3080
    timeout /t 3 >nul
    exit /b 0
)

echo Starting DeepSeek Harness...
"%DSH_ROOT%\tools\node\node.exe" "%DSH_ROOT%\tools\node\node_modules\@deepseek-ai\dsh\lib\bin.js" web
if errorlevel 1 (
    echo.
    echo Failed to start. See error above. Press any key to close.
    pause >nul
)
