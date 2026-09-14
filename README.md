# DropFile - Instant File Sharing

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/Sunilsolankiji/DropFile)

A modern React + Vite application for instant file sharing via access codes. Share files seamlessly across multiple devices using a Socket.IO backend server.

## ✨ Features

- **Create Rooms**: Start sharing in one click, or expand "Use a custom code" for a memorable code
- **Join Rooms**: Enter an access code to join an existing file sharing room
- **Drag & Drop Upload**: Drop files or use the keyboard-accessible file picker (up to 10 files at a time, 100 MB per file)
- **Cross-Device Sharing**: Share files between any devices connected to the same backend
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

- Node.js 18+
- A running DropFile backend server (Socket.IO based)

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

DropFile uses a client-server architecture with Socket.IO for real-time communication:

```
┌─────────────┐     Socket.IO     ┌─────────────────┐     Socket.IO     ┌─────────────┐
│  Device A   │ ◄───────────────► │  Backend Server │ ◄───────────────► │  Device B   │
│  (Browser)  │                   │   (Node.js)     │                   │  (Browser)  │
└─────────────┘                   └─────────────────┘                   └─────────────┘
```

### File Sharing Flow

1. **Create/Join Room**: Users create or join a room using an access code
2. **Upload File**: Device A uploads a file → sent to backend server
3. **Real-time Sync**: Backend notifies all devices in the room
4. **Download**: Device B can download the file from the backend

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
