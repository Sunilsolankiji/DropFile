@echo off
REM DropFile - offline local network mode (Windows)
REM Builds the frontend and starts the DropFile server so phones and computers on the
REM same Wi-Fi can share files without internet access.
REM Set DROPFILE_SERVER_DIR if the DropFileServer project is not found automatically.

setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js is not installed or not in PATH. Install it from https://nodejs.org/
    pause
    exit /b 1
)

if not defined DROPFILE_SERVER_DIR if exist "%~dp0..\DropFileServer\package.json" set "DROPFILE_SERVER_DIR=%~dp0..\DropFileServer"
if not defined DROPFILE_SERVER_DIR if exist "%~dp0..\..\NodeJS Projects\DropFileServer\package.json" set "DROPFILE_SERVER_DIR=%~dp0..\..\NodeJS Projects\DropFileServer"
if not defined DROPFILE_SERVER_DIR (
    echo Could not find the DropFileServer project.
    echo Set DROPFILE_SERVER_DIR to its folder, for example:
    echo   set DROPFILE_SERVER_DIR=C:\path\to\DropFileServer
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing frontend dependencies...
    call npm install
    if errorlevel 1 goto :failed
)

echo Building DropFile for the local network...
call npm run build:lan
if errorlevel 1 goto :failed

set "WEB_DIST_DIR=%~dp0dist-lan"
pushd "%DROPFILE_SERVER_DIR%"
if not exist node_modules (
    echo Installing server dependencies...
    call npm install
    if errorlevel 1 (
        popd
        goto :failed
    )
)
call npm run lan
popd
exit /b 0

:failed
echo Setup failed. See the messages above.
pause
exit /b 1
