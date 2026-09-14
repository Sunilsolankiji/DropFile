import { useEffect, useRef, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { Check, Clock, Copy, Link, Monitor, Users } from 'lucide-react';
import QRCode from 'qrcode';
import { useCopyText } from '@/hooks/use-copy-text';

interface ShareRoomModalProps {
  show: boolean;
  onHide: () => void;
  roomCode: string;
  deviceName: string;
  peerCount: number;
  connected: boolean;
  onRename: (name: string) => boolean;
}

export default function ShareRoomModal({ show, onHide, roomCode, deviceName, peerCount, connected, onRename }: ShareRoomModalProps) {
  const [qrCode, setQrCode] = useState('');
  const [qrError, setQrError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(deviceName);
  const [nameError, setNameError] = useState('');
  const renameButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const { copy, copiedText } = useCopyText();
  const roomUrl = window.location.href;

  useEffect(() => {
    if (show && wasEditing.current && !editing) renameButton.current?.focus();
    wasEditing.current = editing;
  }, [editing, show]);

  useEffect(() => {
    if (!show) return;
    let active = true;
    setQrCode('');
    setQrError(false);
    QRCode.toDataURL(roomUrl, { width: 352, margin: 2, color: { dark: '#202936', light: '#ffffff' } })
      .then(url => { if (active) setQrCode(url); })
      .catch(() => { if (active) setQrError(true); });
    return () => { active = false; };
  }, [show, roomUrl]);

  const close = () => {
    setEditing(false);
    setNameError('');
    onHide();
  };

  const rename = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('Enter a name for this device.');
      return;
    }
    if (onRename(name.trim())) {
      setEditing(false);
      setNameError('');
    }
  };

  return (
    <Modal show={show} onHide={close} centered aria-labelledby="share-title">
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
        <figure className="qr-block">
          {qrCode ? <img src={qrCode} alt="Scan to open this DropFile room" width={176} height={176} /> : <p className={qrError ? 'inline-error' : 'muted'} role="status">{qrError ? 'QR unavailable. Use the room code or link instead.' : 'Preparing QR code...'}</p>}
          <figcaption>Scan with your phone's camera</figcaption>
        </figure>
        <section className="share-device" aria-label="Your device">
          {editing ? (
            <Form onSubmit={rename} noValidate>
              <Form.Group controlId="device-name">
                <Form.Label>Your device name</Form.Label>
                <Form.Control autoFocus value={name} onChange={(event) => { setName(event.target.value); setNameError(''); }} isInvalid={!!nameError} aria-invalid={!!nameError} required aria-describedby={nameError ? 'name-error' : undefined} />
                <Form.Control.Feedback id="name-error" type="invalid" role="alert">{nameError}</Form.Control.Feedback>
              </Form.Group>
              <div className="rename-actions"><Button type="submit">Save name</Button><Button variant="outline-secondary" onClick={() => setEditing(false)}>Cancel</Button></div>
            </Form>
          ) : (
            <div className="device-row">
              <Monitor size={20} className="muted" aria-hidden="true" />
              <div><small>Your device</small><p>{deviceName}</p></div>
              <Button ref={renameButton} variant="link" onClick={() => { setName(deviceName); setNameError(''); setEditing(true); }}>Rename</Button>
            </div>
          )}
        </section>
        <div className="share-details">
          <p><Users size={15} aria-hidden="true" />{connected ? `${peerCount} device${peerCount === 1 ? '' : 's'} in this room` : 'Waiting for a connection'}</p>
          <p><Clock size={15} aria-hidden="true" />Files are temporary. Check each file's expiry before leaving.</p>
        </div>
      </Modal.Body>
    </Modal>
  );
}
