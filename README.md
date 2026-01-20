# DropFile - Instant File Sharing

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/Sunilsolankiji/DropFile)

A React + Vite application for instant file sharing via access codes. Share files across multiple devices on the same network using Firebase.

## Getting Started

### Prerequisites

- Node.js 18+
- **A Firebase project with Firestore and Storage enabled (REQUIRED for cross-device sharing)**

### Installation

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. **Copy `.env.example` to `.env` and fill in your Firebase credentials:**

   ```bash
   cp .env.example .env
   ```

   ⚠️ **Firebase is required for sharing files between different devices.** Without Firebase, file sharing only works between tabs in the same browser.

3. Start the development server:

   ```bash
   npm run dev
   ```

   The app will be available at http://localhost:9002

## Features

- **Create Spaces**: Generate random access codes or use custom codes
- **Join Spaces**: Enter an access code to join an existing room
- **File Sharing**: Drag and drop or browse to upload files
- **Cross-Device Sharing**: Share files between any devices using the same room code (requires Firebase)
- **Same-Browser Sharing**: Instant file sharing between browser tabs (no Firebase needed)
- **Real-time Updates**: Files sync across all connected clients via Firebase
- **Auto-expiry**: Files automatically expire after 15 minutes
- **QR Code Sharing**: Easily share room links via QR code
- **Connection Status**: Visual indicators show connection type

## How File Sharing Works

### Cross-Device Sharing (Multiple Computers/Phones on Same Network)

**Requires Firebase configuration.** Here's how it works:

1. Device A uploads a file → File is stored in Firebase Storage
2. Firebase Firestore notifies all devices in the same room
3. Device B sees the file and can download it from Firebase Storage

This works across:
- ✅ Different computers on the same WiFi
- ✅ Phone and computer on the same network
- ✅ Any devices anywhere in the world (with internet)

### Same-Browser Sharing (Multiple Tabs)

Uses BroadcastChannel API for instant, no-server communication:
- ✅ Works without Firebase
- ✅ Instant file transfer between tabs
- ❌ Does NOT work across different browsers/devices

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_FIREBASE_API_KEY` | Firebase API key | Yes* |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Yes* |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | Yes* |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Yes* |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | Yes* |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | Yes* |

*Required for cross-device file sharing. Without Firebase, only same-browser tab sharing works.

## Setting Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Firestore Database** (start in test mode for development)
4. Enable **Storage** (start in test mode for development)
5. Go to Project Settings → General → Your apps → Add web app
6. Copy the config values to your `.env` file
