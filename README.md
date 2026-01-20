# DropFile - Instant File Sharing

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/Sunilsolankiji/DropFile)

A React + Vite application for instant file sharing via access codes. Supports local network sharing (same network peers) with Firebase fallback for remote sharing.

## Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project with Firestore and Storage enabled (optional - local sharing works without Firebase)

### Installation

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. (Optional) Copy `.env.example` to `.env` and fill in your Firebase credentials for cloud sharing:

   ```bash
   cp .env.example .env
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

   The app will be available at http://localhost:9002

## Features

- **Create Spaces**: Generate random access codes or use custom codes
- **Join Spaces**: Enter an access code to join an existing room
- **File Sharing**: Drag and drop or browse to upload files
- **Local Network Sharing**: Files are shared directly between peers on the same network using BroadcastChannel
- **Cloud Fallback**: When Firebase is configured, files are also uploaded to the cloud for remote access
- **Real-time Updates**: Files sync across all connected clients
- **Auto-expiry**: Files automatically expire after 15 minutes
- **QR Code Sharing**: Easily share room links via QR code
- **Connection Status**: Visual indicators show whether you're connected locally, via cloud, or both

## How File Sharing Works

1. **Same Browser/Device**: Uses BroadcastChannel API for instant file sharing between tabs
2. **Same Network**: Files are shared peer-to-peer using BroadcastChannel when multiple users join the same room code
3. **Remote/Cloud**: When Firebase is configured, files are also uploaded to Firebase Storage for access from anywhere

The app automatically detects the best connection method and displays the status in the room header.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key (optional) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain (optional) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID (optional) |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket (optional) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID (optional) |
| `VITE_FIREBASE_APP_ID` | Firebase app ID (optional) |

**Note**: Firebase is optional. The app works for local network file sharing without any Firebase configuration.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run typecheck` - Run TypeScript type checking

## Deploying to GitHub Pages

This project includes a GitHub Actions workflow for automatic deployment to GitHub Pages.

### Setup:

1. Push your code to a GitHub repository named `DropFile` (or update the `base` in `vite.config.ts` to match your repo name)

2. Go to your repository **Settings** → **Pages**

3. Under "Build and deployment", select **GitHub Actions** as the source

4. (Optional) Add Firebase secrets in **Settings** → **Secrets and variables** → **Actions**:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

5. Push to the `main` branch - the workflow will automatically build and deploy

Your app will be available at: `https://<username>.github.io/DropFile/`

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Firebase (Firestore & Storage) - Optional
- Radix UI Components
- React Router
- BroadcastChannel API for local sharing
