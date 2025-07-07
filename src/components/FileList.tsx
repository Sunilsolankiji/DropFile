"use client";

import { useState, useEffect } from 'react';
import { File as FileIcon, Download, Trash2, Clock, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatFileSize, cn } from '@/lib/utils';
import type { SharedFile } from '@/hooks/use-room';
import { Timestamp } from 'firebase/firestore';

interface FileListProps {
  files: SharedFile[];
  onDelete: (fileId: string, storagePath: string) => void;
}

function FileListItem({ file, onDelete }: { file: SharedFile; onDelete: (fileId: string, storagePath: string) => void; }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      if (!file.expiresAt) {
          setTimeLeft('N/A');
          return null;
      }
      // firebase.firestore.Timestamp has toDate(), but we might get a plain object from server.
      const expiryTime = (file.expiresAt instanceof Timestamp) ? file.expiresAt.toMillis() : new Date(file.expiresAt.seconds * 1000).getTime();
      const distance = expiryTime - now;

      if (distance < 0) {
        setTimeLeft('Expired');
        return null;
      }

      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      return distance;
    };

    const initialDistance = calculateTimeLeft();
    if (initialDistance === null) return;
    
    const interval = setInterval(() => {
        if (calculateTimeLeft() === null) {
            clearInterval(interval);
        }
    }, 1000);

    return () => clearInterval(interval);
  }, [file.expiresAt]);

  return (
    <div className="flex items-center p-3 hover:bg-secondary/50 rounded-md transition-colors">
      <FileIcon className="w-8 h-8 mr-4 text-primary" />
      <div className="flex-grow overflow-hidden">
        <p className="font-medium truncate" title={file.name}>{file.name}</p>
        <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
      </div>
      <div className="flex items-center gap-2 md:gap-4 ml-4">
        <div className={cn("flex items-center gap-1 text-sm tabular-nums", timeLeft === 'Expired' ? 'text-destructive' : 'text-muted-foreground')}>
          <Clock className="w-4 h-4" />
          <span>{timeLeft}</span>
        </div>
        <Button asChild variant="ghost" size="icon" className="w-9 h-9">
          <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer">
            <Download className="w-5 h-5" />
          </a>
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(file.id, file.storagePath)} className="w-9 h-9 hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

export default function FileList({ files, onDelete }: FileListProps) {
  if (files.length === 0) {
    return (
      <Card className="border-none shadow-none">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
          <Inbox className="w-16 h-16 mb-4" />
          <h3 className="text-xl font-semibold">Empty Room</h3>
          <p className="mt-1">Upload some files to get started!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-2">
        <div className="space-y-1">
          {files.map(file => (
            <FileListItem key={file.id} file={file} onDelete={onDelete} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
