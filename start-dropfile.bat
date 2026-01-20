@echo off
REM DropFile - Quick Start Script for Windows

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║          DropFile - Backend Setup & Start              ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ✗ Node.js is not installed or not in PATH
    echo   Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo ✓ Node.js found:
node --version
echo.

REM Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ✗ npm is not installed or not in PATH
    pause
    exit /b 1
)

echo ✓ npm found:
npm --version
echo.

REM Install backend dependencies
echo ╔════════════════════════════════════════════════════════╗
echo ║         Installing Backend Dependencies...             ║
echo ╚════════════════════════════════════════════════════════╝
echo.

cd server
if not exist node_modules (
    echo Installing packages...
    call npm install
    if %errorlevel% neq 0 (
        echo ✗ Failed to install backend dependencies
        pause
        exit /b 1
    )
) else (
    echo ✓ Backend dependencies already installed
)
echo.

REM Install frontend dependencies
echo ╔════════════════════════════════════════════════════════╗
echo ║         Installing Frontend Dependencies...            ║
echo ╚════════════════════════════════════════════════════════╝
echo.

cd ..
if not exist node_modules (
    echo Installing packages...
    call npm install
    if %errorlevel% neq 0 (
        echo ✗ Failed to install frontend dependencies
        pause
        exit /b 1
    )
) else (
    echo ✓ Frontend dependencies already installed
)
echo.

REM Start both servers
echo ╔════════════════════════════════════════════════════════╗
echo ║              Starting Servers...                        ║
echo ╚════════════════════════════════════════════════════════╝
echo.
echo Starting Backend Server...
echo Starting Frontend Server...
echo.

REM Open two command windows - one for backend, one for frontend
start "DropFile Backend Server" cmd /k "cd server && npm run dev"
timeout /t 2

start "DropFile Frontend Development" cmd /k "npm run dev"

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║             Servers Started!                            ║
echo ╠════════════════════════════════════════════════════════╣
echo ║ Backend:   http://localhost:3001                        ║
echo ║ Frontend:  http://localhost:5173                        ║
echo ║ Health:    http://localhost:3001/health               ║
echo ╠════════════════════════════════════════════════════════╣
echo ║ Note: Check the local IP from backend output for       ║
echo ║ multi-device testing on your network.                  ║
echo ║                                                         ║
echo ║ Example: http://192.168.1.100:3001                     ║
echo ╚════════════════════════════════════════════════════════╝
echo.

pause

