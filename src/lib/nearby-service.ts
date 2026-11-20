import io, { Socket } from 'socket.io-client';
import type { DeviceType } from './utils';

export interface NearbyPeer {
  id: string;
  name: string;
  deviceType: DeviceType;
  joinedAt?: number;
}

export interface NearbyInvite {
  fromPeerId: string;
  fromName: string;
  roomCode: string;
}

export type NearbyConnectionState = 'connecting' | 'connected' | 'disconnected';

interface Callbacks {
  onPeers: (peers: NearbyPeer[]) => void;
  onConnection: (state: NearbyConnectionState, message?: string, lanMode?: boolean) => void;
  onSignal: (fromPeerId: string, data: unknown) => void;
  onInvite: (invite: NearbyInvite) => void;
  onPeerLeft?: (peerId: string) => void;
}

interface Ack {
  success: boolean;
  error?: string;
  peers?: NearbyPeer[];
  lanMode?: boolean;
}

const ACK_TIMEOUT = 15000;

/**
 * Discovery of devices on the same network (same public address, or everyone on a LAN-mode server)
 * plus signaling for direct WebRTC transfers between them. No file data passes through the server.
 */
export class NearbyService {
  private socket: Socket | null = null;
  private peers = new Map<string, NearbyPeer>();
  private joined = false;
  private lifecycleCleanup: (() => void) | null = null;

  constructor(
    private readonly serverUrl: string,
    private readonly peerId: string,
    private name: string,
    private readonly deviceType: DeviceType,
    private readonly callbacks: Callbacks,
  ) {}

  getPeerId(): string {
    return this.peerId;
  }

  isConnected(): boolean {
    return this.joined && !!this.socket?.connected;
  }

  connect(): void {
    this.disconnect();
    this.callbacks.onConnection('connecting');
    const socket = io(this.serverUrl, {
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
    });
    this.socket = socket;

    socket.on('connect', () => void this.join(socket));
    socket.on('connect_error', error => {
      this.callbacks.onConnection('connecting', `Looking for the server… (${error.message})`);
    });
    socket.on('disconnect', reason => {
      this.joined = false;
      this.peers.clear();
      this.callbacks.onPeers([]);
      this.callbacks.onConnection('connecting', 'Connection lost. Reconnecting…');
      if (reason === 'io server disconnect' && this.socket === socket) socket.connect();
    });
    socket.on('nearby-peer-joined', (peer: NearbyPeer) => this.upsert(peer));
    socket.on('nearby-peer-updated', (peer: NearbyPeer) => this.upsert(peer));
    socket.on('nearby-peer-left', ({ peerId }: { peerId: string }) => {
      if (this.peers.delete(peerId)) this.emitPeers();
      this.callbacks.onPeerLeft?.(peerId);
    });
    socket.on('nearby-session-replaced', () => {
      this.joined = false;
      this.callbacks.onConnection('disconnected', 'Nearby sharing was opened in another tab on this device.');
      socket.disconnect();
    });
    socket.on('rtc-signal', (message: { scope?: string; fromPeerId?: string; data?: unknown }) => {
      if (message?.scope === 'nearby' && typeof message.fromPeerId === 'string') this.callbacks.onSignal(message.fromPeerId, message.data);
    });
    socket.on('nearby-invite', (invite: NearbyInvite) => {
      if (invite && typeof invite.roomCode === 'string' && typeof invite.fromPeerId === 'string') this.callbacks.onInvite(invite);
    });
    this.watchPageLifecycle();
  }

  disconnect(): void {
    this.lifecycleCleanup?.();
    this.lifecycleCleanup = null;
    const socket = this.socket;
    this.socket = null;
    this.joined = false;
    if (socket) {
      socket.emit('leave-nearby');
      socket.removeAllListeners();
      socket.disconnect();
    }
    this.peers.clear();
  }

  rename(name: string): void {
    this.name = name;
    if (this.isConnected()) this.socket!.emit('update-nearby', { name });
  }

  async sendSignal(targetPeerId: string, data: unknown): Promise<void> {
    await this.request('rtc-signal', { scope: 'nearby', targetPeerId, data });
  }

  async invite(targetPeerId: string, roomCode: string): Promise<void> {
    await this.request('nearby-invite', { targetPeerId, roomCode });
  }

  private async join(socket: Socket) {
    try {
      const response = await this.request('join-nearby', { peerId: this.peerId, name: this.name, deviceType: this.deviceType }, false);
      if (this.socket !== socket) return;
      this.joined = true;
      this.peers = new Map((response.peers || []).map(peer => [peer.id, peer]));
      this.emitPeers();
      this.callbacks.onConnection('connected', undefined, response.lanMode === true);
    } catch (error) {
      if (this.socket === socket) this.callbacks.onConnection('disconnected', error instanceof Error ? error.message : 'Could not start nearby sharing');
    }
  }

  private request(event: string, payload: unknown, requireJoined = true): Promise<Ack> {
    const socket = this.socket;
    if (!socket?.connected || (requireJoined && !this.joined)) return Promise.reject(new Error('Not connected'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The server did not respond')), ACK_TIMEOUT);
      socket.emit(event, payload, (response: Ack) => {
        clearTimeout(timer);
        if (response?.success) resolve(response);
        else reject(new Error(response?.error || 'The server rejected the request'));
      });
    });
  }

  private upsert(peer: NearbyPeer) {
    if (!peer || typeof peer.id !== 'string' || peer.id === this.peerId) return;
    this.peers.set(peer.id, peer);
    this.emitPeers();
  }

  private emitPeers() {
    this.callbacks.onPeers([...this.peers.values()].sort((a, b) => a.name.localeCompare(b.name)));
  }

  private watchPageLifecycle() {
    if (typeof window === 'undefined') return;
    const resume = () => {
      if (document.visibilityState === 'hidden') return;
      if (this.socket && !this.socket.connected) this.socket.connect();
    };
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    this.lifecycleCleanup = () => {
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }
}
