@echo off
REM DropFile - development quick start (Windows)
REM Starts the DropFile server and the Vite dev server in separate windows.
REM Set DROPFILE_SERVER_DIR if the DropFileServer project is not found automatically.
REM For offline sharing on a local network without internet, use start-dropfile-lan.bat.

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
    echo Could not find the DropFileServer project. Set DROPFILE_SERVER_DIR to its folder.
    pause
    exit /b 1
)

if not exist node_modules call npm install
if not exist "%DROPFILE_SERVER_DIR%\node_modules" (
    pushd "%DROPFILE_SERVER_DIR%"
    call npm install
    popd
)

start "DropFile Server" cmd /k "cd /d ""%DROPFILE_SERVER_DIR%"" && npm run dev"
timeout /t 2 >nul
start "DropFile Frontend" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo.
echo Server:   http://localhost:3001
echo Frontend: http://localhost:9002
echo Other devices on your Wi-Fi can open the frontend using this computer's IP address.
echo.
