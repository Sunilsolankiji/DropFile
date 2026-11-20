/**
 * One WebRTC connection to one remote device, using the "perfect negotiation" pattern so either
 * side may start it. A single pre-negotiated, ordered and reliable data channel carries all traffic;
 * SCTP over DTLS already provides integrity, ordering and retransmission.
 */

export interface SignalData {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
}

export interface PeerLinkOptions {
  localId: string;
  remoteId: string;
  iceServers: RTCIceServer[];
  sendSignal: (data: SignalData) => Promise<void> | void;
  onMessage: (data: string | ArrayBuffer) => void;
  onClose: (reason: string) => void;
}

export const DEFAULT_CONNECT_TIMEOUT_MS = 10000;

export class PeerLink {
  readonly remoteId: string;
  readonly channel: RTCDataChannel;
  private readonly pc: RTCPeerConnection;
  private readonly polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;
  private closed = false;
  private negotiationStarted = false;
  private signalQueue: Promise<void> = Promise.resolve();
  private readonly openPromise: Promise<void>;

  constructor(private readonly options: PeerLinkOptions) {
    this.remoteId = options.remoteId;
    // Exactly one side must yield when both start negotiating at once.
    this.polite = options.localId > options.remoteId;
    this.pc = new RTCPeerConnection({ iceServers: options.iceServers });
    this.channel = this.pc.createDataChannel('dropfile', { negotiated: true, id: 0, ordered: true });
    this.channel.binaryType = 'arraybuffer';

    this.openPromise = new Promise((resolve, reject) => {
      if (this.channel.readyState === 'open') resolve();
      this.channel.addEventListener('open', () => resolve(), { once: true });
      this.channel.addEventListener('close', () => reject(new Error('Direct connection closed')), { once: true });
    });
    this.openPromise.catch(() => {});

    this.channel.addEventListener('message', event => this.options.onMessage(event.data as string | ArrayBuffer));
    this.channel.addEventListener('close', () => this.close('Direct connection closed'));

    this.pc.addEventListener('negotiationneeded', () => {
      // Fallback only: the initiating side calls start(). Browsers may delay this event in
      // background pages, and the responder must never send a competing offer.
      if (!this.negotiationStarted) void this.negotiate();
    });
    this.pc.addEventListener('icecandidate', ({ candidate }) => {
      void this.signal({ candidate: candidate ? candidate.toJSON() : null });
    });
    this.pc.addEventListener('connectionstatechange', () => {
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        this.close(this.pc.connectionState === 'failed' ? 'Direct connection failed' : 'Direct connection closed');
      }
    });
  }

  get isOpen(): boolean {
    return !this.closed && this.channel.readyState === 'open';
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Send the offer now (initiating side) instead of waiting for `negotiationneeded`. */
  start(): void {
    if (!this.negotiationStarted && !this.closed) void this.negotiate();
  }

  /**
   * Resolve when the data channel is open, or reject after `timeoutMs` (e.g. AP/client isolation
   * on guest Wi-Fi prevents devices from reaching each other).
   */
  waitOpen(timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS): Promise<void> {
    if (this.isOpen) return Promise.resolve();
    if (this.closed) return Promise.reject(new Error('Direct connection closed'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Could not connect directly. The devices may not be able to reach each other on this network.'));
        this.close('Direct connection timed out');
      }, timeoutMs);
      this.openPromise.then(() => { clearTimeout(timer); resolve(); }, error => { clearTimeout(timer); reject(error); });
    });
  }

  async handleSignal(data: SignalData): Promise<void> {
    // Signals must be applied strictly in arrival order: a candidate processed before its offer fails.
    const next = this.signalQueue.then(() => this.applySignal(data));
    this.signalQueue = next.catch(() => {});
    return next;
  }

  private async applySignal(data: SignalData): Promise<void> {
    if (this.closed) return;
    try {
      if (data.description) {
        const description = data.description;
        if (description.type === 'offer') this.negotiationStarted = true;
        const collision = description.type === 'offer' && (this.makingOffer || this.pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;
        await this.pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await this.pc.setLocalDescription();
          await this.signal({ description: this.pc.localDescription?.toJSON() });
        }
      } else if (data.candidate !== undefined) {
        try {
          await this.pc.addIceCandidate(data.candidate ?? undefined);
        } catch {
          // A stale or ignored candidate is harmless; the remaining candidates can still connect.
        }
      }
    } catch (error) {
      this.close(error instanceof Error ? error.message : 'Direct connection negotiation failed');
    }
  }

  send(data: string | ArrayBuffer): void {
    if (!this.isOpen) throw new Error('Direct connection is not open');
    this.channel.send(data as ArrayBuffer);
  }

  close(reason = 'Direct connection closed'): void {
    if (this.closed) return;
    this.closed = true;
    try { this.channel.close(); } catch { /* already closed */ }
    try { this.pc.close(); } catch { /* already closed */ }
    this.options.onClose(reason);
  }

  private async negotiate() {
    if (this.negotiationStarted || this.closed) return;
    this.negotiationStarted = true;
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      await this.signal({ description: this.pc.localDescription?.toJSON() });
    } catch (error) {
      this.close(error instanceof Error ? error.message : 'Direct connection negotiation failed');
    } finally {
      this.makingOffer = false;
    }
  }

  private async signal(data: SignalData) {
    if (this.closed) return;
    try {
      await this.options.sendSignal(data);
    } catch (error) {
      this.close(error instanceof Error ? error.message : 'Signaling failed');
    }
  }
}
