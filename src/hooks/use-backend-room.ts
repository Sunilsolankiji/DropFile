/**
 * Backend-only Room Hook
 * Uses the new backend server for all file sharing
 * No Firebase, no local-network complexity
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NetworkPeerService, NetworkPeer, SharedTextMessage } from '@/lib/network-peer-service';

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  peerId: string;
  peerName: string;
  expiresAt: number;
  uploadedAt?: number;
}

export interface UploadingFile {
  id: string;
  name: string;
  size: number;
  progress: number;
}

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
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<NetworkPeer[]>([]);
  const [textMessages, setTextMessages] = useState<ChatMessageWithMeta[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPeerId, setCurrentPeerId] = useState<string | null>(null);

  const serviceRef = useRef<NetworkPeerService | null>(null);
  const peerNameRef = useRef<string>(getOrCreateDeviceName());
  const deviceIdRef = useRef<string>(getOrCreateDeviceId());
  const confirmedTextIdsRef = useRef(new Set<string>());
  const pendingTextIdsRef = useRef(new Set<string>());

  // Initialize backend service
  useEffect(() => {
    let mounted = true;
    confirmedTextIdsRef.current.clear();
    setFiles([]);
    setUploadingFiles([]);
    setTextMessages([]);
    setPeers([]);
    setLoading(true);
    setIsConnected(false);
    setError(null);
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
                const sharedFiles: SharedFile[] = newFiles.map(f => ({
                  id: f.id,
                  name: f.name,
                  size: f.size,
                  type: f.type,
                  peerId: f.peerId,
                  peerName: f.peerName,
                  expiresAt: f.expiresAt,
                  uploadedAt: f.uploadedAt
                }));
                setFiles(sharedFiles);
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
              console.log(`File removed: ${fileId}`);
            },
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

    serviceRef.current = service;
    setCurrentPeerId(service.getPeerId());
    void service.connect();

    return () => {
      mounted = false;
      if (serviceRef.current === service) serviceRef.current = null;
      service.disconnect();
    };
  }, [roomCode]);

  // Upload files
  const uploadFiles = useCallback(async (filesToUpload: File[]): Promise<void> => {
    const service = serviceRef.current;
    if (!service?.isConnected()) {
      setError('Not connected to the room');
      return;
    }
    setError(null);
    for (const file of filesToUpload) {
        if (serviceRef.current !== service) return;
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Add to uploading list
        setUploadingFiles(prev => [...prev, {
          id: uploadId,
          name: file.name,
          size: file.size,
          progress: 0
        }]);

        try {
          const uploaded = await service.addFile(file, (progress) => {
            if (serviceRef.current === service) {
              setUploadingFiles(prev => prev.map(f => f.id === uploadId ? { ...f, progress } : f));
            }
          });
          if (!uploaded) throw new Error('The server did not accept the file');
        } catch (err) {
          if (serviceRef.current === service) {
            setError(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`);
          }
        } finally {
          if (serviceRef.current === service) {
            setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
          }
        }
    }
  }, []);

  // Download file
  const downloadFile = useCallback(async (fileId: string, fileName: string): Promise<boolean> => {
    const service = serviceRef.current;
    if (!service?.isConnected()) {
      setError('Not connected to the room');
      return false;
    }
    setError(null);
    try {
      const blob = await service.downloadFile(fileId);
      if (serviceRef.current !== service) return false;
      if (blob) {
        // Trigger browser download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        try {
          a.click();
        } finally {
          a.remove();
          // Allow the browser to consume the URL before releasing it.
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        return true;
      } else {
        setError('Failed to download file');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Download failed';
      if (serviceRef.current === service) setError(errorMsg);
    }
    return false;
  }, []);

  // Delete file
  const deleteFile = useCallback(async (fileId: string): Promise<boolean> => {
    const service = serviceRef.current;
    if (!service?.isConnected()) {
      setError('Not connected to the room');
      return false;
    }
    setError(null);
    try {
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
    uploadingFiles,
    uploadFiles,
    deleteFile,
    sendText,
    retryText,
    updateDeviceName,
    downloadFile,
    retryConnection,
    loading,
    error,
    peers,
    isConnected,
    peerCount: peers.length,
    currentPeerId,
    currentPeerName: peerNameRef.current,
    textMessages,
    connectionMode: isConnected ? 'backend' : 'offline' as const
  };
}
