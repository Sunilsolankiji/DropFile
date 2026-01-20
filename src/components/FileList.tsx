import { useState, useEffect } from 'react';
import { Card, Button } from 'react-bootstrap';
import { FileText, Download, Trash2, Clock, Inbox, Monitor, Cloud, File, Image, Music, Video, FileArchive, FileCode } from 'lucide-react';
import { formatFileSize } from '@/lib/utils';
import type { SharedFile } from '@/hooks/use-room';
import { Timestamp } from 'firebase/firestore';

interface FileListProps {
  files: SharedFile[];
  onDelete: (fileId: string, storagePath: string) => void;
  onDownload?: (fileId: string) => Promise<string | null>;
}

// Get icon based on file type
function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return Video;
  if (type.startsWith('audio/')) return Music;
  if (type.includes('zip') || type.includes('rar') || type.includes('tar') || type.includes('gz')) return FileArchive;
  if (type.includes('javascript') || type.includes('typescript') || type.includes('html') || type.includes('css') || type.includes('json')) return FileCode;
  if (type.includes('pdf') || type.includes('document') || type.includes('text')) return FileText;
  return File;
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

  const FileIcon = getFileIcon(file.type);

  return (
    <div className="file-item d-flex align-items-center">
      <div className="file-icon me-3">
        <FileIcon size={24} style={{ width: 24, height: 24 }} />
      </div>
      <div className="flex-grow-1 overflow-hidden me-3">
        <div className="d-flex align-items-center gap-2 mb-1">
          <span className="file-name text-truncate" title={file.name}>{file.name}</span>
          {file.isLocal ? (
            <span title="Local file" className="badge bg-success bg-opacity-10 text-success d-inline-flex align-items-center gap-1 px-2 py-1" style={{ fontSize: '0.7rem' }}>
              <Monitor size={10} style={{ width: 10, height: 10 }} /> Local
            </span>
          ) : (
            <span title="Cloud file" className="badge bg-primary bg-opacity-10 text-primary d-inline-flex align-items-center gap-1 px-2 py-1" style={{ fontSize: '0.7rem' }}>
              <Cloud size={10} style={{ width: 10, height: 10 }} /> Cloud
            </span>
          )}
        </div>
        <span className="file-size">{formatFileSize(file.size)}</span>
      </div>
      <div className="d-flex align-items-center gap-2">
        <span className={`time-badge d-flex align-items-center gap-1 ${timeLeft === 'Expired' ? 'expired' : ''}`}>
          <Clock size={14} style={{ width: 14, height: 14 }} />
          {timeLeft}
        </span>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={handleDownload}
          disabled={isDownloading}
          className="d-flex align-items-center justify-content-center"
          style={{ width: '36px', height: '36px', padding: 0 }}
        >
          <Download size={16} style={{ width: 16, height: 16 }} className={isDownloading ? 'pulse-animation' : ''} />
        </Button>
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => onDelete(file.id, file.storagePath)}
          className="d-flex align-items-center justify-content-center"
          style={{ width: '36px', height: '36px', padding: 0 }}
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  );
}

export default function FileList({ files, onDelete, onDownload }: FileListProps) {
  if (files.length === 0) {
    return (
      <Card>
        <Card.Body className="empty-state">
          <div className="empty-state-icon">
            <Inbox size={48} />
          </div>
          <h5>No files yet</h5>
          <p className="mb-0">Upload some files to get started sharing!</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Body className="p-3">
        {files.map(file => (
          <FileListItem key={file.id} file={file} onDelete={onDelete} onDownload={onDownload} />
        ))}
      </Card.Body>
    </Card>
  );
}
