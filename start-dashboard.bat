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
set API_VERSION=admission-joint-v114
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

if not exist "start-dashboard-preflight.ps1" (
    echo ERROR: start-dashboard-preflight.ps1 not found.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dashboard-preflight.ps1" -ExpectedApiVersion "%API_VERSION%"

if errorlevel 10 if not errorlevel 11 goto OPEN_EXISTING
if errorlevel 12 goto PORT_IN_USE

start "" /b cmd /d /c "timeout /t 1 /nobreak >nul & rundll32 url.dll,FileProtocolHandler http://localhost:%PORT%"

%PYTHON_CMD% server.py

pause
exit /b 0

:OPEN_EXISTING
echo Study Dashboard is already running with the current API version.
start "" rundll32 url.dll,FileProtocolHandler http://localhost:%PORT%
exit /b 0

:PORT_IN_USE
echo ERROR: Port %PORT% is being used by another program.
echo The launcher did not stop that program. Close it manually, then try again.
pause
exit /b 1
