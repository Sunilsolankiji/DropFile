import { PeerLink, DEFAULT_CONNECT_TIMEOUT_MS, type SignalData } from './peer-link';
import { P2PSession, type SessionHandlers } from './p2p-session';
import { getIceServers, isWebRtcSupported } from './ice';

export interface SignalTransport {
  send(targetPeerId: string, data: SignalData): Promise<void>;
}

interface Connection {
  link: PeerLink;
  session: P2PSession;
}

/**
 * Direct WebRTC connections to the other devices in one room or nearby group, created on demand
 * by either side and reused for every transfer between the same two devices.
 */
export class P2PNetwork {
  private readonly connections = new Map<string, Connection>();
  private readonly pending = new Map<string, Promise<Connection>>();
  private readonly signalQueues = new Map<string, Promise<void>>();
  private disposed = false;

  constructor(
    private readonly localId: string,
    private readonly transport: SignalTransport,
    private readonly handlers: SessionHandlers | ((remoteId: string) => SessionHandlers),
  ) {}

  static isSupported(): boolean {
    return isWebRtcSupported();
  }

  /** Signal from the server relay; creates the connection when the other side starts it. */
  handleSignal(fromPeerId: string, data: unknown): Promise<void> {
    if (this.disposed || !data || typeof data !== 'object') return Promise.resolve();
    // Process each remote device's signals strictly in arrival order, including while connecting.
    const previous = this.signalQueues.get(fromPeerId) ?? Promise.resolve();
    const next = previous.then(async () => {
      const connection = this.connections.get(fromPeerId) ?? await this.create(fromPeerId);
      await connection.link.handleSignal(data as SignalData);
    }).catch(() => {});
    this.signalQueues.set(fromPeerId, next);
    void next.then(() => { if (this.signalQueues.get(fromPeerId) === next) this.signalQueues.delete(fromPeerId); });
    return next;
  }

  /** An open session with `remoteId`, connecting first when needed. */
  async session(remoteId: string, timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS): Promise<P2PSession> {
    if (this.disposed) throw new Error('Direct connections are closed');
    const connection = this.connections.get(remoteId) ?? await this.create(remoteId);
    connection.link.start();
    await connection.link.waitOpen(timeoutMs);
    return connection.session;
  }

  disconnect(remoteId: string, reason?: string): void {
    this.connections.get(remoteId)?.link.close(reason);
  }

  dispose(): void {
    this.disposed = true;
    for (const connection of [...this.connections.values()]) connection.link.close('Left the room');
    this.connections.clear();
  }

  private create(remoteId: string): Promise<Connection> {
    const existing = this.pending.get(remoteId);
    if (existing) return existing;
    const creating = (async () => {
      const iceServers = await getIceServers();
      const current = this.connections.get(remoteId);
      if (current) return current;
      if (this.disposed) throw new Error('Direct connections are closed');
      let session!: P2PSession;
      const link = new PeerLink({
        localId: this.localId,
        remoteId,
        iceServers,
        sendSignal: data => this.transport.send(remoteId, data),
        onMessage: data => session.handleMessage(data),
        onClose: reason => {
          session.close(reason);
          if (this.connections.get(remoteId)?.link === link) this.connections.delete(remoteId);
        },
      });
      session = new P2PSession(link.channel, typeof this.handlers === 'function' ? this.handlers(remoteId) : this.handlers);
      const connection = { link, session };
      this.connections.set(remoteId, connection);
      return connection;
    })().finally(() => this.pending.delete(remoteId));
    // Every caller awaits the same promise so queued signals keep their arrival order.
    this.pending.set(remoteId, creating);
    return creating;
  }
}
