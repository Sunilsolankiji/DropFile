import type { TransferRecord, TransferStorage } from './transfer-types';

const DATABASE_NAME = 'dropfile-transfers';
const TRANSFERS = 'transfers';
const CHUNKS = 'chunks';
const TRANSFER_INDEX = 'transferId';
const connections = new WeakMap<IDBFactory, Promise<IDBDatabase>>();

interface StoredChunk {
  transferId: string;
  chunkIndex: number;
  data: Blob;
}

function isExpired(record: TransferRecord, now: number): boolean {
  return record.state === 'expired' || record.file.expiresAt <= now;
}

function transact<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction, result: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    // Strict durability prevents acknowledging received chunks before their commit.
    const transaction = db.transaction(
      stores,
      mode,
      mode === 'readwrite' ? { durability: 'strict' } : undefined,
    );
    let result: T;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = event => {
      const request = event.target;
      reject(
        transaction.error
        ?? (request instanceof IDBRequest ? request.error : null)
        ?? new Error('IndexedDB transaction failed'),
      );
    };
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    try {
      operation(transaction, value => { result = value; });
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

function deleteChunks(transaction: IDBTransaction, transferId: string): void {
  const store = transaction.objectStore(CHUNKS);
  const request = store.index(TRANSFER_INDEX).openKeyCursor(IDBKeyRange.only(transferId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    store.delete(cursor.primaryKey);
    cursor.continue();
  };
}

function collectRecords(
  db: IDBDatabase,
  roomCode?: string,
  peerId?: string,
): Promise<TransferRecord[]> {
  return transact(db, [TRANSFERS, CHUNKS], 'readwrite', (transaction, result) => {
    const records: TransferRecord[] = [];
    const now = Date.now();
    const request = transaction.objectStore(TRANSFERS).openCursor();
    result(records);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as TransferRecord;
      if (isExpired(record, now)) {
        cursor.delete();
        deleteChunks(transaction, record.transferId);
      } else if (record.roomCode === roomCode && record.peerId === peerId) {
        records.push(record);
      }
      cursor.continue();
    };
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable; transfer persistence is required'));
  }
  const factory = indexedDB;
  const existing = connections.get(factory);
  if (existing) return existing;

  const connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, 1);
    let rejected = false;
    const fail = (error: unknown) => {
      rejected = true;
      reject(error);
    };
    request.onerror = () => fail(request.error ?? new Error('Could not open transfer storage'));
    request.onblocked = () => fail(new Error('Transfer storage is blocked by another browser tab; close that tab and retry'));
    request.onupgradeneeded = () => {
      // A blocked request cannot be cancelled; abort if it subsequently upgrades.
      if (rejected) {
        request.transaction?.abort();
        return;
      }
      const db = request.result;
      db.createObjectStore(TRANSFERS, { keyPath: 'transferId' });
      const chunks = db.createObjectStore(CHUNKS, { keyPath: ['transferId', 'chunkIndex'] });
      chunks.createIndex(TRANSFER_INDEX, 'transferId', { unique: false });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (rejected) {
        db.close();
        return;
      }
      const invalidate = () => {
        if (connections.get(factory) === connection) connections.delete(factory);
      };
      db.onversionchange = () => {
        invalidate();
        db.close();
      };
      db.onclose = invalidate;
      collectRecords(db).then(
        () => resolve(db),
        error => {
          invalidate();
          db.close();
          fail(error);
        },
      );
    };
  });
  connections.set(factory, connection);
  // Return the rejecting promise, while allowing a later explicit retry to reopen.
  void connection.catch(() => {
    if (connections.get(factory) === connection) connections.delete(factory);
  });
  return connection;
}

function validateChunkIndex(chunkIndex: number): void {
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) {
    throw new RangeError('Chunk index must be a non-negative safe integer');
  }
}

export class IndexedDbTransferStorage implements TransferStorage {
  async list(roomCode: string, peerId: string): Promise<TransferRecord[]> {
    return collectRecords(await openDatabase(), roomCode, peerId);
  }

  async save(record: TransferRecord): Promise<void> {
    const snapshot = structuredClone(record);
    const db = await openDatabase();
    return transact(db, [TRANSFERS], 'readwrite', transaction => {
      transaction.objectStore(TRANSFERS).put(snapshot);
    });
  }

  async putChunk(transferId: string, chunkIndex: number, data: Blob): Promise<void> {
    validateChunkIndex(chunkIndex);
    const db = await openDatabase();
    return transact(db, [CHUNKS], 'readwrite', transaction => {
      const chunk: StoredChunk = {
        transferId,
        chunkIndex,
        data: new Blob([data], { type: data.type }),
      };
      transaction.objectStore(CHUNKS).put(chunk);
    });
  }

  async getChunk(transferId: string, chunkIndex: number): Promise<Blob | undefined> {
    validateChunkIndex(chunkIndex);
    const db = await openDatabase();
    return transact(db, [CHUNKS], 'readonly', (transaction, result) => {
      const request = transaction.objectStore(CHUNKS).get([transferId, chunkIndex]);
      request.onsuccess = () => {
        const chunk = request.result as StoredChunk | undefined;
        result(chunk?.data);
      };
    });
  }

  async chunkIndexes(transferId: string): Promise<number[]> {
    const db = await openDatabase();
    return transact(db, [CHUNKS], 'readonly', (transaction, result) => {
      const request = transaction.objectStore(CHUNKS)
        .index(TRANSFER_INDEX).getAllKeys(IDBKeyRange.only(transferId));
      request.onsuccess = () => {
        result(request.result.flatMap(key =>
          Array.isArray(key) && typeof key[1] === 'number' ? [key[1]] : [],
        ).sort((left, right) => left - right));
      };
    });
  }

  async delete(transferId: string): Promise<void> {
    const db = await openDatabase();
    return transact(db, [TRANSFERS, CHUNKS], 'readwrite', transaction => {
      transaction.objectStore(TRANSFERS).delete(transferId);
      deleteChunks(transaction, transferId);
    });
  }
}

/** Explicit in-process storage for tests; never an IndexedDB failure fallback. */
export class MemoryTransferStorage implements TransferStorage {
  private readonly records = new Map<string, TransferRecord>();
  private readonly chunks = new Map<string, Map<number, Blob>>();

  async list(roomCode: string, peerId: string): Promise<TransferRecord[]> {
    const result: TransferRecord[] = [];
    const now = Date.now();
    for (const [transferId, record] of this.records) {
      if (isExpired(record, now)) {
        this.records.delete(transferId);
        this.chunks.delete(transferId);
      } else if (record.roomCode === roomCode && record.peerId === peerId) {
        result.push(structuredClone(record));
      }
    }
    return result;
  }

  async save(record: TransferRecord): Promise<void> {
    this.records.set(record.transferId, structuredClone(record));
  }

  async putChunk(transferId: string, chunkIndex: number, data: Blob): Promise<void> {
    validateChunkIndex(chunkIndex);
    let chunks = this.chunks.get(transferId);
    if (!chunks) {
      chunks = new Map();
      this.chunks.set(transferId, chunks);
    }
    chunks.set(chunkIndex, new Blob([data], { type: data.type }));
  }

  async getChunk(transferId: string, chunkIndex: number): Promise<Blob | undefined> {
    validateChunkIndex(chunkIndex);
    return this.chunks.get(transferId)?.get(chunkIndex);
  }

  async chunkIndexes(transferId: string): Promise<number[]> {
    return [...(this.chunks.get(transferId)?.keys() ?? [])].sort((left, right) => left - right);
  }

  async delete(transferId: string): Promise<void> {
    this.records.delete(transferId);
    this.chunks.delete(transferId);
  }
}
