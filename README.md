# DropFile - Instant File Sharing

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/Sunilsolankiji/DropFile)

A React + Vite application for file sharing via access codes. Socket.IO manages rooms and transfer sessions; file bytes travel through an HTTP chunk relay.

## ✨ Features

- **Create Rooms**: Start sharing in one click, or expand "Use a custom code" for a memorable code
- **Join Rooms**: Enter an access code to join an existing file sharing room
- **Drag & Drop Upload**: Drop files or use the keyboard-accessible file picker (up to 10 files at a time, 2 GB per file)
- **Cross-Device Sharing**: Share files between any devices connected to the same backend
- **Resumable Transfers**: Chunk progress, pause/resume, cancellation, and durable receiver storage
- **Real-time Updates**: Files sync instantly across all connected clients via Socket.IO
- **Auto-expiry**: Files automatically expire after a set period
- **QR Code Sharing**: Open "Share room" to copy a code/link or scan a locally generated QR code; room links are not sent to a QR service
- **Connection Status**: Visual indicators show backend connection status
- **Peer Visibility**: See how many devices are connected to the room
- **Persistent Device Identity**: Your device name and ID are remembered across sessions
- **Room Chat**: Share links and notes in a side panel on desktop or a full-width panel on mobile, without losing your draft when closing it
- **Accessible Interactions**: Clear focus indicators, labeled controls, reduced-motion support, and a responsive file-first layout

## 🚀 Getting Started

### Prerequisites

- Node.js 20.19+ (22 LTS recommended)
- A running DropFile backend implementing the chunk-relay protocol (Socket.IO plus HTTP)
- A browser with IndexedDB enabled and enough local storage for received files

### Installation

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/Sunilsolankiji/DropFile.git
   cd DropFile
   npm install
   ```

2. Configure the backend URL:

   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local` and set your backend server URL:

   ```env
   VITE_BACKEND_URL=http://localhost:3001
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

   The app will be available at http://localhost:9002

### Quick Start (Windows)

Double-click `start-dropfile.bat` to start the development server.

### Quick Start (Linux/Mac)

```bash
chmod +x start-dropfile.sh
./start-dropfile.sh
```

## 🔧 How It Works

### Architecture

DropFile uses Socket.IO for room membership, presence, chat, metadata, and transfer control.
Raw file chunks use HTTP POST/GET with the device's `x-peer-id` header; no whole-file binary or base64 payload travels over Socket.IO.

```
┌─────────────┐     Socket.IO     ┌─────────────────┐     Socket.IO     ┌─────────────┐
│  Device A   │ ◄───────────────► │  Backend Server │ ◄───────────────► │  Device B   │
│  (Browser)  │                   │   (Node.js)     │                   │  (Browser)  │
└─────────────┘                   └─────────────────┘                   └─────────────┘
```

### File Sharing Flow

1. **Create/Join Room**: Users create or join a room using an access code
2. **Create a Share**: Device A sends metadata with `add-file` and accepts the backend's negotiated chunk size (1 MB requested by default).
   Files without a browser-provided MIME type use `application/octet-stream`.
3. **Upload Chunks**: The sender slices the file and uploads raw chunks, with at most four HTTP requests active per browser transfer manager.
4. **Receive Chunks**: Each downloading device uses `start-transfer`, saves each received chunk in IndexedDB, then sends `ack-transfer-chunk`. Multiple room members can download the same file at the same time; every receiver progresses independently.
5. **Finish**: After all chunks are present and acknowledged, the receiver assembles the file in chunk-index order and hands it to the browser's download manager.

### Transfer controls and recovery

Both devices should remain in the room until the transfer finishes. The backend is an online relay, not permanent file storage.
Sender-offline states stop requests and display an error. Local IndexedDB data does not guarantee that the backend session remains available; recovery requires a valid server snapshot, otherwise share the file again.
Sender and receiver progress are shown independently, and one receiver's download never blocks another's. Pause stops local requests without cancelling the session; Cancel stops the session for both devices.
Offline cancellation stops local work immediately and is sent to the backend after reconnection.
Removing a share, expiry, cancellation, or a sender timeout stops its workers and clears associated stored transfer data.

Receiver chunks and session metadata survive refresh in IndexedDB. The sender's original `File` stays in memory, not IndexedDB:
after refresh, choose the original unchanged file if chunks still need uploading. The client checks file metadata and stored SHA-256 chunk fingerprints before continuing.
Pauses survive refresh. Integrity/storage errors are visible; the app does not silently fall back to volatile storage or acknowledge unpersisted chunks.
If acknowledged chunks have been cleared from the browser, a new share is required because the relay may already have discarded them.
Download completion means handoff to the browser, not confirmation that the user saved the file to disk.

`start-transfer` and `get-transfer-state` supply authoritative **index arrays** for uploaded/acknowledged chunks.
Live `transfer-updated` notifications supply **counts**, used only for display; counts and the ambiguous `chunkIndex` field are never treated as an index list.
Reconnect/resume queries a fresh snapshot, keeps locally stored receiver chunks, re-acknowledges unconfirmed durable chunks, and transfers only the missing indexes.
HTTP 409 upload backpressure and 404 unavailable download chunks wait with capped delays; transient HTTP/network failures use bounded exponential retries.
Non-retryable errors stop the transfer with a visible reason.

### Backend deployment requirements

Default backend limits are 2 GB per file (2,147,483,648 bytes), 1 MB chunks (4 MB maximum),
8 in-flight chunks, a 64 MB relay buffer, and a 60-minute lifetime.
The frontend keeps a four-request window and uses the backend's returned chunk layout and `expiresAt`,
not a locally assumed expiry. Large downloads require sufficient browser storage and memory for final Blob assembly.

The HTTP chunk endpoints must be reachable at the configured backend origin. Returned URL templates may use `{transferId}` / `{chunkIndex}` or `:transferId` / `:chunkIndex`.
Cross-origin chunk destinations and redirects are rejected. For a frontend on another origin, configure backend CORS to allow that frontend,
POST/GET, `Content-Type`, `x-peer-id`, and `x-chunk-hash`, and expose `X-Chunk-Hash` and `Retry-After`.
Chunk hashes, when provided, are SHA-256 hexadecimal digests. Use HTTPS for deployments served over HTTPS to avoid mixed-content blocking.
The old Socket.IO full-file protocol is not supported by this frontend.

Use **Share room** for the room code, link, QR code, and device renaming on any screen size.
**Chat** opens separately from your files and shows an unread indicator for incoming messages.
Press **Ctrl+Enter** (or **Cmd+Enter**) to send a message; Enter adds a new line.
Files display their remaining availability, and removing your own file requires confirmation.
Connection and action failures are shown explicitly; unsuccessful chat sends keep your draft.
Outgoing messages use a clock while sending, a check when accepted, and a warning with a Retry action on failure.
Retry resends the existing message without adding another chat bubble; delivery and read receipts are not tracked.
Web addresses in chat are clickable and open in a new tab. Message text and line breaks are preserved.

### Cross-Device Sharing

Works across:
- ✅ Different computers on the same network
- ✅ Phone and computer
- ✅ Any devices with internet access to the backend

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_BACKEND_URL` | Backend server URL | `http://localhost:3001` |

## 📁 Project Structure

```
DropFile/
├── src/
│   ├── components/       # React components
│   │   ├── HomePage.tsx      # Landing page with create/join room
│   │   ├── RoomPage.tsx      # File sharing room interface
│   │   ├── FileUpload.tsx    # Drag & drop file upload
│   │   ├── FileList.tsx      # List of shared files
│   │   ├── AppHeader.tsx     # Shared navigation and branding
│   │   ├── ChatPanel.tsx     # Room messages and composer
│   │   ├── ShareRoomModal.tsx # Code, local QR, and device identity
│   │   └── ...
│   ├── hooks/            # Custom React hooks
│   │   ├── use-backend-room.ts   # Room state management
│   │   └── use-toast.ts          # Toast notifications
│   ├── lib/              # Utilities and services
│   │   ├── network-peer-service.ts  # Socket.IO client
│   │   ├── transfer-manager.ts      # Chunk workers, retries, resume, and lifecycle
│   │   ├── transfer-storage.ts      # IndexedDB session and received chunk storage
│   │   ├── transfer-types.ts        # Shared relay protocol and client state
│   │   └── utils.ts                 # Helper functions
│   ├── App.tsx           # Main app with routing
│   └── main.tsx          # Entry point
├── public/               # Static assets
├── docs/                 # Documentation
└── package.json
```

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 9002 |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run test:transfers` | Run relay protocol and transfer lifecycle regression tests |

## 🎨 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI**: React Bootstrap, Bootstrap 5, Lucide Icons, locally generated QR codes
- **Routing**: React Router DOM v6
- **Real-time**: Socket.IO Client
- **Styling**: Token-based CSS with Bootstrap theming, system fonts, and reduced-motion support

## 📝 License

This project is private and not licensed for public use.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
