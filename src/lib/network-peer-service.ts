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
  createdAt: number | string;
}

export interface ServerInfo {
  ip: string;
  port: number;
}

interface ServerResponse {
  success: boolean;
  error?: string;
}

interface JoinRoomResponse extends ServerResponse {
  peers?: NetworkPeer[];
  files?: NetworkFile[];
  texts?: SharedTextMessage[];
}

interface AddFileResponse extends ServerResponse {
  expiresAt: number;
}

interface DownloadFileResponse extends ServerResponse {
  file?: { data: string; type: string };
}

interface AddTextResponse extends ServerResponse {
  text?: Partial<SharedTextMessage> & { message?: string };
}

interface TextConfirmation<Response extends ServerResponse> {
  event: 'text-added';
  accept: (message: SharedTextMessage) => Response | undefined;
}

const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const ACK_TIMEOUT = 30000;
export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

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
  private joined = false;
  private connectionGeneration = 0;
  private settleConnection: ((connected: boolean) => void) | null = null;
  private pendingRequests = new Set<(error: Error) => void>();
  private onConnectionChanged: (state: ConnectionState, error?: string) => void;

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
      onConnectionChanged?: (state: ConnectionState, error?: string) => void;
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
    this.onConnectionChanged = callbacks.onConnectionChanged || (() => {});
  }

  private generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  updatePeerName(name: string): void {
    this.peerName = name;
    if (!this.isConnected()) return;

    this.socket!.emit('update-peer-name', {
      roomCode: this.roomCode,
      peerId: this.peerId,
      peerName: name
    });
  }

  /**
   * Connect to the backend server
   */
  async connect(): Promise<boolean> {
    this.disconnect();
    this.onConnectionChanged('connecting');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.onConnectionChanged('disconnected', 'Connection timed out. Please retry.');
        this.settleConnection?.(false);
      }, ACK_TIMEOUT);
      this.settleConnection = (connected) => {
        clearTimeout(timeout);
        this.settleConnection = null;
        resolve(connected);
      };
      try {
        const socket = io(this.serverUrl, {
          autoConnect: false,
          forceNew: true,
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
          transports: ['websocket', 'polling']
        });
        this.socket = socket;

        socket.on('connect', async () => {
          const generation = ++this.connectionGeneration;
          this.onConnectionChanged('connecting');
          try {
            await this.joinRoom();
            if (this.socket !== socket || generation !== this.connectionGeneration) return;
            this.joined = true;
            this.setupHeartbeat();
            this.onConnectionChanged('connected');
            this.settleConnection?.(true);
          } catch (error) {
            if (this.socket !== socket || generation !== this.connectionGeneration) return;
            this.onConnectionChanged('disconnected', error instanceof Error ? error.message : 'Failed to join room');
            this.settleConnection?.(false);
          }
        });

        socket.on('connect_error', (error) => {
          this.onConnectionChanged('disconnected', `Cannot connect to backend: ${error.message}`);
          this.settleConnection?.(false);
        });

        socket.on('disconnect', () => {
          ++this.connectionGeneration;
          this.cleanup();
          this.onConnectionChanged('disconnected', 'Connection lost. Reconnecting when possible.');
          this.settleConnection?.(false);
        });
        socket.io.on('reconnect_attempt', () => {
          this.onConnectionChanged('connecting', 'Connection lost. Reconnecting...');
        });
        socket.io.on('reconnect_failed', () => {
          this.onConnectionChanged('disconnected', 'Unable to reconnect. Please retry.');
          this.settleConnection?.(false);
        });
        this.setupEventListeners();
        socket.connect();
      } catch (error) {
        this.onConnectionChanged('disconnected', error instanceof Error ? error.message : 'Connection failed');
        this.settleConnection?.(false);
      }
    });
  }

  private request<Response extends ServerResponse = ServerResponse>(
    event: string,
    payload: unknown,
    timeout = ACK_TIMEOUT,
    requireJoined = true,
    confirmation?: TextConfirmation<Response>
  ): Promise<Response> {
    const socket = this.socket;
    if (!socket?.connected || (requireJoined && !this.joined)) {
      return Promise.reject(new Error('Not connected to the room'));
    }
    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, response?: Response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pendingRequests.delete(cancel);
        if (confirmation) socket.off(confirmation.event, confirm);
        if (error) reject(error);
        else if (response) resolve(response);
        else reject(new Error('The server did not return a response'));
      };
      const cancel = (error: Error) => finish(error);
      const confirm = (payload: SharedTextMessage) => {
        const response = confirmation?.accept(payload);
        if (response) finish(undefined, response);
      };
      const timer = setTimeout(() => finish(new Error('Server did not confirm the action. Please check the room before retrying.')), timeout);
      this.pendingRequests.add(cancel);
      if (confirmation) socket.on(confirmation.event, confirm);
      try {
        socket.emit(event, payload, (response: Response) => {
          if (response?.success === true) finish(undefined, response);
          else finish(new Error(response?.error || 'The server rejected the action'));
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Could not send the action'));
      }
    });
  }

  /**
   * Join a room on the backend
   */
  private async joinRoom(): Promise<void> {
    const generation = this.connectionGeneration;
    const response = await this.request<JoinRoomResponse>(
      'join-room',
      {
        roomCode: this.roomCode,
        peerName: this.peerName,
        peerId: this.peerId
      },
      ACK_TIMEOUT,
      false
    );
    if (generation !== this.connectionGeneration || !this.socket?.connected) {
      throw new Error('Connection lost while joining the room');
    }

    this.peers.clear();
    this.processedPeerIds.clear();
    this.peers.set(this.peerId, {
      id: this.peerId,
      name: this.peerName,
      lastSeen: Date.now(),
      joinedAt: Date.now(),
      isActive: true
    });
    (response.peers || []).forEach((peer: NetworkPeer) => {
      if (peer.id !== this.peerId) this.peers.set(peer.id, peer);
    });
    this.onPeersChanged(Array.from(this.peers.values()));

    this.files.clear();
    (response.files || []).forEach((file: NetworkFile) => {
      this.files.set(file.id, file);
    });
    this.onFilesChanged(Array.from(this.files.values()));

    this.texts.clear();
    (response.texts || []).forEach((text: SharedTextMessage) => {
      this.texts.set(text.id, text);
    });
    this.onTextsChanged(Array.from(this.texts.values()));
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
      this.processedPeerIds.delete(peerId);
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
      if (this.isConnected()) {
        this.socket!.emit('heartbeat', {
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
    if (!this.isConnected()) throw new Error('Not connected to the room');
    const generation = this.connectionGeneration;
    const fileId = this.generateFileId();
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        this.pendingRequests.delete(cancel);
        if (error) reject(error);
        else resolve(reader.result as string);
      };
      const cancel = (error: Error) => {
        finish(error);
        reader.abort();
      };
      this.pendingRequests.add(cancel);
      reader.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 50));
      };
      reader.onload = () => finish();
      reader.onerror = () => finish(new Error(`Failed to read ${file.name}`));
      reader.onabort = () => finish(new Error(`Reading ${file.name} was cancelled`));
      try {
        reader.readAsDataURL(file);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(`Failed to read ${file.name}`));
      }
    });
    if (generation !== this.connectionGeneration) throw new Error('Connection lost during upload');
    onProgress?.(50);
    const response = await this.request<AddFileResponse>('add-file', {
      roomCode: this.roomCode,
      file: { id: fileId, name: file.name, size: file.size, type: file.type, data: base64Data },
      peerId: this.peerId,
      peerName: this.peerName
    }, 120000);
    if (generation !== this.connectionGeneration) throw new Error('Connection lost during upload');
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
    this.onFilesChanged(Array.from(this.files.values()));
    onProgress?.(100);
    return networkFile;
  }

  /**
   * Download a file
   */
  async downloadFile(fileId: string): Promise<Blob | null> {
    const response = await this.request<DownloadFileResponse>('download-file', { fileId }, 120000);
    if (!response.file || typeof response.file.data !== 'string') {
      throw new Error('The server did not return file data');
    }
    const data = response.file.data;
    const base64Data = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([bytes], { type: response.file.type });
  }

  /**
   * Remove a file from sharing
   */
  async removeFile(fileId: string): Promise<boolean> {
    await this.request(
      'remove-file',
      {
        fileId,
        roomCode: this.roomCode
      }
    );
    this.files.delete(fileId);
    this.onFilesChanged(Array.from(this.files.values()));
    return true;
  }

  async addText(text: string, id = `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, createdAt: number | string = Date.now()): Promise<SharedTextMessage> {
    const payload = {
      id,
      message: text,
      peerId: this.peerId,
      peerName: this.peerName,
      createdAt
    };

    const response = await this.request<AddTextResponse>(
      'add-text',
      { roomCode: this.roomCode, text: payload },
      ACK_TIMEOUT,
      true,
      {
        event: 'text-added',
        accept: (message: SharedTextMessage) => message.id === id && message.peerId === this.peerId
          ? { success: true, text: message }
          : undefined
      }
    );
    const message: SharedTextMessage = {
      id,
      text,
      peerId: payload.peerId,
      peerName: payload.peerName,
      createdAt: payload.createdAt,
      ...(response.text?.id ? {
        ...response.text,
        text: response.text.text ?? response.text.message ?? text
      } : {})
    };
    this.texts.set(message.id, message);
    return message;
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    ++this.connectionGeneration;
    this.settleConnection?.(false);
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.io.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.cleanup();
    this.texts.clear();
    this.onConnectionChanged('disconnected');
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.joined = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
    for (const cancel of this.pendingRequests) cancel(new Error('Connection lost before the server confirmed the action'));
    this.peers.clear();
    this.files.clear();
    this.processedPeerIds.clear();
    this.onPeersChanged([]);
    this.onFilesChanged([]);
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
    return this.joined && (this.socket?.connected ?? false);
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
