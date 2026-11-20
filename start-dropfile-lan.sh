#!/usr/bin/env bash
# DropFile - offline local network mode (Linux/macOS)
# Builds the frontend and starts the DropFile server so phones and computers on the
# same Wi-Fi can share files without internet access.
# Set DROPFILE_SERVER_DIR if the DropFileServer project is not found automatically.
set -euo pipefail

cd "$(dirname "$0")"
FRONTEND_DIR="$(pwd)"

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
  echo "Could not find the DropFileServer project."
  echo "Set DROPFILE_SERVER_DIR to its folder, e.g. DROPFILE_SERVER_DIR=/path/to/DropFileServer ./start-dropfile-lan.sh"
  exit 1
fi

[ -d node_modules ] || npm install
echo "Building DropFile for the local network..."
npm run build:lan

cd "$DROPFILE_SERVER_DIR"
[ -d node_modules ] || npm install
WEB_DIST_DIR="$FRONTEND_DIR/dist-lan" npm run lan
