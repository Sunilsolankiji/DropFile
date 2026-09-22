/**
 * Network Peer Service - Socket.IO Backend Integration
 *
 * This service communicates with a Node.js backend server for true
 * cross-device file sharing over local network/WiFi.
 */

import io, { Socket } from 'socket.io-client';
import { DEFAULT_FILE_TYPE } from './transfer-types';
import { generateDeviceName } from './utils';
import type {
  CreatedTransfer, FileMetadata, ShareMetadata, StartedTransfer,
  TransferClient, TransferSnapshot, TransferUpdate
} from './transfer-types';

export interface NetworkPeer {
  id: string;
  name: string;
  lastSeen: number;
  ip?: string;
  joinedAt?: number;
  isActive?: boolean;
}

export type NetworkFile = ShareMetadata;

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

interface AddTextResponse extends ServerResponse {
  text?: Partial<SharedTextMessage> & { message?: string };
}

interface TextConfirmation<Response extends ServerResponse> {
  event: 'text-added';
  accept: (message: SharedTextMessage) => Response | undefined;
}

const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const ACK_TIMEOUT = 30000;
// Render's free tier can sleep and take a while to wake up, so the initial
// connection is given a longer budget than individual request acknowledgements.
const CONNECT_TIMEOUT = 90000;
export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export class NetworkPeerService implements TransferClient {
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
  private onTransferUpdated: (update: TransferUpdate) => void;
  private onTransferCompleted: (update: TransferUpdate) => void;
  private onTransferError: (message: string) => void;

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
      onTransferUpdated?: (update: TransferUpdate) => void;
      onTransferCompleted?: (update: TransferUpdate) => void;
      onTransferError?: (message: string) => void;
    },
    peerId?: string
  ) {
    this.peerId = peerId || this.generatePeerId();
    this.peerName = peerName || generateDeviceName();
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
    this.onTransferUpdated = callbacks.onTransferUpdated || (() => {});
    this.onTransferCompleted = callbacks.onTransferCompleted || (() => {});
    this.onTransferError = callbacks.onTransferError || (() => {});
  }

  private generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      }, CONNECT_TIMEOUT);
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
          reconnectionDelayMax: 10000,
          reconnectionAttempts: 15,
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
          // The backend may be a sleeping Render free-tier instance. Socket.IO will keep
          // retrying automatically, so keep the UI in a "waking up" state rather than
          // treating the first failure as permanent. Final failure is reported via the
          // overall timeout or the 'reconnect_failed' event below.
          this.onConnectionChanged('connecting', `Waking up the backend, this can take up to a minute… (${error.message})`);
        });

        socket.on('disconnect', () => {
          ++this.connectionGeneration;
          this.cleanup();
          this.onConnectionChanged('disconnected', 'Connection lost. Reconnecting when possible.');
          this.settleConnection?.(false);
        });
        socket.io.on('reconnect_attempt', () => {
          this.onConnectionChanged('connecting', 'Waking up the backend, this can take up to a minute…');
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

    this.socket.on('transfer-updated', (update: TransferUpdate) => {
      this.applyTransferUpdate(update);
    });
    this.socket.on('transfer-completed', (update: TransferUpdate) => {
      this.applyTransferUpdate(update, true);
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

  private validateId(id: string): void {
    if (typeof id !== 'string' || !id.trim() || id === '.' || id === '..') {
      throw new Error('Invalid file or transfer ID');
    }
  }

  private validateChunks(chunkSize: number, totalChunks: number, size?: number): void {
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0 ||
        !Number.isSafeInteger(totalChunks) || totalChunks < 0 ||
        (size !== undefined && (!Number.isSafeInteger(size) || size < 0 ||
          Math.ceil(size / chunkSize) !== totalChunks))) {
      throw new Error('Invalid transfer chunk dimensions');
    }
  }

  private validateIndexes(indexes: number[], totalChunks: number): void {
    if (!Array.isArray(indexes) || indexes.some(index =>
      !Number.isSafeInteger(index) || index < 0 || index >= totalChunks) ||
      new Set(indexes).size !== indexes.length) {
      throw new Error('The server must return valid chunk index arrays, not counts');
    }
  }

  private applyTransferUpdate(update: TransferUpdate, completed = false): void {
    if (!update || typeof update.transferId !== 'string' || !update.transferId.trim() ||
        typeof update.fileId !== 'string' || !update.fileId.trim() || !update.status ||
        typeof update.status.state !== 'string' || !update.status.state.trim() ||
        !Number.isSafeInteger(update.status.uploadedChunks) || update.status.uploadedChunks < 0 ||
        !Number.isSafeInteger(update.status.acknowledgedChunks) || update.status.acknowledgedChunks < 0) {
      this.onTransferError('Invalid transfer update: expected IDs, state, and nonnegative chunk counts');
      return;
    }
    const file = this.files.get(update.fileId);
    if (file && (file.transferId !== update.transferId ||
        update.status.uploadedChunks > file.totalChunks ||
        update.status.acknowledgedChunks > file.totalChunks)) {
      this.onTransferError('Invalid transfer update: transfer ID mismatch or chunk counts out of bounds');
      return;
    }
    if (update.peerId !== undefined && (typeof update.peerId !== 'string' || !update.peerId.trim())) {
      this.onTransferError('Invalid transfer update: peerId must be a non-empty string when present');
      return;
    }
    // A peerId means this update describes one specific receiver, not the shared file.
    const scopedPeerId = typeof update.peerId === 'string' && update.peerId.trim() ? update.peerId : undefined;
    const scopedToOther = scopedPeerId !== undefined && scopedPeerId !== this.peerId;

    if (file) {
      if (scopedPeerId !== undefined) {
        // Receiver-scoped: update shared bookkeeping only, never the global lifecycle/availability.
        const completedReceivers = new Set(file.transfer?.completedReceiverPeerIds ?? []);
        if (completed) completedReceivers.add(scopedPeerId);
        this.files.set(file.id, {
          ...file,
          transfer: {
            ...file.transfer,
            ...update.status,
            // Preserve the shared lifecycle state; a single receiver cannot change it.
            state: file.transfer?.state ?? update.status.state,
            completedReceiverPeerIds: [...completedReceivers],
          },
        });
      } else {
        // Shared/sender-driven update: drives global availability for everyone.
        const state = completed ? 'completed' : update.status.state;
        this.files.set(file.id, {
          ...file,
          status: state,
          transfer: { ...file.transfer, ...update.status, state },
        });
      }
      this.onFilesChanged(Array.from(this.files.values()));
    }

    // Push counts and chunkIndex are notifications, never authoritative index sets.
    if (completed && !scopedToOther) {
      this.onTransferCompleted({ ...update, status: { ...update.status, state: 'completed' } });
    } else {
      // Another receiver's completion only refreshes shared receiver bookkeeping locally.
      this.onTransferUpdated(update);
    }
  }

  async createFileShare(file: FileMetadata): Promise<CreatedTransfer> {
    if (typeof file.name !== 'string' || !file.name || typeof file.type !== 'string') {
      throw new Error('Invalid file metadata');
    }
    this.validateChunks(file.chunkSize, file.totalChunks, file.size);
    if (file.id !== undefined) this.validateId(file.id);
    if (file.hash !== undefined && typeof file.hash !== 'string') throw new Error('Invalid file hash');
    const metadata: FileMetadata = {
      name: file.name, size: file.size, type: file.type || DEFAULT_FILE_TYPE,
      chunkSize: file.chunkSize, totalChunks: file.totalChunks,
      ...(file.id !== undefined ? { id: file.id } : {}),
      ...(file.hash !== undefined ? { hash: file.hash } : {})
    };
    const generation = this.connectionGeneration;
    const response = await this.request<CreatedTransfer>('add-file', {
      roomCode: this.roomCode, peerId: this.peerId, file: metadata
    });
    if (generation !== this.connectionGeneration) throw new Error('Connection lost while sharing the file');
    this.validateId(response.fileId);
    this.validateId(response.transferId);
    if (metadata.id !== undefined && response.fileId !== metadata.id) throw new Error('File ID mismatch');
    this.validateChunks(response.chunkSize, response.totalChunks, metadata.size);
    if (!Number.isFinite(response.expiresAt) || response.expiresAt <= Date.now()) {
      throw new Error('Invalid transfer expiry');
    }
    this.getChunkUrl(response.uploadUrlTemplate, response.transferId, 0);
    const existing = this.files.get(response.fileId);
    if (existing && (existing.transferId !== response.transferId || existing.size !== metadata.size ||
        existing.chunkSize !== response.chunkSize || existing.totalChunks !== response.totalChunks)) {
      throw new Error('Transfer metadata mismatch');
    }
    if (!existing) {
      this.files.set(response.fileId, {
        ...metadata,
        id: response.fileId,
        transferId: response.transferId,
        roomCode: this.roomCode,
        peerId: this.peerId,
        peerName: this.peerName,
        expiresAt: response.expiresAt,
        chunkSize: response.chunkSize,
        totalChunks: response.totalChunks,
        uploadedAt: Date.now(),
        status: 'pending'
      });
      this.onFilesChanged(Array.from(this.files.values()));
    }
    return response;
  }

  async startTransfer(fileId: string): Promise<StartedTransfer> {
    this.validateId(fileId);
    const response = await this.request<StartedTransfer>('start-transfer', {
      roomCode: this.roomCode, fileId, peerId: this.peerId
    });
    this.validateId(response.transferId);
    if (response.fileId !== fileId) throw new Error('File ID mismatch');
    const file = this.files.get(fileId);
    if (file && file.transferId !== response.transferId) throw new Error('Transfer ID mismatch');
    this.validateChunks(response.chunkSize, response.totalChunks, file?.size);
    if (file && (file.chunkSize !== response.chunkSize || file.totalChunks !== response.totalChunks)) {
      throw new Error('Transfer metadata mismatch');
    }
    if (typeof response.state !== 'string' || !response.state) throw new Error('Invalid transfer state');
    this.validateIndexes(response.uploadedChunkIndexes, response.totalChunks);
    this.validateIndexes(response.acknowledgedChunkIndexes, response.totalChunks);
    this.getChunkUrl(response.downloadUrlTemplate, response.transferId, 0);
    return response;
  }

  async getTransferState(transferId: string): Promise<TransferSnapshot> {
    this.validateId(transferId);
    const response = await this.request<TransferSnapshot>('get-transfer-state', {
      transferId
    });
    if (response.transferId !== transferId || response.roomCode !== this.roomCode) {
      throw new Error('Transfer or room ID mismatch');
    }
    this.validateId(response.fileId);
    if (!response.summary || typeof response.state !== 'string' || !response.state) {
      throw new Error('Invalid transfer snapshot');
    }
    const file = Array.from(this.files.values()).find(value => value.transferId === transferId);
    if (file && file.id !== response.fileId) throw new Error('File ID mismatch');
    const namedFile = this.files.get(response.fileId);
    if (namedFile && namedFile.transferId !== transferId) throw new Error('Transfer ID mismatch');
    this.validateChunks(response.chunkSize, response.summary.totalChunks, file?.size);
    if (file && (file.chunkSize !== response.chunkSize || file.totalChunks !== response.summary.totalChunks)) {
      throw new Error('Transfer metadata mismatch');
    }
    this.validateIndexes(response.uploadedChunkIndexes, response.summary.totalChunks);
    this.validateIndexes(response.acknowledgedChunkIndexes, response.summary.totalChunks);
    return response;
  }

  async acknowledgeChunk(transferId: string, chunkIndex: number): Promise<void> {
    this.validateId(transferId);
    const file = Array.from(this.files.values()).find(value => value.transferId === transferId);
    if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 ||
        (file && chunkIndex >= file.totalChunks)) throw new Error('Invalid chunk index');
    if (!this.isConnected()) throw new Error('Not connected to the room');
    this.socket!.emit('ack-transfer-chunk', {
      transferId, chunkIndex, peerId: this.peerId
    });
  }

  async cancelTransfer(transferId: string, reason: string): Promise<void> {
    this.validateId(transferId);
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('A cancellation reason is required');
    if (!this.isConnected()) throw new Error('Not connected to the room');
    this.socket!.emit('cancel-transfer', {
      roomCode: this.roomCode, transferId, peerId: this.peerId, reason
    });
  }

  getChunkUrl(template: string | undefined, transferId: string, chunkIndex: number): string {
    this.validateId(transferId);
    if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) throw new Error('Invalid chunk index');
    const backend = new URL(this.serverUrl, typeof window === 'undefined' ? undefined : window.location.href);
    if (backend.protocol !== 'http:' && backend.protocol !== 'https:') {
      throw new Error('The backend must use HTTP or HTTPS');
    }
    if (template !== undefined && (typeof template !== 'string' || !template.trim())) {
      throw new Error('Invalid chunk URL template');
    }
    const source = template ?? '/api/transfers/{transferId}/chunks/{chunkIndex}';
    const path = source.replace(/\{(transferId|chunkIndex)\}|:(transferId|chunkIndex)\b/g,
      (_match, braced: string | undefined, colon: string | undefined) =>
        encodeURIComponent((braced ?? colon) === 'transferId' ? transferId : String(chunkIndex)));
    if (/[{}]/.test(path)) throw new Error('Unresolved chunk URL placeholder');
    const url = new URL(path, `${backend.origin}/`);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.origin !== backend.origin || url.username || url.password) {
      throw new Error('Chunk URLs must use the backend HTTP origin');
    }
    return url.href;
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
    this.processedPeerIds.clear();
    this.onPeersChanged([]);
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
