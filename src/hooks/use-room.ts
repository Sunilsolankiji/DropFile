"use client";

import { useState, useEffect, useCallback } from 'react';
import { collection, doc, addDoc, deleteDoc, onSnapshot, query, where, Timestamp, orderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

export interface SharedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  expiresAt: Timestamp;
}

const FILE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function useRoom(roomCode: string) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) return;
    setLoading(true);

    const roomRef = doc(db, 'rooms', roomCode);
    const filesCollectionRef = collection(roomRef, 'files');
    const q = query(filesCollectionRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Timestamp.now();
      const freshFiles: SharedFile[] = [];
      
      snapshot.forEach(doc => {
        const fileData = doc.data() as Omit<SharedFile, 'id'> & { createdAt: Timestamp };
        if (fileData.expiresAt.toMillis() > now.toMillis()) {
            freshFiles.push({ id: doc.id, ...fileData } as SharedFile);
        } else {
            // File expired, delete it from Firestore and Storage
            deleteFile(doc.id, fileData.name).catch(e => console.error("Failed to auto-delete expired file", e));
        }
      });
      
      setFiles(freshFiles);
      setLoading(false);
    }, (err) => {
      console.error("Firebase onSnapshot error:", err);
      setError("Could not connect to the sharing room.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [roomCode]);

  const uploadFiles = useCallback((filesToUpload: File[]) => {
    if (!roomCode) return;
    const roomRef = doc(db, 'rooms', roomCode);
    const filesCollectionRef = collection(roomRef, 'files');

    filesToUpload.forEach(file => {
      const storageRef = ref(storage, `rooms/${roomCode}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          // Can be used for progress indicators
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
            createdAt: Timestamp.now(),
            expiresAt: Timestamp.fromMillis(Date.now() + FILE_TTL_MS),
          });
        }
      );
    });
  }, [roomCode]);
  
  const deleteFile = async (fileId: string, fileName: string) => {
    if (!roomCode) return;
    try {
      // Delete from Firestore
      await deleteDoc(doc(db, 'rooms', roomCode, 'files', fileId));

      // Delete from Storage
      const storageRef = ref(storage, `rooms/${roomCode}/${fileName}`);
      await deleteObject(storageRef);
    } catch (err) {
        // We can ignore "not found" errors as another client might have deleted it
        if (err instanceof Error && 'code' in err && (err as any).code !== 'storage/object-not-found') {
             console.error("Error deleting file:", err);
             setError(`Failed to delete ${fileName}.`);
        }
    }
  };


  return { files, uploadFiles, deleteFile, loading, error };
}
