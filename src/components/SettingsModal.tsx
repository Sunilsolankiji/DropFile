import { useState } from 'react';
import { Modal, Button } from 'react-bootstrap';
import { Settings } from 'lucide-react';

interface SettingsModalProps {
  show?: boolean;
  onHide?: () => void;
  onConfigSaved?: () => void;
}

export function SettingsModal({ show = false, onHide = () => {} }: SettingsModalProps) {
  const [isOpen, setIsOpen] = useState(show);

  const handleClose = () => {
    setIsOpen(false);
    onHide();
  };

  return (
    <Modal show={isOpen} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted">Using backend server for file sharing.</p>
        <p className="small">Backend URL: {import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export function SettingsButton({ onConfigSaved }: { onConfigSaved?: () => void }) {
  const [show, setShow] = useState(false);

  return (
    <>
      <Button
        variant="outline-secondary"
        size="sm"
        onClick={() => setShow(true)}
        className="d-flex align-items-center justify-content-center"
        style={{ width: '36px', height: '36px', padding: 0 }}
        title="Settings"
      >
        <Settings size={18} />
      </Button>

      <SettingsModal show={show} onHide={() => setShow(false)} onConfigSaved={onConfigSaved} />
    </>
  );
}
