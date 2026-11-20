/**
 * File transfer protocol over one ordered, reliable WebRTC data channel.
 *
 * Control messages are JSON strings. File bytes travel as binary frames: a 4-byte big-endian
 * stream tag followed by up to FRAME_DATA_BYTES of data. Frames of one stream arrive in order, so
 * the receiver appends them without per-frame indexes. Frames stay below 64 KiB, the largest message
 * size every browser accepts. The sender pauses when the channel buffer is full (backpressure).
 */

export const FRAME_HEADER_BYTES = 4;
export const FRAME_DATA_BYTES = 60 * 1024;
const HIGH_WATER_BYTES = 8 * 1024 * 1024;
const LOW_WATER_BYTES = 1024 * 1024;
const READ_SLAB_BYTES = 1024 * 1024;
const FLUSH_BYTES = 8 * 1024 * 1024;
const PROGRESS_STEP_BYTES = 512 * 1024;

export interface P2PChannel {
  send(data: string | ArrayBuffer): void;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  addEventListener(type: 'bufferedamountlow', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'bufferedamountlow', listener: () => void): void;
}

export interface FileInfo {
  name: string;
  size: number;
  type: string;
}

export interface IncomingFile extends FileInfo {
  id: string;
  fileId?: string;
}

export interface SessionHandlers {
  /** Room downloads: return the local source for a shared file, or null when unavailable here. */
  resolveRequest?: (fileId: string) => File | null | undefined;
  /** Nearby sharing: ask the user whether to accept an offered file. */
  onOffer?: (offer: IncomingFile) => Promise<boolean>;
  onIncomingProgress?: (offer: IncomingFile, bytes: number) => void;
  onIncomingComplete?: (offer: IncomingFile, blob: Blob) => void;
  onIncomingFailed?: (offer: IncomingFile, reason: string) => void;
  /** Progress of a file this device serves in response to a request (room sender side). */
  onServeProgress?: (fileId: string, bytes: number, size: number, done: boolean) => void;
}

type Control =
  | { t: 'request'; id: string; fileId: string }
  | { t: 'start'; id: string; tag: number; name: string; size: number; type: string }
  | { t: 'unavailable'; id: string; reason: string }
  | { t: 'offer'; id: string; tag: number; name: string; size: number; type: string }
  | { t: 'accept'; id: string }
  | { t: 'decline'; id: string; reason?: string }
  | { t: 'progress'; id: string; bytes: number }
  | { t: 'done'; id: string }
  | { t: 'received'; id: string }
  | { t: 'cancel'; id: string; reason?: string };

interface Outgoing {
  id: string;
  tag: number;
  file: File;
  fileId?: string;
  controller: AbortController;
  accepted?: { resolve: () => void; reject: (error: Error) => void };
  done: { resolve: () => void; reject: (error: Error) => void };
  onProgress?: (bytes: number) => void;
}

interface Incoming {
  info: IncomingFile;
  tag: number;
  parts: Blob[];
  pending: Uint8Array[];
  pendingBytes: number;
  bytes: number;
  reportedBytes: number;
  requested?: { resolve: (blob: Blob) => void; reject: (error: Error) => void; onProgress?: (bytes: number, size: number) => void };
}

interface PendingRequest {
  fileId: string;
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  onProgress?: (bytes: number, size: number) => void;
}

export class TransferCancelledError extends Error {}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isInfo(message: { name?: unknown; size?: unknown; type?: unknown }): boolean {
  return typeof message.name === 'string' && message.name.length > 0 && message.name.length <= 255
    && Number.isSafeInteger(message.size) && (message.size as number) >= 0 && typeof message.type === 'string';
}

export class P2PSession {
  private nextTag = 1;
  private closed = false;
  private readonly outgoing = new Map<string, Outgoing>();
  private readonly incomingByTag = new Map<number, Incoming>();
  private readonly incomingById = new Map<string, Incoming>();
  private readonly requests = new Map<string, PendingRequest>();
  private readonly bufferWaiters = new Set<() => void>();

  constructor(private readonly channel: P2PChannel, private readonly handlers: SessionHandlers = {}) {
    channel.bufferedAmountLowThreshold = LOW_WATER_BYTES;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Pull a shared file from the remote device (room download). */
  requestFile(fileId: string, onProgress?: (bytes: number, size: number) => void, signal?: AbortSignal): Promise<Blob> {
    if (this.closed) return Promise.reject(new Error('Direct connection closed'));
    const id = newId();
    return new Promise<Blob>((resolve, reject) => {
      const abort = () => this.cancel(id, 'Cancelled');
      signal?.addEventListener('abort', abort, { once: true });
      const cleanup = () => signal?.removeEventListener('abort', abort);
      this.requests.set(id, {
        fileId,
        onProgress,
        resolve: blob => { cleanup(); resolve(blob); },
        reject: error => { cleanup(); reject(error); },
      });
      this.sendControl({ t: 'request', id, fileId });
    });
  }

  /** Push a file to the remote device, which must accept it first (nearby sharing). */
  async offerFile(file: File, onProgress?: (bytes: number) => void, signal?: AbortSignal): Promise<void> {
    if (this.closed) throw new Error('Direct connection closed');
    const id = newId();
    const outgoing = this.createOutgoing(id, file, onProgress);
    const abort = () => this.cancel(id, 'Cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const accepted = new Promise<void>((resolve, reject) => { outgoing.accepted = { resolve, reject }; });
      const done = this.donePromise(outgoing);
      this.sendControl({ t: 'offer', id, tag: outgoing.tag, name: file.name, size: file.size, type: file.type || 'application/octet-stream' });
      await accepted;
      await this.stream(outgoing);
      await done;
    } finally {
      signal?.removeEventListener('abort', abort);
      this.outgoing.delete(id);
    }
  }

  cancel(id: string, reason = 'Cancelled'): void {
    const error = new TransferCancelledError(reason);
    let known = false;
    const outgoing = this.outgoing.get(id);
    if (outgoing) {
      known = true;
      this.failOutgoing(outgoing, error);
    }
    const incoming = this.incomingById.get(id);
    if (incoming) {
      known = true;
      this.failIncoming(incoming, error);
    }
    const request = this.requests.get(id);
    if (request) {
      known = true;
      this.requests.delete(id);
      request.reject(error);
    }
    if (known && !this.closed) this.sendControl({ t: 'cancel', id, reason });
  }

  close(reason = 'Direct connection closed'): void {
    if (this.closed) return;
    this.closed = true;
    const error = new Error(reason);
    for (const outgoing of [...this.outgoing.values()]) this.failOutgoing(outgoing, error);
    for (const incoming of [...this.incomingById.values()]) this.failIncoming(incoming, error);
    for (const [id, request] of this.requests) { this.requests.delete(id); request.reject(error); }
    for (const wake of this.bufferWaiters) wake();
  }

  handleMessage(data: string | ArrayBuffer | ArrayBufferView): void {
    if (this.closed) return;
    if (typeof data === 'string') {
      let message: Control;
      try {
        message = JSON.parse(data) as Control;
      } catch {
        return;
      }
      if (message && typeof message === 'object' && typeof message.id === 'string') void this.handleControl(message);
      return;
    }
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.handleFrame(bytes);
  }

  private sendControl(message: Control) {
    if (this.closed) return;
    try {
      this.channel.send(JSON.stringify(message));
    } catch (error) {
      this.close(error instanceof Error ? error.message : 'Direct connection failed');
    }
  }

  private createOutgoing(id: string, file: File, onProgress?: (bytes: number) => void, fileId?: string): Outgoing {
    const outgoing: Outgoing = {
      id, tag: this.nextTag++, file, fileId, controller: new AbortController(), onProgress,
      done: { resolve: () => {}, reject: () => {} },
    };
    this.outgoing.set(id, outgoing);
    return outgoing;
  }

  private donePromise(outgoing: Outgoing): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => { outgoing.done = { resolve, reject }; });
    promise.catch(() => {});
    return promise;
  }

  private failOutgoing(outgoing: Outgoing, error: Error) {
    this.outgoing.delete(outgoing.id);
    outgoing.controller.abort(error);
    outgoing.accepted?.reject(error);
    outgoing.done.reject(error);
    if (outgoing.fileId) this.handlers.onServeProgress?.(outgoing.fileId, 0, outgoing.file.size, true);
  }

  private failIncoming(incoming: Incoming, error: Error) {
    this.incomingById.delete(incoming.info.id);
    this.incomingByTag.delete(incoming.tag);
    incoming.parts = [];
    incoming.pending = [];
    if (incoming.requested) incoming.requested.reject(error);
    else this.handlers.onIncomingFailed?.(incoming.info, error.message);
  }

  private async handleControl(message: Control) {
    switch (message.t) {
      case 'request': {
        if (typeof message.fileId !== 'string') return;
        const file = this.handlers.resolveRequest?.(message.fileId);
        if (!file) {
          this.sendControl({ t: 'unavailable', id: message.id, reason: 'The sender cannot share this file directly right now.' });
          return;
        }
        const outgoing = this.createOutgoing(message.id, file, bytes => {
          this.handlers.onServeProgress?.(message.fileId, bytes, file.size, false);
        }, message.fileId);
        const done = this.donePromise(outgoing);
        this.sendControl({ t: 'start', id: message.id, tag: outgoing.tag, name: file.name, size: file.size, type: file.type || 'application/octet-stream' });
        try {
          await this.stream(outgoing);
          await done;
          this.handlers.onServeProgress?.(message.fileId, file.size, file.size, true);
        } catch {
          // Failure is reported through cancel/close; the requester falls back to the relay.
        } finally {
          this.outgoing.delete(message.id);
        }
        return;
      }
      case 'start': {
        const request = this.requests.get(message.id);
        if (!request) return;
        this.requests.delete(message.id);
        if (!isInfo(message) || !Number.isSafeInteger(message.tag)) {
          request.reject(new Error('Invalid direct transfer metadata'));
          return;
        }
        const incoming: Incoming = {
          info: { id: message.id, fileId: request.fileId, name: message.name, size: message.size, type: message.type },
          tag: message.tag, parts: [], pending: [], pendingBytes: 0, bytes: 0, reportedBytes: 0,
          requested: { resolve: request.resolve, reject: request.reject, onProgress: request.onProgress },
        };
        this.incomingById.set(message.id, incoming);
        this.incomingByTag.set(message.tag, incoming);
        return;
      }
      case 'unavailable': {
        const request = this.requests.get(message.id);
        if (!request) return;
        this.requests.delete(message.id);
        request.reject(new Error(typeof message.reason === 'string' ? message.reason : 'File unavailable'));
        return;
      }
      case 'offer': {
        if (!isInfo(message) || !Number.isSafeInteger(message.tag)) return;
        const info: IncomingFile = { id: message.id, name: message.name, size: message.size, type: message.type };
        const incoming: Incoming = { info, tag: message.tag, parts: [], pending: [], pendingBytes: 0, bytes: 0, reportedBytes: 0 };
        this.incomingById.set(message.id, incoming);
        let accepted = false;
        try {
          accepted = (await this.handlers.onOffer?.(info)) === true;
        } catch {
          accepted = false;
        }
        if (this.closed || !this.incomingById.has(message.id)) return;
        if (!accepted) {
          this.incomingById.delete(message.id);
          this.sendControl({ t: 'decline', id: message.id });
          return;
        }
        this.incomingByTag.set(message.tag, incoming);
        this.sendControl({ t: 'accept', id: message.id });
        if (info.size === 0) this.handlers.onIncomingProgress?.(info, 0);
        return;
      }
      case 'accept':
        this.outgoing.get(message.id)?.accepted?.resolve();
        return;
      case 'decline': {
        const outgoing = this.outgoing.get(message.id);
        if (outgoing) this.failOutgoing(outgoing, new TransferCancelledError(message.reason || 'The other device declined the file.'));
        return;
      }
      case 'progress': {
        const outgoing = this.outgoing.get(message.id);
        if (outgoing && Number.isSafeInteger(message.bytes)) outgoing.onProgress?.(Math.min(message.bytes, outgoing.file.size));
        return;
      }
      case 'done': {
        const incoming = this.incomingById.get(message.id);
        if (!incoming) return;
        if (incoming.bytes !== incoming.info.size) {
          this.failIncoming(incoming, new Error('Direct transfer ended early'));
          this.sendControl({ t: 'cancel', id: message.id, reason: 'Incomplete transfer' });
          return;
        }
        this.incomingById.delete(message.id);
        this.incomingByTag.delete(incoming.tag);
        const blob = new Blob([...incoming.parts, ...incoming.pending as BlobPart[]], { type: incoming.info.type || 'application/octet-stream' });
        this.sendControl({ t: 'received', id: message.id });
        if (incoming.requested) {
          incoming.requested.onProgress?.(incoming.info.size, incoming.info.size);
          incoming.requested.resolve(blob);
        } else {
          this.handlers.onIncomingProgress?.(incoming.info, incoming.info.size);
          this.handlers.onIncomingComplete?.(incoming.info, blob);
        }
        return;
      }
      case 'received': {
        const outgoing = this.outgoing.get(message.id);
        if (!outgoing) return;
        outgoing.onProgress?.(outgoing.file.size);
        outgoing.done.resolve();
        return;
      }
      case 'cancel': {
        const reason = typeof message.reason === 'string' && message.reason ? message.reason : 'The other device cancelled the transfer.';
        const error = new TransferCancelledError(reason);
        const outgoing = this.outgoing.get(message.id);
        if (outgoing) this.failOutgoing(outgoing, error);
        const incoming = this.incomingById.get(message.id);
        if (incoming) this.failIncoming(incoming, error);
        const request = this.requests.get(message.id);
        if (request) { this.requests.delete(message.id); request.reject(error); }
        return;
      }
    }
  }

  private handleFrame(bytes: Uint8Array) {
    if (bytes.byteLength < FRAME_HEADER_BYTES) return;
    const tag = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    const incoming = this.incomingByTag.get(tag);
    if (!incoming) return;
    const data = bytes.slice(FRAME_HEADER_BYTES);
    incoming.bytes += data.byteLength;
    if (incoming.bytes > incoming.info.size) {
      this.failIncoming(incoming, new Error('Direct transfer sent more data than announced'));
      this.sendControl({ t: 'cancel', id: incoming.info.id, reason: 'Unexpected data' });
      return;
    }
    incoming.pending.push(data);
    incoming.pendingBytes += data.byteLength;
    // Compose large Blobs incrementally so browsers can page received data to disk.
    if (incoming.pendingBytes >= FLUSH_BYTES) {
      incoming.parts.push(new Blob(incoming.pending as BlobPart[]));
      incoming.pending = [];
      incoming.pendingBytes = 0;
    }
    if (incoming.bytes - incoming.reportedBytes >= PROGRESS_STEP_BYTES) {
      incoming.reportedBytes = incoming.bytes;
      this.sendControl({ t: 'progress', id: incoming.info.id, bytes: incoming.bytes });
      if (incoming.requested) incoming.requested.onProgress?.(incoming.bytes, incoming.info.size);
      else this.handlers.onIncomingProgress?.(incoming.info, incoming.bytes);
    }
  }

  private waitForBuffer(signal: AbortSignal): Promise<void> {
    if (this.channel.bufferedAmount <= HIGH_WATER_BYTES) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = () => {
        this.channel.removeEventListener('bufferedamountlow', finish);
        this.bufferWaiters.delete(finish);
        signal.removeEventListener('abort', finish);
        if (signal.aborted) reject(signal.reason);
        else if (this.closed) reject(new Error('Direct connection closed'));
        else resolve();
      };
      this.bufferWaiters.add(finish);
      signal.addEventListener('abort', finish, { once: true });
      this.channel.addEventListener('bufferedamountlow', finish, { once: true });
    });
  }

  private async stream(outgoing: Outgoing) {
    const { file, controller, tag } = outgoing;
    const signal = controller.signal;
    for (let offset = 0; offset < file.size; offset += READ_SLAB_BYTES) {
      signal.throwIfAborted();
      const slab = new Uint8Array(await file.slice(offset, Math.min(offset + READ_SLAB_BYTES, file.size)).arrayBuffer());
      for (let position = 0; position < slab.byteLength; position += FRAME_DATA_BYTES) {
        await this.waitForBuffer(signal);
        signal.throwIfAborted();
        if (this.closed) throw new Error('Direct connection closed');
        const part = slab.subarray(position, Math.min(position + FRAME_DATA_BYTES, slab.byteLength));
        const frame = new Uint8Array(FRAME_HEADER_BYTES + part.byteLength);
        new DataView(frame.buffer).setUint32(0, tag);
        frame.set(part, FRAME_HEADER_BYTES);
        this.channel.send(frame.buffer);
      }
    }
    signal.throwIfAborted();
    this.sendControl({ t: 'done', id: outgoing.id });
  }
}
