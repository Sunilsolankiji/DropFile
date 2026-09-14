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

export type SharedFile = ShareMetadata;

export type ChatMessage = SharedTextMessage;

export type ChatMessageWithMeta = ChatMessage & {
  status?: 'pending' | 'sent' | 'failed';
  message?: string;
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const DEVICE_NAME_KEY = 'dropfile_device_name';
const DEVICE_ID_KEY = 'dropfile_device_id';

// Get or create a persistent device name
function getOrCreateDeviceName(): string {
  let deviceName = localStorage.getItem(DEVICE_NAME_KEY);
  if (!deviceName) {
    deviceName = 'Device ' + Math.random().toString(36).substr(2, 5);
    localStorage.setItem(DEVICE_NAME_KEY, deviceName);
  }
  return deviceName;
}

// Get or create a persistent device ID
function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function useRoom(roomCode: string) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [transfers, setTransfers] = useState<TransferState[]>([]);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<NetworkPeer[]>([]);
  const [textMessages, setTextMessages] = useState<ChatMessageWithMeta[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPeerId, setCurrentPeerId] = useState<string | null>(null);

  const serviceRef = useRef<NetworkPeerService | null>(null);
  const managerRef = useRef<TransferManager | null>(null);
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
    setTransferError(null);
    setTextMessages([]);
    setPeers([]);
    setLoading(true);
    setIsConnected(false);
    setError(null);
    let serverFiles: ShareMetadata[] = [];
    let localShares: ShareMetadata[] = [];
    let manager: TransferManager | null = null;
    const updateFiles = () => {
      if (!mounted) return;
      const merged = new Map(localShares.map(file => [file.id, file]));
      serverFiles.forEach(file => merged.set(file.id, file));
      setFiles([...merged.values()]);
    };
    const service = new NetworkPeerService(
          BACKEND_URL,
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
              console.log(`Peer left: ${peerId}`);
            },
            onFileAdded: (file) => {
              console.log(`File added: ${file.name}`);
            },
            onFileRemoved: (fileId) => {
              manager?.removeFile(fileId);
            },
            onTransferUpdated: (update) => manager?.handleUpdate(update),
            onTransferCompleted: (update) => manager?.handleUpdate(update, true),
            onTransferError: message => { if (mounted) setTransferError(message); },
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
    setCurrentPeerId(service.getPeerId());
    void manager.restore()
      .catch(err => { if (mounted) setTransferError(`Could not restore local transfers: ${err instanceof Error ? err.message : String(err)}`); })
      .finally(() => { if (mounted) void service.connect(); });

    return () => {
      mounted = false;
      manager?.dispose();
      if (managerRef.current === manager) managerRef.current = null;
      if (serviceRef.current === service) serviceRef.current = null;
      service.disconnect();
    };
  }, [roomCode]);

  // Upload files
  const uploadFiles = useCallback(async (filesToUpload: File[]): Promise<void> => {
    const manager = managerRef.current;
    if (!manager || !serviceRef.current?.isConnected()) {
      setError('Not connected to the room');
      return;
    }
    setTransferError(null);
    for (const file of filesToUpload) {
      if (managerRef.current !== manager) return;
      await manager.upload(file);
    }
  }, []);

  const downloadFile = useCallback(async (fileId: string): Promise<boolean> => {
    const manager = managerRef.current;
    const file = files.find(item => item.id === fileId);
    if (!manager || !file) {
      setTransferError('This shared file is no longer available.');
      return false;
    }
    setTransferError(null);
    return manager.startDownload(file);
  }, [files]);

  const pauseTransfer = useCallback((transferId: string) => {
    if (!managerRef.current) { setTransferError('The transfer manager is unavailable. Rejoin the room.'); return; }
    managerRef.current.pause(transferId);
  }, []);

  const resumeTransfer = useCallback(async (transferId: string) => {
    if (!managerRef.current) { setTransferError('The transfer manager is unavailable. Rejoin the room.'); return false; }
    setTransferError(null);
    return managerRef.current.resume(transferId);
  }, []);

  const cancelTransfer = useCallback(async (transferId: string) => {
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
      localStorage.setItem(DEVICE_NAME_KEY, trimmed);
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
