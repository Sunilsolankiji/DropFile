import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  DEFAULT_CHUNK_SIZE, TRANSFER_CONCURRENCY, MAX_FILE_SIZE, DEFAULT_FILE_TYPE,
  type ShareMetadata, type TransferClient, type TransferPhase, type TransferRecord,
  type TransferSnapshot, type TransferState, type TransferStorage, type TransferUpdate,
} from './transfer-types';

interface Entry {
  record: TransferRecord;
  source?: File;
  controller?: AbortController;
  task?: Promise<void>;
  received: Set<number>;
  inFlight: Set<number>;
  failed: Set<number>;
  writes: Set<Promise<void>>;
  remoteUploaded: number;
  remoteAcknowledged: number;
  purged: boolean;
  restartRequested: boolean;
  snapshotReceived: boolean;
}

interface ManagerOptions {
  onChange: (transfers: TransferState[], localShares: ShareMetadata[]) => void;
  onError: (message: string) => void;
  fetch?: typeof fetch;
  saveDownload?: (file: ShareMetadata, blob: Blob) => void;
}

const terminal = new Set<TransferPhase>(['completed', 'cancelled', 'expired', 'removed', 'sender-timeout']);
const stopped = new Set<TransferPhase>([...terminal, 'failed', 'offline', 'sender-offline', 'receiver-offline']);

class TransferFailure extends Error {
  constructor(message: string, readonly phase: TransferPhase = 'failed', readonly discard = false) {
    super(message);
  }
}

function phase(value: string): TransferPhase {
  switch (value) {
    case 'pending': case 'ready': case 'transferring': case 'completed':
    case 'cancelled': case 'expired': case 'removed': case 'failed':
    case 'sender-offline': case 'sender-timeout': case 'receiver-offline':
      return value;
    default:
      throw new TransferFailure(`Unsupported transfer state "${value}". Update the client or share this file again.`);
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function indexes(values: number[], total: number): number[] {
  if (!Array.isArray(values) || values.some(index => !Number.isInteger(index) || index < 0 || index >= total)) {
    throw new TransferFailure('The server returned invalid chunk indexes.', 'failed', true);
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

function validateLayout(file: ShareMetadata) {
  if (!Number.isSafeInteger(file.size) || file.size < 0
    || !Number.isSafeInteger(file.chunkSize) || file.chunkSize <= 0
    || file.totalChunks !== Math.ceil(file.size / file.chunkSize)
    || !Number.isFinite(file.expiresAt)) {
    throw new TransferFailure('The server returned inconsistent file/chunk metadata.', 'failed', true);
  }
}

async function chunkHash(blob: Blob): Promise<string> {
  return bytesToHex(sha256(new Uint8Array(await blob.arrayBuffer())));
}

function verifyHash(actual: string, expected: string) {
  const digest = expected.trim().replace(/^sha256[:=]/i, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new TransferFailure('Unsupported chunk hash. Expected a SHA-256 hexadecimal digest.', 'failed', true);
  if (actual !== digest) throw new TransferFailure('File integrity check failed. Ask the sender to share the original file again.', 'failed', true);
}

function saveDownload(file: ShareMetadata, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export class TransferManager {
  private entries = new Map<string, Entry>();
  private removedFiles = new Set<string>();
  private connected = false;
  private disposed = false;
  private activeHttp = 0;
  private slotWaiters = new Set<() => void>();
  private readonly fetcher: typeof fetch;
  private readonly download: (file: ShareMetadata, blob: Blob) => void;
  private readonly expiryTimer: ReturnType<typeof setInterval>;

  constructor(private readonly client: TransferClient, private readonly storage: TransferStorage, private readonly options: ManagerOptions) {
    this.fetcher = options.fetch || globalThis.fetch.bind(globalThis);
    this.download = options.saveDownload || saveDownload;
    this.expiryTimer = setInterval(() => {
      for (const entry of this.entries.values()) {
        if (!terminal.has(entry.record.state) && entry.record.file.expiresAt <= Date.now()) {
          this.stop(entry, 'expired', 'This transfer expired. Ask the sender to share the file again.');
        }
      }
    }, 1000);
  }

  async restore(): Promise<void> {
    const records = await this.storage.list(this.client.getRoomCode(), this.client.getPeerId());
    if (this.disposed) return;
    for (const record of records) {
      validateLayout(record.file);
      const entry = this.addEntry(record);
      entry.received = new Set(indexes(await this.storage.chunkIndexes(record.transferId), record.file.totalChunks));
      if (this.disposed) return;
      if (record.file.expiresAt <= Date.now()) this.stop(entry, 'expired', 'This transfer has expired.');
    }
    this.emit();
  }

  private addEntry(record: TransferRecord): Entry {
    const existing = this.entries.get(record.transferId);
    if (existing) return existing;
    const entry: Entry = {
      record, received: new Set(), inFlight: new Set(), failed: new Set(), writes: new Set(),
      remoteUploaded: record.uploadedChunks.length, remoteAcknowledged: record.acknowledgedChunks.length, purged: false,
      restartRequested: false, snapshotReceived: false,
    };
    this.entries.set(record.transferId, entry);
    return entry;
  }

  private emit() {
    if (this.disposed) return;
    this.options.onChange([...this.entries.values()].map(entry => ({
      transferId: entry.record.transferId,
      fileId: entry.record.fileId,
      role: entry.record.role,
      state: entry.record.state,
      paused: entry.record.paused,
      needsSource: entry.record.role === 'sender' && !entry.source && !terminal.has(entry.record.state)
        && (!entry.snapshotReceived || new Set([...entry.record.uploadedChunks, ...entry.record.acknowledgedChunks]).size < entry.record.file.totalChunks),
      canResume: !entry.purged && !terminal.has(entry.record.state),
      uploadedChunkCount: Math.min(entry.record.file.totalChunks, Math.max(entry.remoteUploaded, new Set([...entry.record.uploadedChunks, ...entry.record.acknowledgedChunks]).size)),
      acknowledgedChunkCount: Math.min(entry.record.file.totalChunks, Math.max(entry.remoteAcknowledged, entry.record.acknowledgedChunks.length)),
      receivedChunkCount: entry.received.size,
      totalChunks: entry.record.file.totalChunks,
      chunkSize: entry.record.file.chunkSize,
      inFlightChunks: [...entry.inFlight],
      failedChunks: [...entry.failed],
      senderConnected: entry.record.senderConnected,
      receiverConnected: entry.record.receiverConnected,
      receiverPeerId: entry.record.receiverPeerId,
      cancelReason: entry.record.cancelReason,
      error: entry.record.error,
    })), [...this.entries.values()].filter(entry => entry.record.state !== 'removed').map(entry => entry.record.file));
  }

  private write(entry: Entry, operation: () => Promise<void>): Promise<void> {
    const work = operation();
    entry.writes.add(work);
    return work.finally(() => entry.writes.delete(work));
  }

  private persist(entry: Entry): Promise<void> {
    if (entry.purged) return Promise.resolve();
    return this.write(entry, () => this.storage.save(structuredClone(entry.record)));
  }

  private async purge(entry: Entry) {
    entry.purged = true;
    const results = await Promise.allSettled([...entry.writes]);
    for (const result of results) if (result.status === 'rejected') this.options.onError(`Could not persist transfer data: ${String(result.reason)}`);
    await this.storage.delete(entry.record.transferId);
    entry.source = undefined;
  }

  private report(error: unknown, entry?: Entry) {
    if (this.disposed || (entry && terminal.has(entry.record.state))) return;
    const message = error instanceof Error ? error.message : 'Transfer failed. Please try again.';
    if (entry) {
      entry.record.error = message;
      entry.record.state = error instanceof TransferFailure ? error.phase : 'failed';
      entry.controller?.abort();
      if (error instanceof TransferFailure && error.discard) {
        void this.purge(entry).catch(storageError => this.options.onError(`Could not clear transfer data: ${String(storageError)}`));
      }
      this.emit();
    }
    this.options.onError(message);
  }

  private stop(entry: Entry, state: TransferPhase, reason?: string) {
    entry.record.state = state;
    entry.record.cancelReason = reason;
    entry.controller?.abort();
    entry.record.error = state === 'completed' ? undefined : reason;
    this.emit();
    if (terminal.has(state)) {
      void this.purge(entry).catch(error => this.report(error));
    }
  }

  syncFiles(files: ShareMetadata[]) {
    for (const file of files) {
      const entry = this.entries.get(file.transferId);
      if (entry && entry.record.fileId === file.id) {
        entry.record.file = { ...entry.record.file, ...file };
      }
    }
    this.emit();
  }

  removeMissingFiles(files: ShareMetadata[]) {
    const ids = new Set(files.map(file => file.id));
    for (const entry of this.entries.values()) {
      if (!ids.has(entry.record.fileId)) this.removeFile(entry.record.fileId);
    }
  }

  removeFile(fileId: string) {
    this.removedFiles.add(fileId);
    for (const entry of this.entries.values()) {
      if (entry.record.fileId === fileId) this.stop(entry, 'removed', 'The sender removed this file.');
    }
  }

  setConnected(connected: boolean) {
    this.connected = connected;
    for (const entry of this.entries.values()) {
      if (!connected) {
        entry.controller?.abort();
        if (!terminal.has(entry.record.state) && entry.record.state !== 'failed') entry.record.state = 'offline';
      } else if (entry.record.cancelPending) {
        void this.cancel(entry.record.transferId);
      } else if (!terminal.has(entry.record.state) && entry.record.state !== 'failed') {
        this.launch(entry);
      }
    }
    this.emit();
  }

  handleUpdate(update: TransferUpdate, completed = false) {
    const entry = this.entries.get(update.transferId);
    if (!entry || entry.record.fileId !== update.fileId || terminal.has(entry.record.state)) return;
    entry.remoteUploaded = update.status.uploadedChunks;
    entry.remoteAcknowledged = update.status.acknowledgedChunks;
    entry.record.senderConnected = update.status.senderConnected;
    entry.record.receiverConnected = update.status.receiverConnected;
    entry.record.receiverPeerId = update.status.receiverPeerId;
    try {
      const next = completed ? 'completed' : phase(update.status.state);
      if (next === 'completed') {
        if (entry.record.role === 'sender') this.stop(entry, 'completed');
        // A server completion is not proof that this browser has assembled its durable chunks.
        else if (!entry.record.paused) this.launch(entry);
      } else if (terminal.has(next)) {
        this.stop(entry, next, update.reason || `Transfer ${next}.`);
      } else if (next === 'sender-offline' || update.status.senderConnected === false) {
        entry.record.state = 'sender-offline';
        entry.record.error = update.reason || 'The sender is offline. Resume when the sender reconnects.';
        entry.controller?.abort();
      } else if (next === 'receiver-offline' || (update.status.receiverConnected === false && !!update.status.receiverPeerId)) {
        entry.record.state = 'receiver-offline';
        entry.record.error = update.reason || 'The receiver is offline. Resume when the receiver reconnects.';
        entry.controller?.abort();
      } else if (entry.record.state === 'sender-offline' && update.status.senderConnected === true) {
        entry.record.state = next;
        entry.record.error = undefined;
        this.launch(entry);
      } else if (entry.record.state === 'receiver-offline' && update.status.receiverConnected === true) {
        entry.record.state = next;
        entry.record.error = undefined;
        this.launch(entry);
      }
      this.emit();
    } catch (error) {
      this.report(error, entry);
    }
  }

  async upload(file: File): Promise<boolean> {
    let entry: Entry | undefined;
    try {
      if (!this.connected || !this.client.isConnected()) throw new TransferFailure('Connect to the room before sharing a file.');
      if (file.size > MAX_FILE_SIZE) throw new TransferFailure('Files must be 1 GB or smaller.');
      const type = file.type || DEFAULT_FILE_TYPE;
      const created = await this.client.createFileShare({
        name: file.name, size: file.size, type,
        chunkSize: DEFAULT_CHUNK_SIZE, totalChunks: Math.ceil(file.size / DEFAULT_CHUNK_SIZE),
      });
      if (this.disposed) return false;
      if (this.removedFiles.has(created.fileId)) throw new TransferFailure('This share was removed before uploading could start.', 'removed');
      const metadata: ShareMetadata = {
        id: created.fileId, transferId: created.transferId, name: file.name, size: file.size, type,
        peerId: this.client.getPeerId(), peerName: this.client.getPeerName(), roomCode: this.client.getRoomCode(),
        expiresAt: created.expiresAt, uploadedAt: Date.now(), chunkSize: created.chunkSize, totalChunks: created.totalChunks,
        status: 'pending',
      };
      validateLayout(metadata);
      entry = this.addEntry({
        transferId: created.transferId, fileId: created.fileId, roomCode: metadata.roomCode, peerId: metadata.peerId,
        file: metadata, role: 'sender', state: 'pending', paused: false, uploadedChunks: [], acknowledgedChunks: [],
        uploadUrlTemplate: created.uploadUrlTemplate, sourceLastModified: file.lastModified,
      });
      entry.source = file;
      await this.persist(entry);
      this.emit();
      this.launch(entry);
      return true;
    } catch (error) {
      this.report(error, entry);
      return false;
    }
  }

  async startDownload(file: ShareMetadata): Promise<boolean> {
    let entry: Entry | undefined;
    try {
      if (!this.connected) throw new TransferFailure('Reconnect before starting a download.');
      validateLayout(file);
      if (file.expiresAt <= Date.now()) throw new TransferFailure('This file has expired.', 'expired');
      entry = [...this.entries.values()].find(item => item.record.fileId === file.id && item.record.role === 'receiver');
      if (entry) return this.resume(entry.record.transferId);
      const started = await this.client.startTransfer(file.id);
      if (this.disposed) return false;
      if (this.removedFiles.has(file.id)) throw new TransferFailure('This share was removed before downloading could start.', 'removed');
      if (started.fileId !== file.id || started.chunkSize !== file.chunkSize || started.totalChunks !== file.totalChunks) {
        throw new TransferFailure('The transfer layout does not match the shared file.', 'failed', true);
      }
      const initialState = phase(started.state);
      entry = this.addEntry({
        transferId: started.transferId, fileId: file.id, roomCode: file.roomCode, peerId: this.client.getPeerId(),
        file: { ...file, transferId: started.transferId }, role: 'receiver',
        state: initialState === 'completed' ? 'transferring' : 'pending', paused: false,
        uploadedChunks: indexes(started.uploadedChunks, file.totalChunks),
        acknowledgedChunks: indexes(started.acknowledgedChunks, file.totalChunks),
        downloadUrlTemplate: started.downloadUrlTemplate,
      });
      if (stopped.has(initialState) && initialState !== 'completed') {
        throw new TransferFailure(`Transfer ${initialState}. Reconnect or ask the sender to share the file again.`, initialState, terminal.has(initialState));
      }
      entry.received = new Set(indexes(await this.storage.chunkIndexes(started.transferId), file.totalChunks));
      await this.persist(entry);
      this.launch(entry);
      return true;
    } catch (error) {
      this.report(error, entry);
      return false;
    }
  }

  pause(transferId: string) {
    const entry = this.entries.get(transferId);
    if (!entry || terminal.has(entry.record.state)) return;
    entry.record.paused = true;
    entry.controller?.abort();
    this.emit();
    void this.persist(entry).catch(error => this.report(error, entry));
  }

  async resume(transferId: string): Promise<boolean> {
    const entry = this.entries.get(transferId);
    if (!entry) { this.report(new Error('This transfer is no longer available.')); return false; }
    try {
      if (terminal.has(entry.record.state)) throw new TransferFailure(`Cannot resume a ${entry.record.state} transfer.`);
      if (entry.purged) throw new TransferFailure('Local transfer data was cleared. Ask the sender to share this file again.');
      if (!this.connected) throw new TransferFailure('Reconnect before resuming this transfer.');
      entry.record.paused = false;
      entry.record.error = undefined;
      entry.failed.clear();
      await this.persist(entry);
      this.launch(entry);
      return true;
    } catch (error) {
      this.report(error);
      return false;
    }
  }

  async attachSource(transferId: string, file: File): Promise<boolean> {
    const entry = this.entries.get(transferId);
    if (!entry || entry.record.role !== 'sender') { this.report(new Error('The sender transfer is unavailable.')); return false; }
    try {
      if (terminal.has(entry.record.state)) throw new TransferFailure('This transfer is no longer active.');
      const original = entry.record.file;
      if (file.name !== original.name || file.size !== original.size
        || (entry.record.sourceLastModified !== undefined && file.lastModified !== entry.record.sourceLastModified)) {
        throw new TransferFailure('Choose the original, unchanged file with the same name, size, and modification time.');
      }
      if (entry.task) await entry.task;
      entry.source = file;
      return await this.resume(transferId);
    } catch (error) {
      this.report(error, entry);
      return false;
    }
  }

  async cancel(transferId: string): Promise<boolean> {
    const entry = this.entries.get(transferId);
    if (!entry) { this.report(new Error('This transfer is no longer available.')); return false; }
    entry.controller?.abort();
    entry.record.state = 'cancelled';
    entry.record.paused = true;
    entry.record.cancelReason = 'Cancelled on this device.';
    entry.record.cancelPending = true;
    this.emit();
    try {
      await this.persist(entry);
      if (!this.connected) {
        entry.record.error = 'Stopped locally. Cancellation will be sent when you reconnect.';
        this.emit();
        return true;
      }
      await this.client.cancelTransfer(transferId, 'Cancelled by user');
      const snapshot = await this.client.getTransferState(transferId);
      if (!['cancelled', 'removed', 'expired', 'completed'].includes(snapshot.state)) {
        throw new Error('The server has not confirmed cancellation. Reconnect and cancel again.');
      }
      entry.record.cancelPending = false;
      entry.record.error = undefined;
      await this.purge(entry);
      this.emit();
      return true;
    } catch (error) {
      entry.record.error = `Stopped locally; could not confirm cancellation: ${error instanceof Error ? error.message : String(error)}`;
      this.options.onError(entry.record.error);
      this.emit();
      return false;
    }
  }

  private launch(entry: Entry) {
    if (this.disposed || !this.connected || entry.record.cancelPending || entry.purged) return;
    if (entry.task) {
      if (entry.controller?.signal.aborted) entry.restartRequested = true;
      return;
    }
    const controller = new AbortController();
    entry.controller = controller;
    const task = this.run(entry, controller.signal).catch(error => {
      if ((!controller.signal.aborted || controller.signal.reason instanceof TransferFailure) && !this.disposed) {
        this.report(error, entry);
        void this.persist(entry).catch(storageError => this.report(storageError));
      }
    }).finally(() => {
      if (entry.task === task) entry.task = undefined;
      entry.inFlight.clear();
      this.emit();
      if (entry.restartRequested) {
        entry.restartRequested = false;
        if (!terminal.has(entry.record.state) && !entry.record.paused) this.launch(entry);
      }
    });
    entry.task = task;
  }

  private guard(entry: Entry, signal: AbortSignal, allowPaused = false) {
    signal.throwIfAborted();
    if (this.disposed || !this.connected || (!allowPaused && entry.record.paused)) throw new DOMException('Transfer paused', 'AbortError');
    if (entry.record.file.expiresAt <= Date.now()) throw new TransferFailure('This transfer has expired.', 'expired', true);
  }

  private async snapshot(entry: Entry, signal: AbortSignal, allowPaused = false): Promise<TransferSnapshot> {
    this.guard(entry, signal, allowPaused);
    const snapshot = await this.client.getTransferState(entry.record.transferId);
    this.guard(entry, signal, allowPaused);
    const file = entry.record.file;
    if (snapshot.transferId !== entry.record.transferId || snapshot.fileId !== file.id || snapshot.roomCode !== file.roomCode
      || snapshot.chunkSize !== file.chunkSize || snapshot.summary.totalChunks !== file.totalChunks) {
      throw new TransferFailure('Transfer state changed unexpectedly. Share the file again.', 'failed', true);
    }
    entry.record.uploadedChunks = indexes(snapshot.summary.uploadedChunks, file.totalChunks);
    entry.record.acknowledgedChunks = indexes(snapshot.summary.acknowledgedChunks, file.totalChunks);
    entry.remoteUploaded = new Set([...entry.record.uploadedChunks, ...entry.record.acknowledgedChunks]).size;
    entry.remoteAcknowledged = entry.record.acknowledgedChunks.length;
    entry.snapshotReceived = true;
    const state = phase(snapshot.state);
    if (stopped.has(state) && state !== 'completed') {
      throw new TransferFailure(`Transfer ${state}. ${state === 'sender-offline' || state === 'receiver-offline' ? 'Resume when the other device reconnects.' : 'Ask the sender to share the file again.'}`, state, terminal.has(state));
    }
    if (state === 'completed' && entry.record.role === 'receiver') {
      entry.record.state = 'transferring';
    } else {
      entry.record.state = state;
    }
    this.emit();
    if (state === 'completed' && entry.record.role === 'sender') return snapshot;
    return snapshot;
  }

  private async run(entry: Entry, signal: AbortSignal) {
    // Even paused/restored transfers need an authoritative snapshot; don't infer indexes from push counts.
    const snapshot = await this.snapshot(entry, signal, true);
    if (snapshot.state === 'completed' && entry.record.role === 'sender') {
      this.stop(entry, 'completed');
      return;
    }
    if (entry.record.paused) { await this.persist(entry); return; }
    if (entry.record.role === 'sender') {
      if (new Set([...entry.record.uploadedChunks, ...entry.record.acknowledgedChunks]).size === entry.record.file.totalChunks) {
        entry.record.state = 'ready';
        entry.record.error = undefined;
        await this.persist(entry);
        this.emit();
        return;
      }
      if (!entry.source) {
        entry.record.error = 'Choose the original file to resume uploading after a refresh.';
        await this.persist(entry);
        this.emit();
        return;
      }
      await this.prepareSource(entry, signal);
      await this.uploadChunks(entry, signal);
    } else {
      entry.received = new Set(indexes(await this.storage.chunkIndexes(entry.record.transferId), entry.record.file.totalChunks));
      this.guard(entry, signal);
      await this.downloadChunks(entry, signal);
    }
  }

  private async prepareSource(entry: Entry, signal: AbortSignal) {
    const source = entry.source;
    if (!source) throw new TransferFailure('Choose the original file to continue.');
    const hashes: string[] = [];
    for (let index = 0; index < entry.record.file.totalChunks; index++) {
      this.guard(entry, signal);
      const start = index * entry.record.file.chunkSize;
      const hash = await chunkHash(source.slice(start, start + entry.record.file.chunkSize));
      this.guard(entry, signal);
      if (entry.record.sourceHashes && entry.record.sourceHashes[index] !== hash) {
        entry.source = undefined;
        throw new TransferFailure('This file differs from the original. Choose the unchanged original file.');
      }
      hashes.push(hash);
    }
    entry.record.sourceHashes = hashes;
    await this.persist(entry);
  }

  private async uploadChunks(entry: Entry, signal: AbortSignal) {
    const file = entry.record.file;
    while (true) {
      this.guard(entry, signal);
      const snapshot = await this.snapshot(entry, signal);
      if (snapshot.state === 'completed') { this.stop(entry, 'completed'); return; }
      const uploaded = new Set([...entry.record.uploadedChunks, ...entry.record.acknowledgedChunks]);
      const missing = Array.from({ length: file.totalChunks }, (_, index) => index).filter(index => !uploaded.has(index));
      if (!missing.length) {
        entry.record.state = 'ready';
        await this.persist(entry);
        this.emit();
        return;
      }
      entry.record.state = 'transferring';
      await this.batch(entry, missing.slice(0, TRANSFER_CONCURRENCY), signal, async index => {
        const start = index * file.chunkSize;
        const body = entry.source!.slice(start, Math.min(start + file.chunkSize, file.size));
        await this.chunkRequest(entry, index, signal, body);
        this.guard(entry, signal);
        entry.record.uploadedChunks = [...new Set([...entry.record.uploadedChunks, index])];
        await this.persist(entry);
      });
    }
  }

  private async downloadChunks(entry: Entry, signal: AbortSignal) {
    const file = entry.record.file;
    while (true) {
      const snapshot = await this.snapshot(entry, signal);
      const acknowledged = new Set(entry.record.acknowledgedChunks);
      if (entry.record.acknowledgedChunks.some(index => !entry.received.has(index))) {
        throw new TransferFailure('Previously acknowledged chunks are missing from this browser. Ask the sender to share the file again.', 'failed', true);
      }
      for (const index of entry.received) {
        if (!acknowledged.has(index)) {
          this.guard(entry, signal);
          await this.client.acknowledgeChunk(entry.record.transferId, index);
        }
      }
      if (entry.received.size === file.totalChunks && (acknowledged.size === file.totalChunks || snapshot.state === 'completed')) {
        await this.assemble(entry, signal);
        return;
      }
      const available = entry.record.uploadedChunks.filter(index => !entry.received.has(index) && !acknowledged.has(index));
      if (!available.length) {
        await delay(1000, signal);
        continue;
      }
      entry.record.state = 'transferring';
      await this.batch(entry, available.slice(0, TRANSFER_CONCURRENCY), signal, async index => {
        const response = await this.chunkRequest(entry, index, signal);
        const blob = response.data;
        this.guard(entry, signal);
        const expectedSize = Math.min(file.chunkSize, file.size - index * file.chunkSize);
        if (!blob || blob.size !== expectedSize) throw new TransferFailure(`Chunk ${index + 1} has the wrong size. Share this file again.`, 'failed', true);
        const hash = response.hash;
        if (hash) verifyHash(await chunkHash(blob), hash);
        this.guard(entry, signal);
        await this.write(entry, () => this.storage.putChunk(entry.record.transferId, index, blob));
        this.guard(entry, signal);
        entry.received.add(index);
        this.emit();
        await this.client.acknowledgeChunk(entry.record.transferId, index);
      });
    }
  }

  private async assemble(entry: Entry, signal: AbortSignal) {
    const parts: Blob[] = [];
    const hash = entry.record.file.hash ? sha256.create() : undefined;
    for (let index = 0; index < entry.record.file.totalChunks; index++) {
      this.guard(entry, signal);
      const blob = await this.storage.getChunk(entry.record.transferId, index);
      const expected = Math.min(entry.record.file.chunkSize, entry.record.file.size - index * entry.record.file.chunkSize);
      if (!blob || blob.size !== expected) throw new TransferFailure('A stored chunk is missing or damaged. Share the file again.', 'failed', true);
      if (hash) hash.update(new Uint8Array(await blob.arrayBuffer()));
      parts.push(blob);
    }
    this.guard(entry, signal);
    const blob = new Blob(parts, { type: entry.record.file.type });
    if (blob.size !== entry.record.file.size) throw new TransferFailure('The assembled file has the wrong size.', 'failed', true);
    if (hash && entry.record.file.hash) verifyHash(bytesToHex(hash.digest()), entry.record.file.hash);
    this.download(entry.record.file, blob);
    entry.record.state = 'completed';
    entry.record.error = undefined;
    await this.purge(entry);
    this.emit();
  }

  private async batch(entry: Entry, chunkIndexes: number[], signal: AbortSignal, work: (index: number) => Promise<void>) {
    let firstFailure: TransferFailure | undefined;
    const results = await Promise.allSettled(chunkIndexes.map(async index => {
      entry.inFlight.add(index);
      this.emit();
      try {
        this.guard(entry, signal);
        await work(index);
      } catch (error) {
        if (!signal.aborted) {
          entry.failed.add(index);
          firstFailure = error instanceof TransferFailure ? error : new TransferFailure(error instanceof Error ? error.message : 'Chunk processing failed.');
          entry.controller?.abort(firstFailure);
        }
        throw error;
      } finally {
        entry.inFlight.delete(index);
        this.emit();
      }
    }));
    if (firstFailure) throw firstFailure;
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }

  private async acquire(signal: AbortSignal) {
    while (this.activeHttp >= TRANSFER_CONCURRENCY) {
      await new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        const wake = () => { signal.removeEventListener('abort', abort); this.slotWaiters.delete(wake); resolve(); };
        const abort = () => { this.slotWaiters.delete(wake); reject(signal.reason); };
        this.slotWaiters.add(wake);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
    signal.throwIfAborted();
    this.activeHttp += 1;
  }

  private async chunkRequest(entry: Entry, index: number, signal: AbortSignal, body?: Blob): Promise<{ data: Blob | null; hash: string | null }> {
    let failures = 0;
    let waits = 0;
    const template = body ? entry.record.uploadUrlTemplate : entry.record.downloadUrlTemplate;
    const url = this.client.getChunkUrl(template, entry.record.transferId, index);
    while (true) {
      this.guard(entry, signal);
      await this.acquire(signal);
      const request = new AbortController();
      const abort = () => request.abort();
      signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(() => request.abort(), 30000);
      let response: Response | undefined;
      let networkError: unknown;
      try {
        const headers: Record<string, string> = { 'x-peer-id': this.client.getPeerId() };
        if (body) headers['Content-Type'] = 'application/octet-stream';
        if (body && entry.record.sourceHashes?.[index]) headers['x-chunk-hash'] = entry.record.sourceHashes[index];
        response = await this.fetcher(url, { method: body ? 'POST' : 'GET', headers, body, signal: request.signal, credentials: 'omit', redirect: 'error' });
        if (response.ok) {
          const data = body ? null : await response.blob();
          return { data, hash: response.headers.get('X-Chunk-Hash') };
        }
        const waitForPeer = (body && response.status === 409) || (!body && response.status === 404);
        if (!waitForPeer && ![408, 425, 429].includes(response.status) && response.status < 500) {
          throw new TransferFailure(
            `Chunk ${index + 1} was rejected (HTTP ${response.status}). ${response.status === 410 ? 'This transfer is no longer available.' : 'Check room access or ask the sender to share the file again.'}`,
            response.status === 410 ? 'expired' : 'failed', response.status === 410,
          );
        }
      } catch (error) {
        if (error instanceof TransferFailure) throw error;
        networkError = error;
      } finally {
        clearTimeout(timeout);
        request.abort();
        signal.removeEventListener('abort', abort);
        this.activeHttp -= 1;
        for (const wake of this.slotWaiters) wake();
      }
      this.guard(entry, signal);
      const waiting = !networkError && response && ((body && response.status === 409) || (!body && response.status === 404));
      if (!waiting && ++failures > 5) {
        throw new TransferFailure(`Chunk ${index + 1} could not be ${body ? 'uploaded' : 'downloaded'}. Resume to try again. ${networkError instanceof Error ? networkError.message : ''}`);
      }
      const retryAfter = response?.headers.get('Retry-After');
      const serverDelay = retryAfter && /^\d+$/.test(retryAfter) ? Math.min(Number(retryAfter) * 1000, 30000) : 0;
      await delay(Math.max(serverDelay, Math.min(500 * 2 ** Math.min(waiting ? waits++ : failures - 1, 4), 8000)), signal);
    }
  }

  dispose() {
    this.disposed = true;
    this.connected = false;
    clearInterval(this.expiryTimer);
    for (const entry of this.entries.values()) {
      entry.controller?.abort();
      entry.source = undefined;
    }
  }
}
