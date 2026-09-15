export const DEFAULT_CHUNK_SIZE = 1024 * 1024;
export const TRANSFER_CONCURRENCY = 4;
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
export const DEFAULT_FILE_TYPE = 'application/octet-stream';

export type TransferRole = 'sender' | 'receiver';
export type TransferPhase =
  | 'pending' | 'ready' | 'transferring' | 'completed'
  | 'cancelled' | 'expired' | 'removed' | 'failed'
  | 'offline' | 'sender-offline' | 'sender-timeout';

export interface TransferStatus {
  state: string;
  uploadedChunks: number;
  acknowledgedChunks: number;
  activeReceivers?: number;
  receiverPeerIds?: string[];
  completedReceiverPeerIds?: string[];
  senderConnected?: boolean;
}

export interface ShareMetadata {
  id: string;
  transferId: string;
  name: string;
  size: number;
  type: string;
  peerId: string;
  peerName: string;
  roomCode: string;
  expiresAt: number;
  uploadedAt?: number;
  totalChunks: number;
  chunkSize: number;
  status?: string;
  hash?: string;
  transfer?: TransferStatus;
}

export interface FileMetadata {
  id?: string;
  name: string;
  size: number;
  type: string;
  chunkSize: number;
  totalChunks: number;
  hash?: string;
}

export interface CreatedTransfer {
  success: boolean;
  error?: string;
  fileId: string;
  transferId: string;
  expiresAt: number;
  chunkSize: number;
  totalChunks: number;
  uploadUrlTemplate: string;
}

export interface StartedTransfer {
  success: boolean;
  error?: string;
  transferId: string;
  fileId: string;
  chunkSize: number;
  totalChunks: number;
  state: string;
  downloadUrlTemplate: string;
  uploadedChunkIndexes: number[];
  acknowledgedChunkIndexes: number[];
}

export interface TransferSnapshot {
  success: boolean;
  error?: string;
  transferId: string;
  fileId: string;
  roomCode: string;
  state: string;
  chunkSize: number;
  summary: {
    totalChunks: number;
    uploadedChunks: number[];
    acknowledgedChunks: number[];
  };
  uploadedChunkIndexes: number[];
  acknowledgedChunkIndexes: number[];
}

export interface TransferUpdate {
  transferId: string;
  fileId: string;
  status: TransferStatus;
  peerId?: string;
  chunkIndex?: number;
  reason?: string;
}

export interface TransferClient {
  getPeerId(): string;
  getPeerName(): string;
  getRoomCode(): string;
  isConnected(): boolean;
  createFileShare(file: FileMetadata): Promise<CreatedTransfer>;
  startTransfer(fileId: string): Promise<StartedTransfer>;
  getTransferState(transferId: string): Promise<TransferSnapshot>;
  acknowledgeChunk(transferId: string, chunkIndex: number): Promise<void>;
  cancelTransfer(transferId: string, reason: string): Promise<void>;
  getChunkUrl(template: string | undefined, transferId: string, chunkIndex: number): string;
}

export interface TransferRecord {
  transferId: string;
  fileId: string;
  roomCode: string;
  peerId: string;
  role: TransferRole;
  file: ShareMetadata;
  state: TransferPhase;
  paused: boolean;
  uploadedChunks: number[];
  acknowledgedChunks: number[];
  uploadUrlTemplate?: string;
  downloadUrlTemplate?: string;
  sourceLastModified?: number;
  sourceHashes?: string[];
  cancelReason?: string;
  cancelPending?: boolean;
  error?: string;
  senderConnected?: boolean;
  activeReceivers?: number;
  receiverPeerIds?: string[];
  completedReceiverPeerIds?: string[];
}

export interface TransferState {
  transferId: string;
  fileId: string;
  role: TransferRole;
  state: TransferPhase;
  paused: boolean;
  needsSource: boolean;
  canResume: boolean;
  uploadedChunkCount: number;
  acknowledgedChunkCount: number;
  receivedChunkCount: number;
  totalChunks: number;
  chunkSize: number;
  inFlightChunks: number[];
  failedChunks: number[];
  senderConnected?: boolean;
  activeReceivers?: number;
  receiverPeerIds?: string[];
  completedReceiverPeerIds?: string[];
  cancelReason?: string;
  error?: string;
}

export interface TransferStorage {
  list(roomCode: string, peerId: string): Promise<TransferRecord[]>;
  save(record: TransferRecord): Promise<void>;
  putChunk(transferId: string, chunkIndex: number, data: Blob): Promise<void>;
  getChunk(transferId: string, chunkIndex: number): Promise<Blob | undefined>;
  chunkIndexes(transferId: string): Promise<number[]>;
  delete(transferId: string): Promise<void>;
}
