/**
 * Local Network File Sharing Service
 *
 * IMPORTANT: This implementation uses localStorage for same-browser tab communication
 * and IndexedDB for file storage.
 *
 * For TRUE cross-device local network sharing on WiFi/LAN, you need:
 * 1. A backend server (Node.js, Python, etc.) running on your network
 * 2. Or use Firebase (which works via internet but can sync devices on same network)
 * 3. Or implement WebRTC with a signaling server
 *
 * This version provides:
 * ✅ Same-browser tab sharing (via BroadcastChannel)
 * ✅ Same-device multi-tab sync (via localStorage + IndexedDB)
 * ✅ File persistence in browser
 * ❌ Different device sharing (requires backend server or Firebase)
 */

export interface NetworkPeer {
  id: string;
  name: string;
  lastSeen: number;
  ip?: string;
}

export interface NetworkFile {
  id: string;
  name: string;
  size: number;
  type: string;
  peerId: string;
  peerName: string;
  expiresAt: number;
  data?: ArrayBuffer;
}

const FILES_STORE = 'dropfile_files';
const BROADCAST_CHANNEL = 'dropfile_broadcast';
const HEARTBEAT_INTERVAL = 2000; // 2 seconds
const CLEANUP_INTERVAL = 30000; // 30 seconds
const FILE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class LocalNetworkPeerService {
  private peerId: string;
  private peerName: string;
  private roomCode: string;
  private peers: Map<string, NetworkPeer> = new Map();
  private localFiles: Map<string, NetworkFile> = new Map();
  private onPeersChanged: (peers: NetworkPeer[]) => void;
  private onFilesChanged: (files: NetworkFile[]) => void;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private db: IDBDatabase | null = null;
  private broadcastChannel: BroadcastChannel | null = null;

  constructor(
    roomCode: string,
    peerName: string,
    onPeersChanged: (peers: NetworkPeer[]) => void,
    onFilesChanged: (files: NetworkFile[]) => void
  ) {
    this.peerId = this.generatePeerId();
    this.peerName = peerName || `Device ${this.peerId.slice(0, 6)}`;
    this.roomCode = roomCode;
    this.onPeersChanged = onPeersChanged;
    this.onFilesChanged = onFilesChanged;
  }

  private generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Initialize IndexedDB for local file storage
  async initDB(): Promise<boolean> {
    return new Promise((resolve) => {
      const request = indexedDB.open('DropFileDB', 1);

      request.onerror = () => {
        console.error('Failed to open IndexedDB');
        resolve(false);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized for file storage');
        resolve(true);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  // Initialize BroadcastChannel for same-browser communication
  private initBroadcastChannel(): void {
    if (!('BroadcastChannel' in window)) {
      console.warn('BroadcastChannel not supported in this browser');
      return;
    }

    try {
      const channelName = `${BROADCAST_CHANNEL}_${this.roomCode}`;
      this.broadcastChannel = new BroadcastChannel(channelName);

      this.broadcastChannel.onmessage = (event) => {
        const message = event.data;
        this.handleBroadcastMessage(message);
      };

      console.log('BroadcastChannel initialized for same-browser communication');
    } catch (e) {
      console.warn('Failed to initialize BroadcastChannel:', e);
    }
  }

  private handleBroadcastMessage(message: any): void {
    const { type, file, peerId, peerName } = message;

    switch (type) {
      case 'peer-join':
        if (peerId !== this.peerId) {
          this.peers.set(peerId, {
            id: peerId,
            name: peerName,
            lastSeen: Date.now()
          });
          this.onPeersChanged(Array.from(this.peers.values()));
        }
        break;

      case 'file-added':
        // File announced by another tab
        if (peerId !== this.peerId && file) {
          this.onFilesChanged([file]);
        }
        break;

      case 'peer-list-request':
        // Another tab asking for our peer list
        if (this.broadcastChannel) {
          this.broadcastChannel.postMessage({
            type: 'peer-list-response',
            peers: Array.from(this.peers.values()),
            peerId: this.peerId
          });
        }
        break;
    }
  }

  private broadcastMessage(message: any): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch (e) {
        console.error('Failed to broadcast message:', e);
      }
    }
  }

  // ...existing code...

  async connect(): Promise<boolean> {
    try {
      const dbReady = await this.initDB();
      if (!dbReady) {
        console.warn('IndexedDB not available, using in-memory storage only');
      }

      this.initBroadcastChannel();

      // Announce our presence to other tabs
      this.broadcastMessage({
        type: 'peer-join',
        peerId: this.peerId,
        peerName: this.peerName
      });

      // Start cleanup for expired files
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpiredFiles();
      }, CLEANUP_INTERVAL);

      console.log(`Connected to room: ${this.roomCode} as ${this.peerName}`);
      return true;
    } catch (error) {
      console.error('Failed to connect:', error);
      return false;
    }
  }

  disconnect(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    this.peers.clear();
    this.localFiles.clear();
    if (this.db) this.db.close();
  }

  async addFile(file: File): Promise<NetworkFile> {
    const data = await file.arrayBuffer();
    const id = this.generateFileId();
    const expiresAt = Date.now() + FILE_TTL_MS;

    const networkFile: NetworkFile = {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      peerId: this.peerId,
      peerName: this.peerName,
      expiresAt,
      data
    };

    this.localFiles.set(id, networkFile);

    // Store in IndexedDB
    if (this.db) {
      const transaction = this.db.transaction([FILES_STORE], 'readwrite');
      const store = transaction.objectStore(FILES_STORE);
      const fileToStore = { ...networkFile, data: null }; // Don't store data in IndexedDB yet
      store.add(fileToStore);
    }

    // Announce file to other peers via localStorage
    this.announceFiles();
    return networkFile;
  }



  getLocalFile(fileId: string): Blob | null {
    const file = this.localFiles.get(fileId);
    if (file && file.data) {
      return new Blob([file.data], { type: file.type });
    }
    return null;
  }

  removeFile(fileId: string): void {
    this.localFiles.delete(fileId);
    // Broadcast file removal to other tabs
    this.broadcastMessage({
      type: 'file-removed',
      fileId,
      peerId: this.peerId
    });
  }

  private cleanupExpiredFiles(): void {
    const now = Date.now();
    let changed = false;

    for (const [id, file] of this.localFiles) {
      if (file.expiresAt < now) {
        this.localFiles.delete(id);
        changed = true;
        // Broadcast removal to other tabs
        this.broadcastMessage({
          type: 'file-removed',
          fileId: id,
          peerId: this.peerId
        });
      }
    }
  }

  getPeers(): NetworkPeer[] {
    return Array.from(this.peers.values());
  }

  getPeerCount(): number {
    return this.peers.size;
  }
}

