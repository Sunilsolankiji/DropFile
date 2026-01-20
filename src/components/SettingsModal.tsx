import { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import { Settings, Save, RotateCcw, CheckCircle } from 'lucide-react';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const STORAGE_KEY = 'dropfile_firebase_config';

export function getStoredFirebaseConfig(): FirebaseConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const config = JSON.parse(stored) as FirebaseConfig;
      // Validate that all fields have values
      if (config.apiKey && config.projectId && config.storageBucket) {
        return config;
      }
    }
  } catch (e) {
    console.error('Error reading Firebase config from localStorage:', e);
  }
  return null;
}

export function saveFirebaseConfig(config: FirebaseConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearFirebaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasEnvConfig(): boolean {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  return !!(apiKey && apiKey !== 'your_api_key_here' && apiKey !== 'YOUR_API_KEY_HERE');
}

interface SettingsModalProps {
  show: boolean;
  onHide: () => void;
  onConfigSaved: () => void;
}

export function SettingsModal({ show, onHide, onConfigSaved }: SettingsModalProps) {
  const [config, setConfig] = useState<FirebaseConfig>({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  });
  const [saved, setSaved] = useState(false);
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    const stored = getStoredFirebaseConfig();
    if (stored) {
      setConfig(stored);
      setUseCustom(true);
    }
  }, [show]);

  const handleChange = (field: keyof FirebaseConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    if (useCustom) {
      saveFirebaseConfig(config);
    } else {
      clearFirebaseConfig();
    }
    setSaved(true);
    setTimeout(() => {
      onConfigSaved();
      onHide();
    }, 1000);
  };

  const handleReset = () => {
    clearFirebaseConfig();
    setConfig({
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: ''
    });
    setUseCustom(false);
    setSaved(false);
  };

  const isValid = !useCustom || (config.apiKey && config.projectId && config.storageBucket);

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title className="d-flex align-items-center gap-2">
          <Settings size={24} style={{ width: 24, height: 24 }} />
          Settings
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h6 className="fw-bold mb-3">Firebase Configuration</h6>

        {hasEnvConfig() ? (
          <Alert variant="success" className="mb-3">
            <CheckCircle size={16} style={{ width: 16, height: 16 }} className="me-2" />
            Environment Firebase config detected. You can use it or override with custom settings.
          </Alert>
        ) : (
          <Alert variant="warning" className="mb-3">
            No environment Firebase config found. Please add your Firebase details below to enable cross-device file sharing.
          </Alert>
        )}

        <Form.Check
          type="switch"
          id="use-custom-firebase"
          label="Use custom Firebase configuration"
          checked={useCustom}
          onChange={(e) => setUseCustom(e.target.checked)}
          className="mb-3"
        />

        {useCustom && (
          <div className="p-3 rounded mb-3" style={{ background: 'rgba(0,0,0,0.03)' }}>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">API Key *</Form.Label>
              <Form.Control
                type="text"
                placeholder="AIzaSy..."
                value={config.apiKey}
                onChange={(e) => handleChange('apiKey', e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Auth Domain</Form.Label>
              <Form.Control
                type="text"
                placeholder="your-project.firebaseapp.com"
                value={config.authDomain}
                onChange={(e) => handleChange('authDomain', e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Project ID *</Form.Label>
              <Form.Control
                type="text"
                placeholder="your-project-id"
                value={config.projectId}
                onChange={(e) => handleChange('projectId', e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Storage Bucket *</Form.Label>
              <Form.Control
                type="text"
                placeholder="your-project.appspot.com"
                value={config.storageBucket}
                onChange={(e) => handleChange('storageBucket', e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Messaging Sender ID</Form.Label>
              <Form.Control
                type="text"
                placeholder="123456789"
                value={config.messagingSenderId}
                onChange={(e) => handleChange('messagingSenderId', e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">App ID</Form.Label>
              <Form.Control
                type="text"
                placeholder="1:123456789:web:abc123"
                value={config.appId}
                onChange={(e) => handleChange('appId', e.target.value)}
              />
            </Form.Group>

            <small className="text-muted">
              * Required fields. Get these values from your Firebase Console → Project Settings → Your apps.
            </small>
          </div>
        )}

        {saved && (
          <Alert variant="success">
            <CheckCircle size={16} style={{ width: 16, height: 16 }} className="me-2" />
            Settings saved! The page will reload to apply changes.
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleReset} className="d-flex align-items-center gap-2">
          <RotateCcw size={16} style={{ width: 16, height: 16 }} />
          Reset to Default
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!isValid} className="d-flex align-items-center gap-2">
          <Save size={16} style={{ width: 16, height: 16 }} />
          Save Settings
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

interface SettingsButtonProps {
  onConfigSaved: () => void;
}

export function SettingsButton({ onConfigSaved }: SettingsButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button
        variant="outline-secondary"
        size="sm"
        onClick={() => setShowModal(true)}
        className="d-flex align-items-center justify-content-center"
        style={{ width: 36, height: 36, padding: 0 }}
        title="Settings"
      >
        <Settings size={18} style={{ width: 18, height: 18 }} />
      </Button>
      <SettingsModal
        show={showModal}
        onHide={() => setShowModal(false)}
        onConfigSaved={onConfigSaved}
      />
    </>
  );
}

