import { useState, useEffect } from 'react';
import { Card, Button, ProgressBar } from 'react-bootstrap';
import { FileText, Download, Trash2, Clock, Inbox, File, Image, Music, Video, FileArchive, FileCode, Upload } from 'lucide-react';
import { formatFileSize } from '@/lib/utils';
import type { SharedFile, UploadingFile } from '@/hooks/use-backend-room';

interface FileListProps {
  files: SharedFile[];
  uploadingFiles?: UploadingFile[];
  onDelete: (fileId: string) => void;
  onDownload?: (fileId: string, fileName: string) => Promise<void>;
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

function UploadingFileItem({ file }: { file: UploadingFile }) {
  return (
    <div className="file-item d-flex align-items-center uploading">
      <div className="file-icon me-3">
        <Upload size={24} style={{ width: 24, height: 24 }} className="pulse-animation text-primary" />
      </div>
      <div className="flex-grow-1 overflow-hidden me-3">
        <div className="d-flex align-items-center gap-2 mb-1">
          <h6 className="mb-0 text-truncate">{file.name}</h6>
          <span className="badge bg-warning bg-opacity-10 text-warning d-inline-flex align-items-center gap-1 px-2 py-1" style={{ fontSize: '0.7rem' }}>
            Uploading
          </span>
        </div>
        <div className="d-flex align-items-center gap-2 mb-2">
          <small className="text-muted">{formatFileSize(file.size)}</small>
          <small className="text-primary fw-semibold">{file.progress}%</small>
        </div>
        <ProgressBar
          now={file.progress}
          variant="primary"
          animated
          style={{ height: '4px' }}
        />
      </div>
    </div>
  );
}

function FileListItem({
  file,
  onDelete,
  onDownload
}: {
  file: SharedFile;
  onDelete: (fileId: string) => void;
  onDownload?: (fileId: string, fileName: string) => Promise<void>;
}) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const expiryTime = file.expiresAt; // Already a timestamp in milliseconds
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
    if (onDownload) {
      setIsDownloading(true);
      try {
        await onDownload(file.id, file.name);
      } finally {
        setIsDownloading(false);
      }
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
          <h6 className="mb-0">{file.name}</h6>
          <span title="Backend file" className="badge bg-primary bg-opacity-10 text-primary d-inline-flex align-items-center gap-1 px-2 py-1" style={{ fontSize: '0.7rem' }}>
            Backend
          </span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <small>{file.peerName}</small>
          <span className="file-size">{formatFileSize(file.size)}</span>
        </div>
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
          onClick={() => onDelete(file.id)}
          className="d-flex align-items-center justify-content-center"
          style={{ width: '36px', height: '36px', padding: 0 }}
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  );
}

export default function FileList({ files, uploadingFiles = [], onDelete, onDownload }: FileListProps) {
  const hasFiles = files.length > 0 || uploadingFiles.length > 0;

  if (!hasFiles) {
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
        {/* Show uploading files first */}
        {uploadingFiles.map(file => (
          <UploadingFileItem key={file.id} file={file} />
        ))}
        {/* Show uploaded files */}
        {files.map(file => (
          <FileListItem key={file.id} file={file} onDelete={onDelete} onDownload={onDownload} />
        ))}
      </Card.Body>
    </Card>
  );
}
