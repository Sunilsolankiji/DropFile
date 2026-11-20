#!/usr/bin/env bash
# DropFile - development quick start (Linux/macOS)
# Starts the DropFile server and the Vite dev server. Press Ctrl+C to stop both.
# Set DROPFILE_SERVER_DIR if the DropFileServer project is not found automatically.
# For offline sharing on a local network without internet, use ./start-dropfile-lan.sh.
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org/"
  exit 1
fi

if [ -z "${DROPFILE_SERVER_DIR:-}" ]; then
  for candidate in "../DropFileServer" "../../NodeJS Projects/DropFileServer"; do
    if [ -f "$candidate/package.json" ]; then
      DROPFILE_SERVER_DIR="$(cd "$candidate" && pwd)"
      break
    fi
  done
fi
if [ -z "${DROPFILE_SERVER_DIR:-}" ]; then
  echo "Could not find the DropFileServer project. Set DROPFILE_SERVER_DIR to its folder."
  exit 1
fi

[ -d node_modules ] || npm install
[ -d "$DROPFILE_SERVER_DIR/node_modules" ] || (cd "$DROPFILE_SERVER_DIR" && npm install)

(cd "$DROPFILE_SERVER_DIR" && npm run dev) &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 2

echo ""
echo "Server:   http://localhost:3001"
echo "Frontend: http://localhost:9002"
echo "Other devices on your Wi-Fi can open the frontend using this computer's IP address."
echo ""
npm run dev
