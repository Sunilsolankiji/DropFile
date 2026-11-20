/**
 * Backend-only Room Hook
 * Uses the new backend server for all file sharing
 * No Firebase, no local-network complexity
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NetworkPeerService, NetworkPeer, SharedTextMessage } from '@/lib/network-peer-service';
import { TransferManager } from '@/lib/transfer-manager';
import { IndexedDbTransferStorage } from '@/lib/transfer-storage';
import type { ShareMetadata, TransferState } from '@/lib/transfer-types';
import { saveBlobAsFile } from '@/lib/utils';
import { API_URL } from '@/lib/config';
import { getOrCreateDeviceId, getOrCreateDeviceName, saveDeviceName } from '@/lib/device';
import { P2PNetwork } from '@/lib/rtc/p2p-network';
import { TransferCancelledError } from '@/lib/rtc/p2p-session';
import { getIceServers, warmUpWebRtc } from '@/lib/rtc/ice';

export type SharedFile = ShareMetadata;

export type ChatMessage = SharedTextMessage;

export type ChatMessageWithMeta = ChatMessage & {
  status?: 'pending' | 'sent' | 'failed';
  message?: string;
};

const DIRECT_PREFIX = 'direct:';
const DIRECT_PROGRESS_UNITS = 1000;
// Devices on the same Wi-Fi usually connect in well under a second; give up quickly otherwise.
const DIRECT_CONNECT_TIMEOUT_MS = 6000;

interface DirectDownload {
  state: TransferState;
  controller: AbortController;
}

function directState(file: ShareMetadata, overrides: Partial<TransferState> = {}): TransferState {
  return {
    transferId: `${DIRECT_PREFIX}${file.id}`, fileId: file.id, role: 'receiver', state: 'transferring',
    paused: false, needsSource: false, canResume: false, uploadedChunkCount: 0, acknowledgedChunkCount: 0,
    receivedChunkCount: 0, totalChunks: DIRECT_PROGRESS_UNITS, chunkSize: file.chunkSize, inFlightChunks: [],
    failedChunks: [], transport: 'direct', canPause: false, ...overrides,
  };
}

export function useRoom(roomCode: string) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [relayTransfers, setTransfers] = useState<TransferState[]>([]);
  const [directTransfers, setDirectTransfers] = useState<TransferState[]>([]);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<NetworkPeer[]>([]);
  const [textMessages, setTextMessages] = useState<ChatMessageWithMeta[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPeerId, setCurrentPeerId] = useState<string | null>(null);

  const serviceRef = useRef<NetworkPeerService | null>(null);
  const managerRef = useRef<TransferManager | null>(null);
  const networkRef = useRef<P2PNetwork | null>(null);
  const directRef = useRef(new Map<string, DirectDownload>());
  const transfersRef = useRef<TransferState[]>([]);
  const peerNameRef = useRef<string>(getOrCreateDeviceName());
  const deviceIdRef = useRef<string>(getOrCreateDeviceId());
  const confirmedTextIdsRef = useRef(new Set<string>());
  const pendingTextIdsRef = useRef(new Set<string>());

  // Initialize backend service
  useEffect(() => {
    let mounted = true;
    confirmedTextIdsRef.current.clear();
    setFiles([]);
    setTransfers([]);
    setDirectTransfers([]);
    directRef.current = new Map();
    setTransferError(null);
    setTextMessages([]);
    setPeers([]);
    setLoading(true);
    setIsConnected(false);
    setError(null);
    let serverFiles: ShareMetadata[] = [];
    let localShares: ShareMetadata[] = [];
    let manager: TransferManager | null = null;
    let network: P2PNetwork | null = null;
    const updateFiles = () => {
      if (!mounted) return;
      const merged = new Map(localShares.map(file => [file.id, file]));
      serverFiles.forEach(file => merged.set(file.id, file));
      setFiles([...merged.values()]);
    };
    const service = new NetworkPeerService(
          API_URL,
          roomCode,
          peerNameRef.current,
          {
            onPeersChanged: (newPeers) => {
              if (mounted) {
                setPeers(newPeers);
              }
            },
            onFilesChanged: (newFiles) => {
              if (mounted) {
                serverFiles = newFiles;
                manager?.syncFiles(newFiles);
                updateFiles();
              }
            },
            onTextsChanged: (newTexts) => {
              if (mounted) {
                newTexts.forEach(text => {
                  if (text.peerId === deviceIdRef.current) confirmedTextIdsRef.current.add(text.id);
                });
                setTextMessages(previous => {
                  const receivedIds = new Set(newTexts.map(text => text.id));
                  const received = newTexts.map(text => {
                    const existing = previous.find(message => message.id === text.id);
                    return { ...existing, ...text, status: 'sent' as const };
                  });
                  return [...received, ...previous.filter(text => !receivedIds.has(text.id))];
                });
              }
            },
            onConnectionChanged: (state, connectionError) => {
              if (!mounted) return;
              setIsConnected(state === 'connected');
              setLoading(state === 'connecting');
              setError(connectionError || (state === 'disconnected' ? 'Not connected to the room' : null));
              if (state === 'connected') manager?.removeMissingFiles(service.getFiles());
              manager?.setConnected(state === 'connected');
            },
            onPeerJoined: (peer) => {
              console.log(`Peer joined: ${peer.name}`);
            },
            onPeerLeft: (peerId) => {
              network?.disconnect(peerId, 'The other device left the room');
            },
            onFileAdded: (file) => {
              console.log(`File added: ${file.name}`);
            },
            onFileRemoved: (fileId) => {
              manager?.removeFile(fileId);
              directRef.current.get(fileId)?.controller.abort();
            },
            onTransferUpdated: (update) => manager?.handleUpdate(update),
            onTransferCompleted: (update) => manager?.handleUpdate(update, true),
            onTransferError: message => { if (mounted) setTransferError(message); },
            onSignal: (fromPeerId, data) => { void network?.handleSignal(fromPeerId, data); },
            onTextAdded: (text) => {
              if (!mounted) return;
              if (text.peerId === deviceIdRef.current) confirmedTextIdsRef.current.add(text.id);
              setTextMessages(prev => prev.some(existing => existing.id === text.id)
                ? prev.map(existing => existing.id === text.id
                  ? { ...existing, ...text, status: 'sent' }
                  : existing)
                : [...prev, { ...text, status: 'sent' }]);
            }
          },
          deviceIdRef.current
        );

    manager = new TransferManager(service, new IndexedDbTransferStorage(), {
      onChange: (nextTransfers, nextShares) => {
        if (!mounted) return;
        transfersRef.current = nextTransfers;
        setTransfers(nextTransfers);
        localShares = nextShares;
        updateFiles();
      },
      onError: message => { if (mounted) setTransferError(message); },
    });
    managerRef.current = manager;
    serviceRef.current = service;
    // Direct device-to-device transfers; the server only relays the WebRTC handshake.
    network = P2PNetwork.isSupported()
      ? new P2PNetwork(deviceIdRef.current, { send: (target, data) => service.sendSignal(target, data) }, {
        resolveRequest: fileId => manager?.getSource(fileId),
      })
      : null;
    networkRef.current = network;
    if (network) {
      void getIceServers();
      warmUpWebRtc();
    }
    setCurrentPeerId(service.getPeerId());
    void manager.restore()
      .catch(err => { if (mounted) setTransferError(`Could not restore local transfers: ${err instanceof Error ? err.message : String(err)}`); })
      .finally(() => { if (mounted) void service.connect(); });

    return () => {
      mounted = false;
      for (const direct of directRef.current.values()) direct.controller.abort();
      network?.dispose();
      if (networkRef.current === network) networkRef.current = null;
      manager?.dispose();
      if (managerRef.current === manager) managerRef.current = null;
      if (serviceRef.current === service) serviceRef.current = null;
      service.disconnect();
    };
  }, [roomCode]);

  // Upload files
  const uploadFiles = useCallback(async (filesToUpload: File[]): Promise<void> => {
    const service = serviceRef.current;
    if (!service) return;
    // Mobile browsers disconnect while the file picker is open; wait for the room to come back.
    if (!service.isConnected() && !(await service.waitForConnection(60000))) {
      if (serviceRef.current === service) setError('Could not reconnect to the room. Check your connection and choose the files again.');
      return;
    }
    const manager = managerRef.current;
    if (!manager || serviceRef.current !== service) return;
    setTransferError(null);
    for (const file of filesToUpload) {
      if (managerRef.current !== manager) return;
      await manager.upload(file);
    }
  }, []);

  const updateDirect = useCallback((fileId: string, state: TransferState | null) => {
    if (state) {
      const current = directRef.current.get(fileId);
      if (current) current.state = state;
    } else {
      directRef.current.delete(fileId);
    }
    setDirectTransfers([...directRef.current.values()].map(direct => direct.state));
  }, []);

  /**
   * Try to download straight from the sender over WebRTC. Returns false (after cleaning up) when a
   * direct connection is impossible, so the caller can fall back to the server relay.
   */
  const downloadDirect = useCallback(async (file: ShareMetadata): Promise<boolean> => {
    const network = networkRef.current;
    if (!network || directRef.current.has(file.id) && directRef.current.get(file.id)!.state.state === 'transferring') return !!network;
    const controller = new AbortController();
    directRef.current.set(file.id, { controller, state: directState(file, { state: 'pending' }) });
    updateDirect(file.id, directState(file, { state: 'pending' }));
    let receivedAny = false;
    try {
      const session = await network.session(file.peerId, DIRECT_CONNECT_TIMEOUT_MS);
      controller.signal.throwIfAborted();
      updateDirect(file.id, directState(file));
      const blob = await session.requestFile(file.id, (bytes, size) => {
        receivedAny = receivedAny || bytes > 0;
        if (directRef.current.get(file.id)?.controller !== controller) return;
        updateDirect(file.id, directState(file, {
          receivedChunkCount: size > 0 ? Math.floor(bytes / size * DIRECT_PROGRESS_UNITS) : DIRECT_PROGRESS_UNITS,
        }));
      }, controller.signal);
      if (blob.size !== file.size) throw new Error('The direct transfer was incomplete.');
      saveBlobAsFile(file.name, blob);
      updateDirect(file.id, directState(file, { state: 'completed', receivedChunkCount: DIRECT_PROGRESS_UNITS }));
      return true;
    } catch (error) {
      if (controller.signal.aborted || error instanceof TransferCancelledError) {
        updateDirect(file.id, directState(file, { state: 'cancelled', cancelReason: error instanceof Error ? error.message : 'Cancelled' }));
        return true;
      }
      console.info(`Direct transfer unavailable${receivedAny ? ' (interrupted)' : ''}, using the server relay:`, error);
      updateDirect(file.id, null);
      return false;
    }
  }, [updateDirect]);

  const downloadFile = useCallback(async (fileId: string): Promise<boolean> => {
    const manager = managerRef.current;
    const file = files.find(item => item.id === fileId);
    if (!manager || !file) {
      setTransferError('This shared file is no longer available.');
      return false;
    }
    setTransferError(null);
    const senderOnline = peers.some(peer => peer.id === file.peerId);
    if (senderOnline && !manager.hasActiveDownload(fileId) && networkRef.current) {
      if (await downloadDirect(file)) return true;
    }
    if (directRef.current.has(fileId)) updateDirect(fileId, null);
    return manager.startDownload(file);
  }, [files, peers, downloadDirect, updateDirect]);

  const pauseTransfer = useCallback((transferId: string) => {
    if (transferId.startsWith(DIRECT_PREFIX)) return;
    if (!managerRef.current) { setTransferError('The transfer manager is unavailable. Rejoin the room.'); return; }
    managerRef.current.pause(transferId);
  }, []);

  const resumeTransfer = useCallback(async (transferId: string) => {
    if (transferId.startsWith(DIRECT_PREFIX)) return false;
    if (!managerRef.current) { setTransferError('The transfer manager is unavailable. Rejoin the room.'); return false; }
    setTransferError(null);
    return managerRef.current.resume(transferId);
  }, []);

  const cancelTransfer = useCallback(async (transferId: string) => {
    if (transferId.startsWith(DIRECT_PREFIX)) {
      directRef.current.get(transferId.slice(DIRECT_PREFIX.length))?.controller.abort();
      return true;
    }
    if (!managerRef.current) { setTransferError('The transfer manager is unavailable. Rejoin the room.'); return false; }
    setTransferError(null);
    return managerRef.current.cancel(transferId);
  }, []);

  const attachSource = useCallback(async (transferId: string, file: File) => {
    if (!managerRef.current) { setTransferError('The transfer manager is unavailable. Rejoin the room.'); return false; }
    setTransferError(null);
    return managerRef.current.attachSource(transferId, file);
  }, []);

  const stopFileWork = (fileId: string) => {
    for (const transfer of transfersRef.current) {
      if (transfer.fileId === fileId) managerRef.current?.pause(transfer.transferId);
    }
  };

  // Delete file
  const deleteFile = useCallback(async (fileId: string): Promise<boolean> => {
    const service = serviceRef.current;
    if (!service?.isConnected()) {
      setError('Not connected to the room');
      return false;
    }
    setError(null);
    try {
      stopFileWork(fileId);
      const deleted = await service.removeFile(fileId);
      return serviceRef.current === service && deleted;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Delete failed';
      if (serviceRef.current === service) setError(errorMsg);
      return false;
    }
  }, []);

  const sendText = useCallback(async (text: string, retryMessageId?: string): Promise<boolean> => {
    const service = serviceRef.current;
    if (!service?.isConnected()) {
      setError('Not connected to the room');
      return false;
    }
    const retryMessage = retryMessageId
      ? textMessages.find(message => message.id === retryMessageId && message.peerId === currentPeerId)
      : undefined;
    if (retryMessageId && (!retryMessage || retryMessage.status !== 'failed')) {
      setError('Only your failed messages can be retried');
      return false;
    }
    const messageText = retryMessage ? retryMessage.text || retryMessage.message || '' : text;
    if (!messageText.trim()) {
      setError('Message cannot be empty');
      return false;
    }
    setError(null);
    // Use the same identity for the optimistic row, wire payload and acknowledgement.
    const localId = retryMessage?.id || `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (pendingTextIdsRef.current.has(localId)) return false;
    pendingTextIdsRef.current.add(localId);
    const createdAt = retryMessage?.createdAt ?? Date.now();
    setTextMessages(prev => retryMessage
      ? prev.map(message => message.id === localId ? { ...message, status: 'pending' } : message)
      : [...prev, {
      id: localId,
      text: messageText,
      message: messageText,
      peerId: currentPeerId || deviceIdRef.current,
      peerName: peerNameRef.current,
      createdAt,
      status: 'pending'
    }]);
    try {
      const sent = await service.addText(messageText, localId, createdAt);
      if (serviceRef.current !== service) return false;
      setTextMessages(prev => {
        const optimistic = prev.find(message => message.id === localId);
        const confirmed: ChatMessageWithMeta = { ...optimistic, ...sent, status: 'sent' };
        const withoutDuplicate = prev.filter(message => message.id !== sent.id || message.id === localId);
        return optimistic
          ? withoutDuplicate.map(message => message.id === localId ? confirmed : message)
          : [...withoutDuplicate, confirmed];
      });
      return true;
    } catch (err) {
      if (serviceRef.current === service) {
        if (confirmedTextIdsRef.current.has(localId)) return true;
        setTextMessages(prev => prev.map(message =>
          message.id === localId && message.status !== 'sent' ? { ...message, status: 'failed' } : message
        ));
        setError(err instanceof Error ? err.message : 'Message could not be sent');
      }
      return false;
    } finally {
      pendingTextIdsRef.current.delete(localId);
    }
  }, [currentPeerId, textMessages]);

  const retryText = useCallback((messageId: string) => sendText('', messageId), [sendText]);

  const updateDeviceName = useCallback((name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Device name cannot be empty');
      return false;
    }

    try {
      saveDeviceName(trimmed);
      peerNameRef.current = trimmed;
      serviceRef.current?.updatePeerName(trimmed);
      setPeers(prev => prev.map(peer => (peer.id === currentPeerId ? { ...peer, name: trimmed } : peer)));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the device name');
      return false;
    }
  }, [currentPeerId]);

  const retryConnection = useCallback(async (): Promise<boolean> => {
    const service = serviceRef.current;
    if (!service) return false;
    return service.connect();
  }, []);

  // Direct downloads come first so the file row reflects the transfer actually in progress.
  const transfers = [...directTransfers, ...relayTransfers];

  return {
    files,
    transfers,
    uploadFiles,
    deleteFile,
    sendText,
    retryText,
    updateDeviceName,
    downloadFile,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    attachSource,
    retryConnection,
    loading,
    error: error || transferError,
    peers,
    isConnected,
    peerCount: peers.length,
    currentPeerId,
    currentPeerName: peerNameRef.current,
    textMessages,
    connectionMode: isConnected ? 'backend' : 'offline' as const
  };
}
