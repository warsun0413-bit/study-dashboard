@echo off
cd /d "%~dp0"

echo Starting Study Dashboard...
echo Current folder: %cd%
echo.

if not exist "index.html" (
    echo ERROR: index.html not found.
    echo Please put this file in the same folder as index.html.
    pause
    exit /b 1
)

set PORT=8000
set PYTHON_CMD=

where python >nul 2>nul
if not errorlevel 1 (
    python --version >nul 2>nul
    if not errorlevel 1 set PYTHON_CMD=python
)

if "%PYTHON_CMD%"=="" (
    where py >nul 2>nul
    if not errorlevel 1 (
        py --version >nul 2>nul
        if not errorlevel 1 set PYTHON_CMD=py
    )
)

if "%PYTHON_CMD%"=="" (
    where python3 >nul 2>nul
    if not errorlevel 1 (
        python3 --version >nul 2>nul
        if not errorlevel 1 set PYTHON_CMD=python3
    )
)

if "%PYTHON_CMD%"=="" (
    echo ERROR: Python was not found.
    echo.
    echo You can temporarily open index.html directly.
    echo For PWA desktop app support, install Python and add it to PATH.
    echo.
    pause
    exit /b 1
)

echo Using: %PYTHON_CMD%
echo Open URL: http://localhost:%PORT%
echo Keep this window open while using the dashboard.
echo.

if not exist "server.py" (
    echo ERROR: server.py not found.
    echo Please make sure the DeepSeek local proxy file exists in this folder.
    echo.
    pause
    exit /b 1
)

start "" /b cmd /d /c "timeout /t 1 /nobreak >nul & rundll32 url.dll,FileProtocolHandler http://localhost:%PORT%"

%PYTHON_CMD% server.py

pause
