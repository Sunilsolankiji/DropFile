import { Button, Modal } from 'react-bootstrap';
import { Check, Clock, Copy, Link, Users, Wifi } from 'lucide-react';
import QrImage from './QrImage';
import { useCopyText } from '@/hooks/use-copy-text';
import { useShareableUrl } from '@/lib/shareable-url';
import { LAN_MODE } from '@/lib/config';

interface ShareRoomModalProps {
  show: boolean;
  onHide: () => void;
  roomCode: string;
  peerCount: number;
  connected: boolean;
}

export default function ShareRoomModal({ show, onHide, roomCode, peerCount, connected }: ShareRoomModalProps) {
  const { copy, copiedText } = useCopyText();
  const roomUrl = useShareableUrl();

  return (
    <Modal show={show} onHide={onHide} centered aria-labelledby="share-title">
      <Modal.Header closeButton><Modal.Title id="share-title">Bring another device</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="share-intro">Send this code or link to someone, or scan the QR with another device. Anyone with the code can join.</p>
        <div className="form-label" id="share-code-label">Room code</div>
        <div className="share-code-row">
          <code className="share-code" aria-labelledby="share-code-label">{roomCode}</code>
          <Button variant="outline-secondary" className="icon-button" onClick={() => copy(roomCode)} aria-label={copiedText === roomCode ? 'Room code copied' : 'Copy room code'} title="Copy room code">
            {copiedText === roomCode ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
          </Button>
        </div>
        <Button variant="outline-secondary" className="share-link-button" onClick={() => copy(roomUrl)}>
          {copiedText === roomUrl ? <Check size={16} aria-hidden="true" /> : <Link size={16} aria-hidden="true" />}
          {copiedText === roomUrl ? 'Link copied' : 'Copy room link'}
        </Button>
        <span className="visually-hidden" role="status">{copiedText === roomCode ? 'Room code copied' : copiedText === roomUrl ? 'Room link copied' : ''}</span>
        {show && (
          <figure className="qr-block">
            <QrImage value={roomUrl} alt="Scan to open this DropFile room" />
            <figcaption>Scan with your phone's camera</figcaption>
          </figure>
        )}
        <div className="share-details">
          <p><Users size={15} aria-hidden="true" />{connected ? `${peerCount} device${peerCount === 1 ? '' : 's'} in this room` : 'Waiting for a connection'}</p>
          <p><Wifi size={15} aria-hidden="true" />{LAN_MODE ? 'Local network mode: devices must be on the same Wi-Fi as this server.' : 'On the same Wi-Fi, downloads go directly between devices when possible.'}</p>
          <p><Clock size={15} aria-hidden="true" />Files are temporary. Check each file's expiry before leaving.</p>
        </div>
      </Modal.Body>
    </Modal>
  );
}
