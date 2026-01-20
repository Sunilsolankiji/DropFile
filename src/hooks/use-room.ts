import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, addDoc, deleteDoc, onSnapshot, query, Timestamp, orderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { LocalNetworkService, LocalFileMetadata } from '@/lib/local-network';

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  storagePath: string;
  expiresAt: Timestamp | { seconds: number };
  isLocal?: boolean;
  peerId?: string;
}

export type ConnectionMode = 'local' | 'firebase' | 'both';

const FILE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function useRoom(roomCode: string) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('firebase');
  const [localPeerCount, setLocalPeerCount] = useState(0);
  const [isLocalConnected, setIsLocalConnected] = useState(false);

  const localServiceRef = useRef<LocalNetworkService | null>(null);
  const localFilesRef = useRef<LocalFileMetadata[]>([]);
  const firebaseFilesRef = useRef<SharedFile[]>([]);

  // Merge local and firebase files
  const mergeFiles = useCallback(() => {
    const localFiles: SharedFile[] = localFilesRef.current.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      type: f.type,
      url: '', // Local files don't have URLs, they're fetched directly
      storagePath: '',
      expiresAt: { seconds: Math.floor(f.expiresAt / 1000) },
      isLocal: true,
      peerId: f.peerId
    }));

    // Deduplicate by name (prefer local files)
    const localNames = new Set(localFiles.map(f => f.name));
    const uniqueFirebaseFiles = firebaseFilesRef.current.filter(f => !localNames.has(f.name));

    const merged = [...localFiles, ...uniqueFirebaseFiles].sort((a, b) => {
      const aTime = 'toMillis' in a.expiresAt ? a.expiresAt.toMillis() : a.expiresAt.seconds * 1000;
      const bTime = 'toMillis' in b.expiresAt ? b.expiresAt.toMillis() : b.expiresAt.seconds * 1000;
      return bTime - aTime; // Most recent first
    });

    setFiles(merged);
  }, []);

  const deleteFile = useCallback(async (fileId: string, storagePath: string) => {
    if (!roomCode) return;

    // Check if it's a local file
    const localFile = localFilesRef.current.find(f => f.id === fileId);
    if (localFile && localServiceRef.current) {
      localServiceRef.current.removeFile(fileId);
      return;
    }

    // Firebase file
    try {
      await deleteDoc(doc(db, 'rooms', roomCode, 'files', fileId));
      const storageRef = ref(storage, storagePath);
      await deleteObject(storageRef);
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as any).code !== 'storage/object-not-found') {
        console.error("Error deleting file:", err);
        setError(`Failed to delete a file.`);
      }
    }
  }, [roomCode]);

  // Initialize local network service
  useEffect(() => {
    if (!roomCode) return;

    const localService = new LocalNetworkService(
      roomCode,
      (files) => {
        localFilesRef.current = files;
        mergeFiles();
      },
      (connected, peerCount) => {
        setIsLocalConnected(connected);
        setLocalPeerCount(peerCount);
        if (connected && peerCount > 0) {
          setConnectionMode('both');
        } else if (connected) {
          setConnectionMode('both');
        }
      }
    );

    localService.connect().then((connected) => {
      if (connected) {
        localServiceRef.current = localService;
        setIsLocalConnected(true);
      }
    });

    return () => {
      localService.disconnect();
      localServiceRef.current = null;
    };
  }, [roomCode, mergeFiles]);

  // Firebase listener
  useEffect(() => {
    if (!roomCode) return;
    setLoading(true);

    const apiKey = db.app.options.apiKey;
    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE' || apiKey === 'your_api_key_here' || apiKey === 'undefined') {
      // No Firebase configured, rely on local only
      if (isLocalConnected) {
        setConnectionMode('local');
        setLoading(false);
        return;
      }
      setError("No connection available. Configure Firebase or ensure you're on the same network as other users.");
      setLoading(false);
      return;
    }

    const roomRef = doc(db, 'rooms', roomCode);
    const filesCollectionRef = collection(roomRef, 'files');
    const q = query(filesCollectionRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Timestamp.now();
      const freshFiles: SharedFile[] = [];

      snapshot.forEach(docSnap => {
        const fileData = docSnap.data() as Omit<SharedFile, 'id'> & { createdAt: Timestamp };
        const expiresAt = fileData.expiresAt as Timestamp;
        if (expiresAt.toMillis() > now.toMillis()) {
          freshFiles.push({ id: docSnap.id, ...fileData, isLocal: false });
        } else {
          deleteFile(docSnap.id, fileData.storagePath).catch(e =>
            console.error("Failed to auto-delete expired file", e)
          );
        }
      });

      firebaseFilesRef.current = freshFiles;
      mergeFiles();
      setLoading(false);
    }, (err) => {
      console.error("Firebase onSnapshot error:", err);
      if (isLocalConnected) {
        setConnectionMode('local');
        setLoading(false);
      } else {
        setError("Could not connect to the room. Check your Firebase config & security rules.");
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [roomCode, deleteFile, mergeFiles, isLocalConnected]);

  const uploadFiles = useCallback(async (filesToUpload: File[]) => {
    if (!roomCode) return;

    for (const file of filesToUpload) {
      // Try local first if connected and there are peers
      if (localServiceRef.current && isLocalConnected) {
        try {
          await localServiceRef.current.addFile(file);
          // If we have Firebase too, also upload there for remote access
          if (connectionMode === 'both' || connectionMode === 'firebase') {
            uploadToFirebase(file);
          }
          continue;
        } catch (err) {
          console.error("Local upload failed, falling back to Firebase:", err);
        }
      }

      // Firebase upload
      uploadToFirebase(file);
    }
  }, [roomCode, isLocalConnected, connectionMode]);

  const uploadToFirebase = useCallback((file: File) => {
    if (!roomCode) return;

    const roomRef = doc(db, 'rooms', roomCode);
    const filesCollectionRef = collection(roomRef, 'files');
    const storagePath = `rooms/${roomCode}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed',
      () => {
        // Progress handler
      },
      (err) => {
        console.error("Upload error:", err);
        setError(`Failed to upload ${file.name}.`);
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        await addDoc(filesCollectionRef, {
          name: file.name,
          size: file.size,
          type: file.type,
          url: downloadURL,
          storagePath: storagePath,
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromMillis(Date.now() + FILE_TTL_MS),
        });
      }
    );
  }, [roomCode]);

  const downloadFile = useCallback(async (fileId: string): Promise<string | null> => {
    // Check if it's a local file
    if (localServiceRef.current) {
      if (localServiceRef.current.isLocalFile(fileId)) {
        const blob = localServiceRef.current.getFileBlob(fileId);
        if (blob) {
          return URL.createObjectURL(blob);
        }
      } else {
        // Try to get from remote peer
        const blob = await localServiceRef.current.requestRemoteFile(fileId);
        if (blob) {
          return URL.createObjectURL(blob);
        }
      }
    }

    // Return null for Firebase files - they have direct URLs
    return null;
  }, []);

  return {
    files,
    uploadFiles,
    deleteFile,
    downloadFile,
    loading,
    error,
    connectionMode,
    localPeerCount,
    isLocalConnected
  };
}
