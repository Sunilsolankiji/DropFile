import { useState, useEffect } from 'react';
import { File as FileIcon, Download, Trash2, Clock, Inbox, Monitor, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatFileSize, cn } from '@/lib/utils';
import type { SharedFile } from '@/hooks/use-room';
import { Timestamp } from 'firebase/firestore';

interface FileListProps {
  files: SharedFile[];
  onDelete: (fileId: string, storagePath: string) => void;
  onDownload?: (fileId: string) => Promise<string | null>;
}

function FileListItem({
  file,
  onDelete,
  onDownload
}: {
  file: SharedFile;
  onDelete: (fileId: string, storagePath: string) => void;
  onDownload?: (fileId: string) => Promise<string | null>;
}) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      if (!file.expiresAt) {
          setTimeLeft('N/A');
          return null;
      }
      // firebase.firestore.Timestamp has toDate(), but we might get a plain object from server.
      const expiryTime = (file.expiresAt instanceof Timestamp)
        ? file.expiresAt.toMillis()
        : new Date((file.expiresAt as { seconds: number }).seconds * 1000).getTime();
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

  const handleDownload = async () => {
    if (file.isLocal && onDownload) {
      setIsDownloading(true);
      try {
        const url = await onDownload(file.id);
        if (url) {
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } finally {
        setIsDownloading(false);
      }
    } else if (file.url) {
      window.open(file.url, '_blank');
    }
  };

  return (
    <div className="flex items-center p-3 hover:bg-secondary/50 rounded-md transition-colors">
      <FileIcon className="w-8 h-8 mr-4 text-primary" />
      <div className="flex-grow overflow-hidden">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate" title={file.name}>{file.name}</p>
          {file.isLocal ? (
            <Monitor className="w-3 h-3 text-green-500 flex-shrink-0" title="Local file" />
          ) : (
            <Cloud className="w-3 h-3 text-blue-500 flex-shrink-0" title="Cloud file" />
          )}
        </div>
        <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
      </div>
      <div className="flex items-center gap-2 md:gap-4 ml-4">
        <div className={cn("flex items-center gap-1 text-sm tabular-nums", timeLeft === 'Expired' ? 'text-destructive' : 'text-muted-foreground')}>
          <Clock className="w-4 h-4" />
          <span>{timeLeft}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          <Download className={cn("w-5 h-5", isDownloading && "animate-pulse")} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(file.id, file.storagePath)} className="w-9 h-9 hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

export default function FileList({ files, onDelete, onDownload }: FileListProps) {
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
            <FileListItem key={file.id} file={file} onDelete={onDelete} onDownload={onDownload} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
