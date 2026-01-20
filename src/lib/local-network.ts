/**
 * Local Network File Sharing Service
 *
 * IMPORTANT: BroadcastChannel only works within the SAME BROWSER (different tabs).
 * For cross-device sharing on the same network, we rely on Firebase as the
 * signaling/sync mechanism. The "local" aspect here refers to:
 * 1. Same-browser tab sharing via BroadcastChannel (instant)
 * 2. Cross-device sharing via Firebase (works across network)
 *
 * True peer-to-peer WebRTC would require a signaling server, which adds complexity.
 * Firebase serves as both the signaling mechanism and fallback storage.
 */

export interface LocalFile {
  id: string;
  name: string;
  size: number;
  type: string;
  data: ArrayBuffer;
  expiresAt: number;
}

export interface LocalFileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  expiresAt: number;
  peerId: string;
}

type MessageType =
  | { type: 'file-announced'; file: LocalFileMetadata }
  | { type: 'file-removed'; fileId: string }
  | { type: 'file-request'; fileId: string; requesterId: string }
  | { type: 'file-response'; fileId: string; data: ArrayBuffer; requesterId: string }
  | { type: 'peer-join'; peerId: string }
  | { type: 'peer-leave'; peerId: string }
  | { type: 'sync-request'; peerId: string }
  | { type: 'sync-response'; files: LocalFileMetadata[]; peerId: string };

const FILE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * LocalNetworkService provides same-browser tab communication.
 * For cross-device sharing, Firebase is used (handled in use-room.ts).
 *
 * This service is useful for:
 * - Sharing files between tabs in the same browser instantly
 * - Caching files locally for faster re-downloads
 */
export class LocalNetworkService {
  private channel: BroadcastChannel | null = null;
  private peerId: string;
  private roomCode: string;
  private localFiles: Map<string, LocalFile> = new Map();
  private remoteFiles: Map<string, LocalFileMetadata> = new Map();
  private onFilesChanged: (files: LocalFileMetadata[]) => void;
  private onConnectionStatusChanged: (connected: boolean, peerCount: number) => void;
  private connectedPeers: Set<string> = new Set();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    roomCode: string,
    onFilesChanged: (files: LocalFileMetadata[]) => void,
    onConnectionStatusChanged: (connected: boolean, peerCount: number) => void
  ) {
    this.peerId = this.generatePeerId();
    this.roomCode = roomCode;
    this.onFilesChanged = onFilesChanged;
    this.onConnectionStatusChanged = onConnectionStatusChanged;
  }

  private generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Connect to the local broadcast channel.
   * Note: This only enables same-browser communication.
   * Cross-device sharing requires Firebase (configured separately).
   */
  async connect(): Promise<boolean> {
    try {
      // Use BroadcastChannel for same-origin communication (same browser only)
      if ('BroadcastChannel' in window) {
        this.channel = new BroadcastChannel(`dropfile_room_${this.roomCode}`);
        this.channel.onmessage = (event) => this.handleMessage(event.data);

        // Announce our presence
        this.broadcast({ type: 'peer-join', peerId: this.peerId });

        // Request sync from existing peers
        this.broadcast({ type: 'sync-request', peerId: this.peerId });

        // Start cleanup interval
        this.cleanupInterval = setInterval(() => this.cleanupExpiredFiles(), 10000);

        this.onConnectionStatusChanged(true, this.connectedPeers.size);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to connect to local network:', error);
      return false;
    }
  }

  disconnect(): void {
    if (this.channel) {
      this.broadcast({ type: 'peer-leave', peerId: this.peerId });
      this.channel.close();
      this.channel = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.localFiles.clear();
    this.remoteFiles.clear();
    this.connectedPeers.clear();
  }

  private broadcast(message: MessageType): void {
    if (this.channel) {
      this.channel.postMessage(message);
    }
  }

  private handleMessage(message: MessageType): void {
    switch (message.type) {
      case 'peer-join':
        if (message.peerId !== this.peerId) {
          this.connectedPeers.add(message.peerId);
          this.onConnectionStatusChanged(true, this.connectedPeers.size);
          // Send our files to the new peer
          const ourFiles = Array.from(this.localFiles.values()).map(f => ({
            id: f.id,
            name: f.name,
            size: f.size,
            type: f.type,
            expiresAt: f.expiresAt,
            peerId: this.peerId
          }));
          if (ourFiles.length > 0) {
            this.broadcast({ type: 'sync-response', files: ourFiles, peerId: this.peerId });
          }
        }
        break;

      case 'peer-leave':
        this.connectedPeers.delete(message.peerId);
        // Remove files from the leaving peer
        for (const [id, file] of this.remoteFiles) {
          if (file.peerId === message.peerId) {
            this.remoteFiles.delete(id);
          }
        }
        this.notifyFilesChanged();
        this.onConnectionStatusChanged(true, this.connectedPeers.size);
        break;

      case 'file-announced':
        if (message.file.peerId !== this.peerId) {
          this.remoteFiles.set(message.file.id, message.file);
          this.notifyFilesChanged();
        }
        break;

      case 'file-removed':
        this.remoteFiles.delete(message.fileId);
        this.notifyFilesChanged();
        break;

      case 'sync-request':
        if (message.peerId !== this.peerId) {
          this.connectedPeers.add(message.peerId);
          const files = Array.from(this.localFiles.values()).map(f => ({
            id: f.id,
            name: f.name,
            size: f.size,
            type: f.type,
            expiresAt: f.expiresAt,
            peerId: this.peerId
          }));
          if (files.length > 0) {
            this.broadcast({ type: 'sync-response', files, peerId: this.peerId });
          }
          this.onConnectionStatusChanged(true, this.connectedPeers.size);
        }
        break;

      case 'sync-response':
        if (message.peerId !== this.peerId) {
          this.connectedPeers.add(message.peerId);
          message.files.forEach(file => {
            this.remoteFiles.set(file.id, file);
          });
          this.notifyFilesChanged();
          this.onConnectionStatusChanged(true, this.connectedPeers.size);
        }
        break;

      case 'file-request':
        if (message.requesterId !== this.peerId) {
          const file = this.localFiles.get(message.fileId);
          if (file) {
            this.broadcast({
              type: 'file-response',
              fileId: message.fileId,
              data: file.data,
              requesterId: message.requesterId
            });
          }
        }
        break;

      case 'file-response':
        // This is handled by the requestFile promise
        break;
    }
  }

  private notifyFilesChanged(): void {
    const allFiles = [
      ...Array.from(this.localFiles.values()).map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        type: f.type,
        expiresAt: f.expiresAt,
        peerId: this.peerId
      })),
      ...Array.from(this.remoteFiles.values())
    ];
    this.onFilesChanged(allFiles);
  }

  private cleanupExpiredFiles(): void {
    const now = Date.now();
    let changed = false;

    for (const [id, file] of this.localFiles) {
      if (file.expiresAt < now) {
        this.localFiles.delete(id);
        this.broadcast({ type: 'file-removed', fileId: id });
        changed = true;
      }
    }

    for (const [id, file] of this.remoteFiles) {
      if (file.expiresAt < now) {
        this.remoteFiles.delete(id);
        changed = true;
      }
    }

    if (changed) {
      this.notifyFilesChanged();
    }
  }

  async addFile(file: File): Promise<LocalFileMetadata> {
    const data = await file.arrayBuffer();
    const id = this.generateFileId();
    const expiresAt = Date.now() + FILE_TTL_MS;

    const localFile: LocalFile = {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      data,
      expiresAt
    };

    this.localFiles.set(id, localFile);

    const metadata: LocalFileMetadata = {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      expiresAt,
      peerId: this.peerId
    };

    this.broadcast({ type: 'file-announced', file: metadata });
    this.notifyFilesChanged();

    return metadata;
  }

  removeFile(fileId: string): void {
    if (this.localFiles.has(fileId)) {
      this.localFiles.delete(fileId);
      this.broadcast({ type: 'file-removed', fileId });
      this.notifyFilesChanged();
    }
  }

  getFileBlob(fileId: string): Blob | null {
    const file = this.localFiles.get(fileId);
    if (file) {
      return new Blob([file.data], { type: file.type });
    }
    return null;
  }

  isLocalFile(fileId: string): boolean {
    return this.localFiles.has(fileId);
  }

  async requestRemoteFile(fileId: string): Promise<Blob | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.channel) {
          this.channel.onmessage = (event) => this.handleMessage(event.data);
        }
        resolve(null);
      }, 5000);

      const originalHandler = this.channel?.onmessage;

      if (this.channel) {
        this.channel.onmessage = (event) => {
          const message = event.data as MessageType;
          if (message.type === 'file-response' &&
              message.fileId === fileId &&
              message.requesterId === this.peerId) {
            clearTimeout(timeout);
            if (this.channel) {
              this.channel.onmessage = originalHandler || ((e) => this.handleMessage(e.data));
            }
            const remoteFile = this.remoteFiles.get(fileId);
            const blob = new Blob([message.data], { type: remoteFile?.type || 'application/octet-stream' });
            resolve(blob);
          } else {
            this.handleMessage(message);
          }
        };
      }

      this.broadcast({ type: 'file-request', fileId, requesterId: this.peerId });
    });
  }

  get isConnected(): boolean {
    return this.channel !== null;
  }

  get peerCount(): number {
    return this.connectedPeers.size;
  }
}

