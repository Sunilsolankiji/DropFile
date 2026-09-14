import { useEffect, useRef, useState } from 'react';
import { Button, Modal, ProgressBar, Spinner } from 'react-bootstrap';
import { Download, File, FileArchive, FileCode, FileText, Image, Inbox, Music, Trash2, Video } from 'lucide-react';
import { formatFileSize } from '@/lib/utils';
import type { SharedFile, UploadingFile } from '@/hooks/use-backend-room';

interface FileListProps {
  files: SharedFile[];
  uploadingFiles: UploadingFile[];
  currentPeerId: string | null;
  disabled: boolean;
  onDelete: (fileId: string) => boolean | void | Promise<boolean | void>;
  onDownload: (fileId: string, fileName: string) => Promise<boolean>;
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return Video;
  if (type.startsWith('audio/')) return Music;
  if (/zip|rar|tar|gz/.test(type)) return FileArchive;
  if (/javascript|typescript|html|css|json/.test(type)) return FileCode;
  if (/pdf|document|text/.test(type)) return FileText;
  return File;
}

function expiryLabel(expiresAt: number, now: number) {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  if (!seconds) return 'Expired';
  if (seconds < 60) return 'Expires in less than a minute';
  const minutes = Math.ceil(seconds / 60);
  return `Expires in ${minutes} min`;
}

function FileRow({ file, now, canDelete, disabled, onDownload, onDelete }: {
  file: SharedFile;
  now: number;
  canDelete: boolean;
  disabled: boolean;
  onDownload: FileListProps['onDownload'];
  onDelete: (trigger: HTMLButtonElement) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const Icon = getFileIcon(file.type);
  const expired = file.expiresAt <= now;

  const download = async () => {
    setDownloading(true);
    try {
      await onDownload(file.id, file.name);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li className="file-item">
      <span className="file-icon"><Icon size={21} aria-hidden="true" /></span>
      <div className="file-info">
        <h3 className="file-name">{file.name}</h3>
        <div className="file-metadata">
          <span>{formatFileSize(file.size)}</span>
          <span>{canDelete ? 'You' : file.peerName}</span>
          <span className={expired ? 'text-danger' : ''}>{expiryLabel(file.expiresAt, now)}</span>
        </div>
      </div>
      <div className="file-actions">
        <Button
          className="icon-button"
          variant="outline-secondary"
          onClick={download}
          disabled={disabled || downloading || expired}
          aria-label={`${downloading ? 'Downloading' : 'Download'} ${file.name}`}
          title={downloading ? 'Downloading...' : 'Download file'}
        >
          {downloading ? <Spinner animation="border" size="sm" aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
        </Button>
        {canDelete && <Button variant="link" className="icon-button delete-button" onClick={(event) => onDelete(event.currentTarget)} disabled={disabled || expired} aria-label={`Remove ${file.name}`} title="Remove file"><Trash2 size={16} aria-hidden="true" /></Button>}
      </div>
    </li>
  );
}

export default function FileList({ files, uploadingFiles, currentPeerId, disabled, onDelete, onDownload }: FileListProps) {
  const [now, setNow] = useState(Date.now);
  const [fileToDelete, setFileToDelete] = useState<SharedFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remove = async () => {
    if (!fileToDelete) return;
    setDeleting(true);
    try {
      const result = await onDelete(fileToDelete.id);
      if (result !== false) setFileToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {!files.length && !uploadingFiles.length ? (
        <div className="files-surface empty-state">
          <Inbox size={32} strokeWidth={1.4} aria-hidden="true" />
          <h3>Your files will land here</h3>
          <p>Add a file above, or share the room code so another device can send one to you.</p>
        </div>
      ) : (
      <div className="files-surface">
        <ul className="file-list" aria-label="Shared files and uploads">
          {uploadingFiles.map(file => (
            <li key={file.id} className="file-item">
              <span className="file-icon"><File size={21} aria-hidden="true" /></span>
              <div className="file-info">
                <h3 className="file-name">{file.name}</h3>
                <div className="file-metadata"><span>{formatFileSize(file.size)}</span><span className="upload-label">{file.progress >= 100 ? 'Finishing upload...' : file.progress < 50 ? 'Preparing file...' : 'Uploading...'}</span></div>
                <ProgressBar className="upload-progress" now={file.progress} aria-label={`Sharing ${file.name}`} aria-valuetext={file.progress < 50 ? 'Preparing file' : 'Waiting for server confirmation'} />
              </div>
            </li>
          ))}
          {files.map(file => (
            <FileRow key={file.id} file={file} now={now} canDelete={file.peerId === currentPeerId} disabled={disabled} onDownload={onDownload} onDelete={(trigger) => { deleteTrigger.current = trigger; setFileToDelete(file); }} />
          ))}
        </ul>
      </div>
      )}
      <Modal
        show={!!fileToDelete}
        onHide={() => { if (!deleting) setFileToDelete(null); }}
        onExited={() => {
          const target = deleteTrigger.current?.isConnected ? deleteTrigger.current : document.getElementById('files-title');
          target?.focus();
        }}
        restoreFocus={false}
        centered
        aria-labelledby="remove-title"
      >
        <Modal.Header closeButton={!deleting}><Modal.Title id="remove-title">Remove this file?</Modal.Title></Modal.Header>
        <Modal.Body><p className="share-intro mb-0"><strong>{fileToDelete?.name}</strong> will no longer be available in this room. Files already downloaded won't be affected.</p></Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={deleting} onClick={() => setFileToDelete(null)}>Keep file</Button>
          <Button variant="danger" disabled={disabled || deleting} onClick={remove}>{deleting ? 'Removing...' : 'Remove file'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
