import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { Laptop, Monitor, Server, Settings, Smartphone, Tablet, Wifi, Zap } from 'lucide-react';
import { API_URL, LAN_MODE } from '@/lib/config';
import {
  saveDeviceName, setDirectTransfersEnabled, useDeviceName, useDirectTransfersEnabled,
} from '@/lib/device';
import { detectDeviceType } from '@/lib/utils';
import { isWebRtcSupported } from '@/lib/rtc/ice';

// A single settings dialog for the whole app, openable from anywhere.
let open = false;
const listeners = new Set<() => void>();
function setOpen(next: boolean) {
  open = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function openSettings() {
  setOpen(true);
}

function DeviceIcon() {
  const type = detectDeviceType();
  const Icon = type === 'phone' ? Smartphone : type === 'tablet' ? Tablet : type === 'laptop' ? Laptop : Monitor;
  return <Icon size={20} aria-hidden="true" />;
}

export function SettingsModal() {
  const show = useSyncExternalStore(subscribe, () => open);
  const deviceName = useDeviceName();
  const directEnabled = useDirectTransfersEnabled();
  const [name, setName] = useState(deviceName);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (show) {
      setName(deviceName);
      setError('');
      setSaved(false);
    }
  }, [show, deviceName]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Give this device a name.'); return; }
    if (trimmed.length > 50) { setError('Use 50 characters or fewer.'); return; }
    if (/<[^>]*>/.test(trimmed)) { setError('Names cannot contain HTML.'); return; }
    saveDeviceName(trimmed);
    setSaved(true);
  };

  const server = (() => {
    try { return new URL(API_URL).host; } catch { return API_URL; }
  })();

  return (
    <Modal show={show} onHide={() => setOpen(false)} centered aria-labelledby="settings-title">
      <Modal.Header closeButton><Modal.Title id="settings-title">Settings</Modal.Title></Modal.Header>
      <Modal.Body>
        <section className="settings-section" aria-labelledby="settings-device">
          <h3 id="settings-device" className="settings-heading">This device</h3>
          <Form onSubmit={save} noValidate>
            <Form.Group controlId="settings-device-name">
              <Form.Label>Device name</Form.Label>
              <div className="settings-name-row">
                <span className="settings-device-icon"><DeviceIcon /></span>
                <Form.Control
                  value={name}
                  maxLength={50}
                  onChange={event => { setName(event.target.value); setError(''); setSaved(false); }}
                  isInvalid={!!error}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'settings-name-error' : 'settings-name-hint'}
                />
                <Button type="submit" disabled={name.trim() === deviceName}>Save</Button>
              </div>
              {error
                ? <p id="settings-name-error" className="inline-error" role="alert">{error}</p>
                : <Form.Text id="settings-name-hint" role="status">{saved ? 'Saved. Other devices see the new name.' : 'Shown to other devices in rooms and nearby sharing.'}</Form.Text>}
            </Form.Group>
          </Form>
        </section>

        <section className="settings-section" aria-labelledby="settings-transfers">
          <h3 id="settings-transfers" className="settings-heading">Transfers</h3>
          <Form.Check
            type="switch"
            id="settings-direct"
            checked={directEnabled}
            disabled={!isWebRtcSupported()}
            onChange={event => setDirectTransfersEnabled(event.currentTarget.checked)}
            label={<><Zap size={14} aria-hidden="true" /> Send directly between devices on the same Wi-Fi</>}
          />
          <p className="settings-help">
            {isWebRtcSupported()
              ? 'Room downloads try a direct connection first and use the server only if that fails. Turn off to always use the server.'
              : 'This browser does not support direct connections, so files always go through the server.'}
          </p>
        </section>

        <section className="settings-section" aria-labelledby="settings-connection">
          <h3 id="settings-connection" className="settings-heading">Connection</h3>
          <p className="settings-info">
            {LAN_MODE ? <Wifi size={15} aria-hidden="true" /> : <Server size={15} aria-hidden="true" />}
            <span>{LAN_MODE ? 'Local network mode. No internet needed.' : 'Online server'}<small>{server}</small></span>
          </p>
        </section>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={() => setOpen(false)}>Done</Button>
      </Modal.Footer>
    </Modal>
  );
}

export function SettingsButton() {
  return (
    <Button variant="outline-secondary" className="icon-button settings-button" onClick={openSettings} aria-label="Settings" title="Settings">
      <Settings size={17} aria-hidden="true" />
    </Button>
  );
}
