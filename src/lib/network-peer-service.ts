/**
 * Network Peer Service - Socket.IO Backend Integration
 *
 * This service communicates with a Node.js backend server for true
 * cross-device file sharing over local network/WiFi.
 */

import io, { Socket } from 'socket.io-client';

export interface NetworkPeer {
  id: string;
  name: string;
  lastSeen: number;
  ip?: string;
  joinedAt?: number;
  isActive?: boolean;
}

export interface NetworkFile {
  id: string;
  name: string;
  size: number;
  type: string;
  peerId: string;
  peerName: string;
  expiresAt: number;
  uploadedAt?: number;
}

export interface SharedTextMessage {
  id: string;
  text: string;
  peerId: string;
  peerName: string;
  createdAt: number;
}

export interface ServerInfo {
  ip: string;
  port: number;
}

const HEARTBEAT_INTERVAL = 5000; // 5 seconds

export class NetworkPeerService {
  private socket: Socket | null = null;
  private peerId: string;
  private peerName: string;
  private roomCode: string;
  private serverUrl: string;
  private peers: Map<string, NetworkPeer> = new Map();
  private files: Map<string, NetworkFile> = new Map();
  private texts: Map<string, SharedTextMessage> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private processedPeerIds: Set<string> = new Set(); // Track processed peer-joined events

  private onPeersChanged: (peers: NetworkPeer[]) => void;
  private onFilesChanged: (files: NetworkFile[]) => void;
  private onTextsChanged: (texts: SharedTextMessage[]) => void;
  private onPeerJoined: (peer: NetworkPeer) => void;
  private onPeerLeft: (peerId: string) => void;
  private onFileAdded: (file: NetworkFile) => void;
  private onFileRemoved: (fileId: string) => void;
  private onTextAdded: (text: SharedTextMessage) => void;

  constructor(
    serverUrl: string,
    roomCode: string,
    peerName: string,
    callbacks: {
      onPeersChanged: (peers: NetworkPeer[]) => void;
      onFilesChanged: (files: NetworkFile[]) => void;
      onTextsChanged?: (texts: SharedTextMessage[]) => void;
      onPeerJoined?: (peer: NetworkPeer) => void;
      onPeerLeft?: (peerId: string) => void;
      onFileAdded?: (file: NetworkFile) => void;
      onFileRemoved?: (fileId: string) => void;
      onTextAdded?: (text: SharedTextMessage) => void;
    },
    peerId?: string
  ) {
    this.peerId = peerId || this.generatePeerId();
    this.peerName = peerName || `Device ${this.peerId.slice(0, 6)}`;
    this.roomCode = roomCode;
    this.serverUrl = serverUrl;

    this.onPeersChanged = callbacks.onPeersChanged;
    this.onFilesChanged = callbacks.onFilesChanged;
    this.onTextsChanged = callbacks.onTextsChanged || (() => {});
    this.onPeerJoined = callbacks.onPeerJoined || (() => {});
    this.onPeerLeft = callbacks.onPeerLeft || (() => {});
    this.onFileAdded = callbacks.onFileAdded || (() => {});
    this.onFileRemoved = callbacks.onFileRemoved || (() => {});
    this.onTextAdded = callbacks.onTextAdded || (() => {});
  }

  private generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  updatePeerName(name: string): void {
    this.peerName = name;
    if (!this.socket) return;

    this.socket.emit('update-peer-name', {
      roomCode: this.roomCode,
      peerId: this.peerId,
      peerName: name
    });
  }

  /**
   * Connect to the backend server
   */
  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.socket = io(this.serverUrl, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
          transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
          console.log(`Connected to server at ${this.serverUrl}`);
          this.joinRoom();
          this.setupHeartbeat();
          resolve(true);
        });

        this.socket.on('connect_error', (error) => {
          console.error('Connection error:', error);
        });

        this.socket.on('disconnect', () => {
          console.log('Disconnected from server');
          this.cleanup();
        });

        this.setupEventListeners();
      } catch (error) {
        console.error('Failed to connect:', error);
        resolve(false);
      }
    });
  }

  /**
   * Join a room on the backend
   */
  private joinRoom(): void {
    if (!this.socket) return;

    this.socket.emit(
      'join-room',
      {
        roomCode: this.roomCode,
        peerName: this.peerName,
        peerId: this.peerId
      },
      (response: any) => {
        if (response.success) {
          console.log(`Joined room ${this.roomCode}`);

          // Clear peers first to prevent duplicates
          this.peers.clear();

          // Add ourselves to the peers list first
          this.peers.set(this.peerId, {
            id: this.peerId,
            name: this.peerName,
            lastSeen: Date.now(),
            joinedAt: Date.now(),
            isActive: true
          });

          // Update peers and files from server
          if (response.peers) {
            response.peers.forEach((peer: NetworkPeer) => {
              // Don't add ourselves again
              if (peer.id !== this.peerId) {
                this.peers.set(peer.id, peer);
              }
            });
          }

          // Notify about current peer list
          this.onPeersChanged(Array.from(this.peers.values()));

          if (response.files) {
            this.files.clear();
            response.files.forEach((file: NetworkFile) => {
              this.files.set(file.id, file);
            });
            this.onFilesChanged(Array.from(this.files.values()));
          }

          if (response.texts) {
            this.texts.clear();
            response.texts.forEach((text: SharedTextMessage) => {
              this.texts.set(text.id, text);
            });
            this.onTextsChanged(Array.from(this.texts.values()));
          }
        } else {
          console.error('Failed to join room:', response.error);
        }
      }
    );
  }

  /**
   * Setup Socket.IO event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Peer joined
    this.socket.on('peer-joined', (peer: NetworkPeer) => {
      // Don't add ourselves to the peer list
      if (peer.id === this.peerId) {
        console.log(`Ignoring own peer-joined event`);
        return;
      }

      // Skip if we've already processed this peer join event
      if (this.processedPeerIds.has(peer.id)) {
        console.log(`Already processed peer-joined for ${peer.name}, skipping`);
        return;
      }

      // Mark this peer as processed
      this.processedPeerIds.add(peer.id);

      console.log(`Peer joined: ${peer.name}`);
      this.peers.set(peer.id, peer);
      this.onPeerJoined(peer);
      this.onPeersChanged(Array.from(this.peers.values()));
    });

    // Peer left
    this.socket.on('peer-left', ({ peerId }: { peerId: string }) => {
      console.log(`Peer left: ${peerId}`);
      this.peers.delete(peerId);
      this.onPeerLeft(peerId);
      this.onPeersChanged(Array.from(this.peers.values()));
    });

    this.socket.on('peer-updated', (peer: NetworkPeer) => {
      console.log('peer-updated received', peer);
      this.peers.set(peer.id, peer);
      this.onPeersChanged(Array.from(this.peers.values()));
    });

    // File added
    this.socket.on('file-added', (file: NetworkFile) => {
      console.log(`File available: ${file.name}`);
      this.files.set(file.id, file);
      this.onFileAdded(file);
      this.onFilesChanged(Array.from(this.files.values()));
    });

    // File removed
    this.socket.on('file-removed', ({ fileId }: { fileId: string }) => {
      console.log(`File removed: ${fileId}`);
      this.files.delete(fileId);
      this.onFileRemoved(fileId);
      this.onFilesChanged(Array.from(this.files.values()));
    });

    this.socket.on('text-added', (text: SharedTextMessage) => {
      console.log('text-added received', text);
      this.texts.set(text.id, text);
      this.onTextAdded(text);
    });
  }

  /**
   * Setup heartbeat to keep connection alive
   */
  private setupHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('heartbeat', {
          peerId: this.peerId,
          roomCode: this.roomCode
        });
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Add a file to share
   */
  async addFile(file: File, onProgress?: (progress: number) => void): Promise<NetworkFile | null> {
    if (!this.socket) {
      console.error('Not connected to server');
      return null;
    }

    return new Promise((resolve) => {
      try {
        const fileId = this.generateFileId();

        // Convert file to base64
        const reader = new FileReader();

        reader.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            const progress = Math.round((e.loaded / e.total) * 50); // 0-50% for reading
            onProgress(progress);
          }
        };

        reader.onload = (e) => {
          const base64Data = e.target?.result as string;

          // 50% done with reading, now uploading
          if (onProgress) onProgress(50);

          this.socket!.emit(
            'add-file',
            {
              roomCode: this.roomCode,
              file: {
                id: fileId,
                name: file.name,
                size: file.size,
                type: file.type,
                data: base64Data
              },
              peerId: this.peerId,
              peerName: this.peerName
            },
            (response: any) => {
              if (response.success) {
                if (onProgress) onProgress(100);

                const networkFile: NetworkFile = {
                  id: fileId,
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  peerId: this.peerId,
                  peerName: this.peerName,
                  expiresAt: response.expiresAt,
                  uploadedAt: Date.now()
                };

                this.files.set(fileId, networkFile);
                console.log(`File uploaded: ${file.name}`);
                resolve(networkFile);
              } else {
                console.error('Failed to add file:', response.error);
                resolve(null);
              }
            }
          );
        };

        reader.onerror = () => {
          console.error('Failed to read file');
          resolve(null);
        };

        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Error adding file:', error);
        resolve(null);
      }
    });
  }

  /**
   * Download a file
   */
  async downloadFile(fileId: string): Promise<Blob | null> {
    if (!this.socket) {
      console.error('Not connected to server');
      return null;
    }

    return new Promise((resolve) => {
      this.socket!.emit('download-file', { fileId }, (response: any) => {
        if (response.success && response.file) {
          try {
            // Convert base64 back to blob
            const base64Data = response.file.data.split(',')[1] || response.file.data;
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);

            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            const blob = new Blob([bytes], { type: response.file.type });
            console.log(`File downloaded: ${response.file.name}`);
            resolve(blob);
          } catch (error) {
            console.error('Error processing file:', error);
            resolve(null);
          }
        } else {
          console.error('Failed to download file:', response.error);
          resolve(null);
        }
      });
    });
  }

  /**
   * Remove a file from sharing
   */
  removeFile(fileId: string): void {
    if (!this.socket) return;

    this.socket.emit(
      'remove-file',
      {
        fileId,
        roomCode: this.roomCode
      },
      (response: any) => {
        if (response.success) {
          this.files.delete(fileId);
          console.log(`File removed: ${fileId}`);
        } else {
          console.error('Failed to remove file:', response.error);
        }
      }
    );
  }

  addText(text: string): void {
    if (!this.socket) return;

    const payload = {
      id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: text,
      peerId: this.peerId,
      peerName: this.peerName,
      createdAt: Date.now()
    };

    this.socket.emit('add-text', { roomCode: this.roomCode, text: payload }, (response: any) => {
      if (!response.success) {
        console.error('Failed to add text:', response.error);
        return;
      }
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.socket) {
      this.socket.disconnect();
    }
    this.cleanup();
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.peers.clear();
    this.files.clear();
    this.processedPeerIds.clear();
  }

  // Getters
  getPeers(): NetworkPeer[] {
    return Array.from(this.peers.values());
  }

  getPeerCount(): number {
    return this.peers.size;
  }

  getFiles(): NetworkFile[] {
    return Array.from(this.files.values());
  }

  getFileCount(): number {
    return this.files.size;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  getPeerId(): string {
    return this.peerId;
  }

  getPeerName(): string {
    return this.peerName;
  }
}
