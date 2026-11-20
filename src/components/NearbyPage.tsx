import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, ProgressBar, Spinner } from 'react-bootstrap';
import { CircleAlert, Laptop, Monitor, Radar, Send, Smartphone, Tablet, Wifi, X } from 'lucide-react';
import AppHeader from './AppHeader';
import { useNearby, type NearbyTransfer } from '@/hooks/use-nearby';
import type { NearbyPeer } from '@/lib/nearby-service';
import { formatFileSize } from '@/lib/utils';
import { LAN_MODE } from '@/lib/config';
import './NearbyPage.css';

function DeviceIcon({ type }: { type: NearbyPeer['deviceType'] }) {
  const Icon = type === 'phone' ? Smartphone : type === 'tablet' ? Tablet : type === 'laptop' ? Laptop : Monitor;
  return <Icon size={26} aria-hidden="true" />;
}

const STATUS_LABELS: Record<NearbyTransfer['status'], string> = {
  connecting: 'Connecting…',
  waiting: 'Waiting for them to accept…',
  sending: 'Sending…',
  receiving: 'Receiving…',
  done: 'Done',
  declined: 'Declined',
  failed: "Couldn't send directly",
  cancelled: 'Cancelled',
};

function DeviceCard({ peer, onSend }: { peer: NearbyPeer; onSend: (peer: NearbyPeer, files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <li
      className={`nearby-device${dragging ? ' is-dragging' : ''}`}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length) onSend(peer, Array.from(event.dataTransfer.files));
      }}
    >
      <button type="button" className="nearby-device-button" onClick={() => input.current?.click()} aria-label={`Send files to ${peer.name}`}>
        <span className="nearby-device-icon"><DeviceIcon type={peer.deviceType} /></span>
        <span className="nearby-device-name">{peer.name}</span>
        <span className="nearby-device-hint"><Send size={12} aria-hidden="true" /> Tap or drop files</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label={`Choose files to send to ${peer.name}`}
        onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) onSend(peer, files);
        }}
      />
    </li>
  );
}

export default function NearbyPage() {
  const navigate = useNavigate();
  const {
    supported, peers, connection, connectionMessage, lanMode, transfers, offers, invite, deviceName,
    sendFiles, cancelTransfer, respondToOffer, sendViaServer, clearFinished, retry, dismissInvite,
  } = useNearby();
  const [relayBusy, setRelayBusy] = useState<string | null>(null);
  const offer = offers[0];
  const finished = transfers.some(item => ['done', 'declined', 'failed', 'cancelled'].includes(item.status));

  const sendThroughServer = async (transfer: NearbyTransfer) => {
    setRelayBusy(transfer.id);
    const roomCode = await sendViaServer(transfer.id);
    setRelayBusy(null);
    if (roomCode) navigate(`/room/${encodeURIComponent(roomCode)}`);
  };

  return (
    <div className="app-shell">
      <AppHeader>
        <span className="header-note">{lanMode || LAN_MODE ? 'Local network mode' : 'Nearby sharing'}</span>
      </AppHeader>
      <main id="main-content" tabIndex={-1} className="shell-width room-main enter-content">
        <div className="room-heading">
          <div>
            <h1>Nearby devices</h1>
            <p>Open this page on another device on the same Wi-Fi. Files go straight from one device to the other.</p>
          </div>
          <div className="room-meta">
            <span className="device-summary" title="This device's name"><Monitor size={14} aria-hidden="true" />{deviceName}</span>
            <span className={`connection-status ${connection === 'connected' ? 'is-connected' : connection === 'disconnected' ? 'is-offline' : ''}`} role="status">
              <span className="status-dot" aria-hidden="true" />
              {connection === 'connected' ? 'Visible to nearby devices' : connection === 'connecting' ? 'Connecting…' : 'Not connected'}
            </span>
          </div>
        </div>

        {!supported && (
          <div className="notice" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <div className="notice-content"><strong>Direct sharing isn't available in this browser</strong><p>Use a room code instead, or try a recent version of Chrome, Edge, Firefox, or Safari.</p></div>
          </div>
        )}
        {connection === 'disconnected' && (
          <div className="notice" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <div className="notice-content"><strong>Unable to look for nearby devices</strong><p>{connectionMessage || 'Check your connection and try again.'}</p></div>
            <Button variant="outline-secondary" onClick={retry}>Try again</Button>
          </div>
        )}

        <section className="file-section" aria-labelledby="nearby-title">
          <div className="section-heading">
            <h2 id="nearby-title">On this network <span className="count-label">{peers.length}</span></h2>
            <span className="expiry-note"><Wifi size={13} aria-hidden="true" />Same Wi-Fi only</span>
          </div>
          {connection !== 'connected' && !peers.length ? (
            <div className="files-surface loading-state" role="status"><Spinner animation="border" aria-hidden="true" />{connectionMessage || 'Looking for nearby devices…'}</div>
          ) : !peers.length ? (
            <div className="files-surface empty-state">
              <Radar size={32} strokeWidth={1.4} aria-hidden="true" />
              <h3>Looking for devices…</h3>
              <p>Open DropFile's Nearby page on another phone or computer connected to the same Wi-Fi. It will appear here automatically.</p>
            </div>
          ) : (
            <ul className="nearby-grid" aria-label="Nearby devices">
              {peers.map(peer => <DeviceCard key={peer.id} peer={peer} onSend={(target, files) => void sendFiles(target.id, files)} />)}
            </ul>
          )}
        </section>

        {transfers.length > 0 && (
          <section className="file-section nearby-transfers" aria-labelledby="nearby-transfers-title">
            <div className="section-heading">
              <h2 id="nearby-transfers-title">Transfers <span className="count-label">{transfers.length}</span></h2>
              {finished && <Button variant="link" size="sm" onClick={clearFinished}>Clear finished</Button>}
            </div>
            <ul className="files-surface file-list" aria-label="Nearby transfers">
              {transfers.map(transfer => {
                const percent = transfer.size ? Math.min(100, Math.floor(transfer.bytes / transfer.size * 100)) : (transfer.status === 'done' ? 100 : 0);
                const active = ['connecting', 'waiting', 'sending', 'receiving'].includes(transfer.status);
                return (
                  <li key={transfer.id} className="file-item file-transfer-row">
                    <div className="file-info">
                      <h3 className="file-name">{transfer.name}</h3>
                      <div className="file-metadata">
                        <span>{formatFileSize(transfer.size)}</span>
                        <span>{transfer.direction === 'outgoing' ? `To ${transfer.peerName}` : `From ${transfer.peerName}`}</span>
                      </div>
                      <div className="file-transfer-status" aria-live="polite">
                        <span>{transfer.status === 'done' && transfer.direction === 'incoming' ? 'Saved to this device' : STATUS_LABELS[transfer.status]}</span>
                        <span className="transport-badge">Direct</span>
                      </div>
                      {active && transfer.status !== 'connecting' && (
                        <div className="file-transfer-progress-group">
                          <ProgressBar now={percent} max={100} aria-label={`Progress for ${transfer.name}`} aria-valuetext={`${percent}%`} />
                        </div>
                      )}
                      {transfer.error && <p className="file-transfer-reason">{transfer.error}</p>}
                    </div>
                    <div className="file-actions file-transfer-actions">
                      {transfer.canUseRelay && transfer.status === 'failed' && (
                        <Button variant="outline-secondary" size="sm" disabled={relayBusy === transfer.id} onClick={() => void sendThroughServer(transfer)}>
                          {relayBusy === transfer.id ? 'Inviting…' : 'Send via server'}
                        </Button>
                      )}
                      {active && <Button variant="outline-secondary" className="icon-button" onClick={() => cancelTransfer(transfer.id)} aria-label={`Cancel ${transfer.name}`} title="Cancel"><X size={17} aria-hidden="true" /></Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <p className="room-footnote"><Wifi size={14} aria-hidden="true" />Devices on guest or public Wi-Fi may be blocked from seeing each other. If nothing appears, use a room code instead.</p>
      </main>

      <Modal show={!!offer} onHide={() => offer && respondToOffer(offer.offer.id, false)} centered aria-labelledby="nearby-offer-title">
        <Modal.Header closeButton><Modal.Title id="nearby-offer-title">Incoming file</Modal.Title></Modal.Header>
        <Modal.Body>
          {offer && <p className="share-intro mb-0"><strong>{offer.peerName}</strong> wants to send you <strong>{offer.offer.name}</strong> ({formatFileSize(offer.offer.size)}).</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => offer && respondToOffer(offer.offer.id, false)}>Decline</Button>
          <Button autoFocus onClick={() => offer && respondToOffer(offer.offer.id, true)}>Accept</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={!!invite && !offer} onHide={dismissInvite} centered aria-labelledby="nearby-invite-title">
        <Modal.Header closeButton><Modal.Title id="nearby-invite-title">Receive through the server?</Modal.Title></Modal.Header>
        <Modal.Body>
          {invite && <p className="share-intro mb-0"><strong>{invite.fromName}</strong> couldn't connect to this device directly and wants to share files through a private room instead.</p>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={dismissInvite}>Not now</Button>
          <Button autoFocus onClick={() => { if (invite) navigate(`/room/${encodeURIComponent(invite.roomCode)}`); }}>Open room</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
