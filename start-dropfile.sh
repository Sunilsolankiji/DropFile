#!/bin/bash

# DropFile - Quick Start Script for Mac/Linux

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║          DropFile - Backend Setup & Start              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "✗ Node.js is not installed"
    echo "  Please install from https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js found:"
node --version
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "✗ npm is not installed"
    exit 1
fi

echo "✓ npm found:"
npm --version
echo ""

# Install backend dependencies
echo "╔════════════════════════════════════════════════════════╗"
echo "║         Installing Backend Dependencies...             ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

cd server

if [ ! -d "node_modules" ]; then
    echo "Installing packages..."
    npm install
    if [ $? -ne 0 ]; then
        echo "✗ Failed to install backend dependencies"
        exit 1
    fi
else
    echo "✓ Backend dependencies already installed"
fi
echo ""

# Install frontend dependencies
echo "╔════════════════════════════════════════════════════════╗"
echo "║         Installing Frontend Dependencies...            ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

cd ..

if [ ! -d "node_modules" ]; then
    echo "Installing packages..."
    npm install
    if [ $? -ne 0 ]; then
        echo "✗ Failed to install frontend dependencies"
        exit 1
    fi
else
    echo "✓ Frontend dependencies already installed"
fi
echo ""

# Start both servers
echo "╔════════════════════════════════════════════════════════╗"
echo "║              Starting Servers...                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Start backend in background
(cd server && npm run dev) &
BACKEND_PID=$!

# Give backend time to start
sleep 2

# Start frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║             Servers Started!                            ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║ Backend:   http://localhost:3001                        ║"
echo "║ Frontend:  http://localhost:5173                        ║"
echo "║ Health:    http://localhost:3001/health               ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║ Note: Check the local IP from backend output for       ║"
echo "║ multi-device testing on your network.                  ║"
echo "║                                                         ║"
echo "║ Example: http://192.168.1.100:3001                     ║"
echo "║                                                         ║"
echo "║ Press Ctrl+C to stop both servers                      ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID

