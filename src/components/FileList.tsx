import { useEffect, useRef, useState } from 'react';
import { Button, Modal, ProgressBar, Spinner } from 'react-bootstrap';
import { Download, File as FileIcon, FileArchive, FileCode, FileText, Image, Inbox, Music, Pause, Play, Trash2, Video, X } from 'lucide-react';
import { formatFileSize } from '@/lib/utils';
import type { ShareMetadata, TransferState } from '@/lib/transfer-types';
import './FileList.css';

interface FileListProps {
  files: ShareMetadata[];
  transfers: TransferState[];
  currentPeerId: string | null;
  disabled: boolean;
  onDelete: (fileId: string) => Promise<boolean>;
  onDownload: (fileId: string) => Promise<boolean>;
  onPause: (transferId: string) => void;
  onResume: (transferId: string) => Promise<boolean>;
  onCancel: (transferId: string) => Promise<boolean>;
  onAttachSource: (transferId: string, file: File) => Promise<boolean>;
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image;
  if (type.startsWith('video/')) return Video;
  if (type.startsWith('audio/')) return Music;
  if (/zip|rar|tar|gz/.test(type)) return FileArchive;
  if (/javascript|typescript|html|css|json/.test(type)) return FileCode;
  if (/pdf|document|text/.test(type)) return FileText;
  return FileIcon;
}

function expiryLabel(expiresAt: number, now: number) {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  if (!seconds) return 'Expired';
  if (seconds < 60) return 'Expires in less than a minute';
  const minutes = Math.ceil(seconds / 60);
  return `Expires in ${minutes} min`;
}

const terminalStates = new Set(['completed', 'cancelled', 'expired', 'removed', 'sender-timeout']);
const phaseLabels: Record<string, string> = {
  pending: 'Pending',
  ready: 'Ready',
  transferring: 'Transferring',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  removed: 'Removed',
  failed: 'Failed',
  offline: 'Offline',
  'sender-offline': 'Sender offline',
  'sender-timeout': 'Sender timed out',
  'receiver-offline': 'Receiver offline',
};

function ChunkProgress({ label, count, total, fileName }: {
  label: string;
  count: number;
  total: number;
  fileName: string;
}) {
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(count) || count < 0) return null;
  const chunks = Math.min(count, total);
  const percent = Math.floor(chunks / total * 100);
  return (
    <div className="file-transfer-progress">
      <div className="file-transfer-progress-label"><span>{label}</span><span>{percent}%</span></div>
      <ProgressBar
        now={percent}
        max={100}
        aria-label={`${label}: ${fileName}`}
        aria-valuetext={`${percent}%`}
      />
    </div>
  );
}

type Confirmation = { kind: 'remove' | 'cancel'; file: ShareMetadata; transferId?: string };

function FileRow({ file, transfer, now, canDelete, disabled, onDownload, onPause, onResume, onAttachSource, onConfirm }: {
  file: ShareMetadata;
  transfer?: TransferState;
  now: number;
  canDelete: boolean;
  disabled: boolean;
  onDownload: FileListProps['onDownload'];
  onPause: FileListProps['onPause'];
  onResume: FileListProps['onResume'];
  onAttachSource: FileListProps['onAttachSource'];
  onConfirm: (confirmation: Confirmation, trigger: HTMLButtonElement) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const sourceInput = useRef<HTMLInputElement>(null);
  const Icon = getFileIcon(file.type);
  const expired = file.expiresAt <= now;
  const remoteState = file.transfer?.state ?? file.status ?? 'pending';
  const remoteStopped = terminalStates.has(remoteState) &&
    !(remoteState === 'completed' && transfer?.role === 'receiver');
  const state = expired ? 'expired' : remoteStopped ? remoteState : transfer?.state ?? remoteState;
  const terminal = terminalStates.has(state);
  const needsSource = canDelete && transfer?.needsSource && transfer.canResume && !terminal;
  const paused = transfer?.paused && !terminal;
  const senderOffline = (file.transfer?.senderConnected ?? transfer?.senderConnected) === false;
  const receiverOffline = !!(file.transfer?.receiverPeerId ?? transfer?.receiverPeerId)
    && (file.transfer?.receiverConnected ?? transfer?.receiverConnected) === false;
  const resumable = !!transfer && transfer.canResume && !terminal && !needsSource && (
    transfer.paused || ['failed', 'offline', 'sender-offline', 'receiver-offline'].includes(state)
  );
  const active = !!transfer && !terminal && !transfer.paused && !needsSource &&
    ['pending', 'ready', 'transferring'].includes(state);
  const total = transfer?.totalChunks ?? file.totalChunks;
  const uploaded = Math.max(transfer?.uploadedChunkCount ?? 0, file.transfer?.uploadedChunks ?? 0);
  const acknowledged = Math.max(transfer?.acknowledgedChunkCount ?? 0, file.transfer?.acknowledgedChunks ?? 0);

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    setActionError('');
    try {
      if (!await action()) setActionError('The action could not be completed. Please try again.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The action could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="file-item file-transfer-row">
      <span className="file-icon"><Icon size={21} aria-hidden="true" /></span>
      <div className="file-info">
        <h3 className="file-name">{file.name}</h3>
        <div className="file-metadata">
          <span>{formatFileSize(file.size)}</span>
          <span>{canDelete ? 'You' : file.peerName}</span>
          <span className={expired ? 'text-danger' : ''}>{expiryLabel(file.expiresAt, now)}</span>
        </div>
        <div className="file-transfer-status" aria-live="polite">
          <span>{phaseLabels[state] ?? state}</span>
          {paused && <span>Paused</span>}
          {needsSource && <span>Original file needed to resume</span>}
          {!terminal && disabled && state !== 'offline' && <span>Offline</span>}
          {!terminal && senderOffline && state !== 'sender-offline' && <span>Sender offline</span>}
          {!terminal && receiverOffline && state !== 'receiver-offline' && <span>Receiver offline</span>}
        </div>
        {(transfer || file.transfer) && (
          <div className="file-transfer-progress-group">
            <ChunkProgress label="Sender uploaded" count={uploaded} total={total} fileName={file.name} />
            <ChunkProgress
              label={transfer?.role === 'receiver' ? 'Receiver downloaded' : 'Receiver acknowledged'}
              count={transfer?.role === 'receiver' ? transfer.receivedChunkCount : acknowledged}
              total={total}
              fileName={file.name}
            />
          </div>
        )}
        {(transfer?.error || transfer?.cancelReason) && <p className="file-transfer-reason">{transfer.error || transfer.cancelReason}</p>}
        {actionError && <p className="file-transfer-error" role="alert">{actionError}</p>}
      </div>
      <div className="file-actions file-transfer-actions">
        {!canDelete && (!transfer || state === 'completed') && <Button
          className="icon-button"
          variant="outline-secondary"
          onClick={() => void run(() => onDownload(file.id))}
          disabled={disabled || busy || terminal}
          aria-label={`Download ${file.name}`}
          title={state === 'completed' ? 'Transfer completed; this file may no longer be available' : 'Download file'}
        >
          {busy ? <Spinner animation="border" size="sm" aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
        </Button>}
        {active && <Button variant="outline-secondary" className="icon-button" onClick={() => onPause(transfer.transferId)} aria-label={`Pause ${file.name}`} title="Pause transfer"><Pause size={17} aria-hidden="true" /></Button>}
        {resumable && <Button variant="outline-secondary" className="icon-button" disabled={disabled || busy} onClick={() => void run(() => onResume(transfer.transferId))} aria-label={`Resume ${file.name}`} title="Resume transfer"><Play size={17} aria-hidden="true" /></Button>}
        {needsSource && transfer && <>
          <input
            ref={sourceInput}
            type="file"
            hidden
            aria-label={`Choose original file for ${file.name}`}
            onChange={(event) => {
              const source = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (source) void run(() => onAttachSource(transfer.transferId, source));
            }}
          />
          <Button variant="outline-secondary" size="sm" disabled={disabled || busy} onClick={() => sourceInput.current?.click()} aria-label={`Choose original file for ${file.name}`}>Choose original file</Button>
        </>}
        {transfer && !terminal && <Button variant="outline-secondary" className="icon-button" onClick={(event) => onConfirm({ kind: 'cancel', file, transferId: transfer.transferId }, event.currentTarget)} aria-label={`Cancel transfer of ${file.name}`} title="Cancel transfer for both devices"><X size={17} aria-hidden="true" /></Button>}
        {canDelete && <Button variant="link" className="icon-button delete-button" onClick={(event) => onConfirm({ kind: 'remove', file }, event.currentTarget)} disabled={disabled} aria-label={`Remove ${file.name}`} title="Remove file"><Trash2 size={16} aria-hidden="true" /></Button>}
      </div>
    </li>
  );
}

export default function FileList({ files, transfers, currentPeerId, disabled, onDelete, onDownload, onPause, onResume, onCancel, onAttachSource }: FileListProps) {
  const [now, setNow] = useState(Date.now);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const confirmationTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const confirm = async () => {
    if (!confirmation) return;
    setConfirming(true);
    setConfirmationError('');
    try {
      const result = confirmation.kind === 'remove'
        ? await onDelete(confirmation.file.id)
        : await onCancel(confirmation.transferId!);
      if (result) setConfirmation(null);
      else setConfirmationError('The action could not be completed. Please try again.');
    } catch (error) {
      setConfirmationError(error instanceof Error ? error.message : 'The action could not be completed. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      {!files.length ? (
        <div className="files-surface empty-state">
          <Inbox size={32} strokeWidth={1.4} aria-hidden="true" />
          <h3>Your files will land here</h3>
          <p>Add a file above, or share the room code so another device can send one to you.</p>
        </div>
      ) : (
      <div className="files-surface">
        <ul className="file-list" aria-label="Shared files and transfers">
          {files.map(file => {
            const canDelete = file.peerId === currentPeerId;
            const transfer = transfers.find(item => item.fileId === file.id && item.role === (canDelete ? 'sender' : 'receiver'));
            return <FileRow key={file.id} file={file} transfer={transfer} now={now} canDelete={canDelete} disabled={disabled} onDownload={onDownload} onPause={onPause} onResume={onResume} onAttachSource={onAttachSource} onConfirm={(next, trigger) => {
              confirmationTrigger.current = trigger;
              setConfirmationError('');
              setConfirmation(next);
            }} />;
          })}
        </ul>
      </div>
      )}
      <Modal
        show={!!confirmation}
        onHide={() => { if (!confirming) setConfirmation(null); }}
        onExited={() => {
          const target = confirmationTrigger.current?.isConnected ? confirmationTrigger.current : document.getElementById('files-title');
          target?.focus();
        }}
        restoreFocus={false}
        centered
        aria-labelledby="file-transfer-confirm-title"
      >
        <Modal.Header closeButton={!confirming}><Modal.Title id="file-transfer-confirm-title">{confirmation?.kind === 'cancel' ? 'Cancel this transfer?' : 'Remove this file?'}</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="share-intro mb-0 file-transfer-confirm-copy"><strong>{confirmation?.file.name}</strong>{confirmation?.kind === 'cancel'
            ? " will stop transferring for both devices. This cannot be resumed. Files already downloaded won't be affected."
            : " will no longer be available in this room. Files already downloaded won't be affected."}</p>
          {confirmation?.kind === 'cancel' && disabled && <p className="file-transfer-reason">Stops locally now; the other device will be notified when you reconnect.</p>}
          {confirmationError && <p className="file-transfer-error" role="alert">{confirmationError}</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={confirming} onClick={() => setConfirmation(null)}>{confirmation?.kind === 'cancel' ? 'Keep transfer' : 'Keep file'}</Button>
          <Button variant="danger" disabled={confirming || (confirmation?.kind === 'remove' && disabled)} onClick={() => void confirm()}>{confirmation?.kind === 'cancel' ? (confirming ? 'Cancelling...' : 'Cancel transfer') : (confirming ? 'Removing...' : 'Remove file')}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
