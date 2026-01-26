# DropFile - Instant File Sharing

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/Sunilsolankiji/DropFile)

A modern React + Vite application for instant file sharing via access codes. Share files seamlessly across multiple devices using a Socket.IO backend server.

## ✨ Features

- **Create Spaces**: Generate random access codes or use custom memorable codes
- **Join Spaces**: Enter an access code to join an existing file sharing room
- **Drag & Drop Upload**: Easy file upload with drag-and-drop or file browser
- **Cross-Device Sharing**: Share files between any devices connected to the same backend
- **Real-time Updates**: Files sync instantly across all connected clients via Socket.IO
- **Auto-expiry**: Files automatically expire after a set period
- **QR Code Sharing**: Quickly share room links via QR code for easy mobile access
- **Connection Status**: Visual indicators show backend connection status
- **Peer Visibility**: See how many devices are connected to the room
- **Persistent Device Identity**: Your device name and ID are remembered across sessions

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
- **UI**: React Bootstrap, Bootstrap 5, Lucide Icons
- **Routing**: React Router DOM v6
- **Real-time**: Socket.IO Client
- **Styling**: CSS with Bootstrap theming

## 📝 License

This project is private and not licensed for public use.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
