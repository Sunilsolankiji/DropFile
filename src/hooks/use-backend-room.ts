/**
 * Backend-only Room Hook
 * Uses the new backend server for all file sharing
 * No Firebase, no local-network complexity
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NetworkPeerService, NetworkPeer } from '@/lib/network-peer-service';

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
  const [isConnected, setIsConnected] = useState(false);
  const [currentPeerId, setCurrentPeerId] = useState<string | null>(null);

  const serviceRef = useRef<NetworkPeerService | null>(null);
  const peerNameRef = useRef<string>(getOrCreateDeviceName());
  const deviceIdRef = useRef<string>(getOrCreateDeviceId());

  // Initialize backend service
  useEffect(() => {
    let mounted = true;

    // Skip if already connected to this room
    if (serviceRef.current && isConnected) {
      console.log('Already connected to room, skipping');
      return;
    }

    const initService = async () => {
      try {
        console.log(`Connecting to backend: ${BACKEND_URL}`);

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
            }
          },
          deviceIdRef.current
        );

        const connected = await service.connect();
        if (mounted) {
          setIsConnected(connected);
          if (connected) {
            serviceRef.current = service;
            setCurrentPeerId(service.getPeerId());
            setError(null);
            setLoading(false);
          } else {
            setError('Failed to connect to backend server');
            setLoading(false);
          }
        }
      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : 'Connection failed';
          console.error('Backend connection error:', err);
          setError(`Cannot connect to backend: ${errorMsg}`);
          setLoading(false);
        }
      }
    };

    initService();

    return () => {
      mounted = false;
      // Don't disconnect immediately - let the service persist
      // Only disconnect when component fully unmounts or room changes
    };
  }, [roomCode]);

  // Upload files
  const uploadFiles = useCallback(async (filesToUpload: File[]) => {
    if (!serviceRef.current) {
      setError('Not connected to backend');
      return;
    }

    try {
      for (const file of filesToUpload) {
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Add to uploading list
        setUploadingFiles(prev => [...prev, {
          id: uploadId,
          name: file.name,
          size: file.size,
          progress: 0
        }]);

        const success = await serviceRef.current.addFile(file, (progress) => {
          setUploadingFiles(prev =>
            prev.map(f => f.id === uploadId ? { ...f, progress } : f)
          );
        });

        // Remove from uploading list
        setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));

        if (!success) {
          setError(`Failed to upload ${file.name}`);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMsg);
    }
  }, []);

  // Download file
  const downloadFile = useCallback(async (fileId: string, fileName: string) => {
    if (!serviceRef.current) {
      setError('Not connected to backend');
      return;
    }

    try {
      const blob = await serviceRef.current.downloadFile(fileId);
      if (blob) {
        // Trigger browser download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        setError('Failed to download file');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Download failed';
      setError(errorMsg);
    }
  }, []);

  // Delete file
  const deleteFile = useCallback((fileId: string) => {
    if (!serviceRef.current) {
      setError('Not connected to backend');
      return;
    }

    try {
      serviceRef.current.removeFile(fileId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Delete failed';
      setError(errorMsg);
    }
  }, []);

  return {
    files,
    uploadingFiles,
    uploadFiles,
    deleteFile,
    downloadFile,
    loading,
    error,
    peers,
    isConnected,
    peerCount: peers.length,
    currentPeerId,
    currentPeerName: peerNameRef.current,
    connectionMode: isConnected ? 'backend' : 'offline' as const
  };
}

