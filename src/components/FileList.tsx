import { useState, useEffect } from 'react';
import { Card, Button, ListGroup } from 'react-bootstrap';
import { FileText, Download, Trash2, Clock, Inbox, Monitor, Cloud } from 'lucide-react';
import { formatFileSize } from '@/lib/utils';
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
    <ListGroup.Item className="file-item d-flex align-items-center">
      <FileText size={32} className="text-primary me-3 flex-shrink-0" />
      <div className="flex-grow-1 overflow-hidden me-3">
        <div className="d-flex align-items-center gap-2">
          <span className="fw-medium text-truncate" title={file.name}>{file.name}</span>
          {file.isLocal ? (
            <span title="Local file">
              <Monitor size={12} className="status-local" />
            </span>
          ) : (
            <span title="Cloud file">
              <Cloud size={12} className="status-cloud" />
            </span>
          )}
        </div>
        <small className="text-muted">{formatFileSize(file.size)}</small>
      </div>
      <div className="d-flex align-items-center gap-2">
        <span className={`time-badge d-flex align-items-center gap-1 ${timeLeft === 'Expired' ? 'expired' : 'text-muted'}`}>
          <Clock size={14} />
          {timeLeft}
        </span>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          <Download size={16} />
        </Button>
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => onDelete(file.id, file.storagePath)}
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </ListGroup.Item>
  );
}

export default function FileList({ files, onDelete, onDownload }: FileListProps) {
  if (files.length === 0) {
    return (
      <Card>
        <Card.Body className="text-center py-5">
          <Inbox size={64} className="text-muted mb-3" />
          <h5>Empty Room</h5>
          <p className="text-muted mb-0">Upload some files to get started!</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <ListGroup variant="flush">
        {files.map(file => (
          <FileListItem key={file.id} file={file} onDelete={onDelete} onDownload={onDownload} />
        ))}
      </ListGroup>
    </Card>
  );
}
