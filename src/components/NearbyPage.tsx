import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Modal, ProgressBar } from 'react-bootstrap';
import {
  ArrowDownToLine, ArrowUpFromLine, CircleAlert, Laptop, Monitor, QrCode, Send, Smartphone, Tablet, Wifi, X, Zap,
} from 'lucide-react';
import AppHeader from './AppHeader';
import QrImage from './QrImage';
import { openSettings } from './SettingsModal';
import { useNearby, type NearbyTransfer } from '@/hooks/use-nearby';
import type { NearbyPeer } from '@/lib/nearby-service';
import { detectDeviceType, formatFileSize } from '@/lib/utils';
import { useShareableUrl } from '@/lib/shareable-url';
import './NearbyPage.css';

function DeviceIcon({ type, size = 26 }: { type: NearbyPeer['deviceType']; size?: number }) {
  const Icon = type === 'phone' ? Smartphone : type === 'tablet' ? Tablet : type === 'laptop' ? Laptop : Monitor;
  return <Icon size={size} aria-hidden="true" />;
}

const ACTIVE = new Set<NearbyTransfer['status']>(['connecting', 'waiting', 'sending', 'receiving']);
const FINISHED = new Set<NearbyTransfer['status']>(['done', 'declined', 'failed', 'cancelled']);

function statusLabel(transfer: NearbyTransfer): string {
  switch (transfer.status) {
    case 'connecting': return 'Connecting…';
    case 'waiting': return `Waiting for ${transfer.peerName} to accept…`;
    case 'sending': return 'Sending';
    case 'receiving': return 'Receiving';
    case 'done': return transfer.direction === 'incoming' ? 'Saved to this device' : 'Delivered';
    case 'declined': return 'Declined';
    case 'failed': return "Couldn't connect directly";
    case 'cancelled': return 'Cancelled';
  }
}

function speedLabel(transfer: NearbyTransfer, now: number): string | null {
  if (!transfer.startedAt || !ACTIVE.has(transfer.status) || transfer.bytes <= 0) return null;
  const seconds = (now - transfer.startedAt) / 1000;
  if (seconds < 0.5) return null;
  const rate = transfer.bytes / seconds;
  const remaining = Math.max(0, Math.ceil((transfer.size - transfer.bytes) / Math.max(rate, 1)));
  return `${formatFileSize(rate, 1)}/s · ${remaining < 60 ? `${remaining}s` : `${Math.ceil(remaining / 60)} min`} left`;
}

function DeviceCard({ peer, busy, onSend }: { peer: NearbyPeer; busy: boolean; onSend: (peer: NearbyPeer, files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  return (
    <li
      className={`nearby-device${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
      onDragEnter={event => { event.preventDefault(); depth.current += 1; setDragging(true); }}
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }}
      onDrop={event => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (event.dataTransfer.files.length) onSend(peer, Array.from(event.dataTransfer.files));
      }}
    >
      <button type="button" className="nearby-device-button" onClick={() => input.current?.click()} aria-label={`Send files to ${peer.name}`}>
        <span className="nearby-device-icon"><DeviceIcon type={peer.deviceType} /></span>
        <span className="nearby-device-name">{peer.name}</span>
        <span className="nearby-device-hint">
          {dragging ? 'Drop to send' : busy ? 'Transfer in progress' : <><Send size={12} aria-hidden="true" />Tap or drop files</>}
        </span>
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

function TransferRow({ transfer, now, relayBusy, onCancel, onRelay }: {
  transfer: NearbyTransfer;
  now: number;
  relayBusy: boolean;
  onCancel: () => void;
  onRelay: () => void;
}) {
  const percent = transfer.size ? Math.min(100, Math.floor(transfer.bytes / transfer.size * 100)) : (transfer.status === 'done' ? 100 : 0);
  const active = ACTIVE.has(transfer.status);
  const showProgress = transfer.status === 'sending' || transfer.status === 'receiving';
  const DirectionIcon = transfer.direction === 'outgoing' ? ArrowUpFromLine : ArrowDownToLine;
  const speed = speedLabel(transfer, now);
  return (
    <li className={`file-item file-transfer-row nearby-transfer is-${transfer.status}`}>
      <span className={`file-icon nearby-direction is-${transfer.direction}`}><DirectionIcon size={19} aria-hidden="true" /></span>
      <div className="file-info">
        <h3 className="file-name">{transfer.name}</h3>
        <div className="file-metadata">
          <span>{formatFileSize(transfer.size)}</span>
          <span>{transfer.direction === 'outgoing' ? `To ${transfer.peerName}` : `From ${transfer.peerName}`}</span>
        </div>
        <div className="file-transfer-status" aria-live="polite">
          <span className="nearby-status">{statusLabel(transfer)}</span>
          <span className="transport-badge"><Zap size={11} aria-hidden="true" />Direct · same Wi-Fi</span>
        </div>
        {showProgress && (
          <div className="file-transfer-progress-group">
            <div className="file-transfer-progress">
              <div className="file-transfer-progress-label"><span>{speed ?? (transfer.direction === 'outgoing' ? 'Sending' : 'Receiving')}</span><span>{percent}%</span></div>
              <ProgressBar now={percent} max={100} aria-label={`Progress for ${transfer.name}`} aria-valuetext={`${percent}%`} />
            </div>
          </div>
        )}
        {transfer.error && transfer.status !== 'declined' && <p className="file-transfer-reason">{transfer.error}</p>}
      </div>
      <div className="file-actions file-transfer-actions">
        {transfer.canUseRelay && transfer.status === 'failed' && (
          <Button variant="outline-secondary" size="sm" disabled={relayBusy} onClick={onRelay}>
            {relayBusy ? 'Inviting…' : 'Send via server'}
          </Button>
        )}
        {active && <Button variant="outline-secondary" className="icon-button" onClick={onCancel} aria-label={`Cancel ${transfer.name}`} title="Cancel"><X size={17} aria-hidden="true" /></Button>}
      </div>
    </li>
  );
}

export default function NearbyPage() {
  const navigate = useNavigate();
  const {
    supported, peers, connection, connectionMessage, lanMode, transfers, offers, invite, deviceName,
    sendFiles, cancelTransfer, respondToOffer, sendViaServer, clearFinished, retry, dismissInvite,
  } = useNearby();
  const pageUrl = useShareableUrl();
  const [relayBusy, setRelayBusy] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [now, setNow] = useState(Date.now);
  const offer = offers[0];
  const finished = transfers.some(item => FINISHED.has(item.status));
  const busyPeers = new Set(transfers.filter(item => ACTIVE.has(item.status)).map(item => item.peerId));
  const selfType = detectDeviceType();

  useEffect(() => {
    if (!transfers.some(item => ACTIVE.has(item.status))) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [transfers]);

  const sendThroughServer = async (transfer: NearbyTransfer) => {
    setRelayBusy(transfer.id);
    const roomCode = await sendViaServer(transfer.id);
    setRelayBusy(null);
    if (roomCode) navigate(`/room/${encodeURIComponent(roomCode)}`);
  };

  return (
    <div className="app-shell">
      <AppHeader>
        <nav className="header-actions" aria-label="Nearby actions">
          <Button variant="outline-secondary" onClick={() => setShowQr(true)}><QrCode size={16} aria-hidden="true" /> Add a device</Button>
          <Link className="btn btn-outline-secondary nearby-room-link" to="/">Use a room code</Link>
        </nav>
      </AppHeader>
      <main id="main-content" tabIndex={-1} className="shell-width room-main enter-content">
        <div className="room-heading">
          <div>
            <span className="eyebrow">{lanMode ? 'Local network' : 'Same Wi-Fi'}</span>
            <h1>Nearby devices</h1>
            <p>Open this page on another device on the same Wi-Fi. Files go straight from one device to the other.</p>
          </div>
        </div>

        <section className="nearby-self" aria-label="This device">
          <span className="nearby-self-icon"><DeviceIcon type={selfType} size={22} /></span>
          <div className="nearby-self-info">
            <small>You appear as</small>
            <strong>{deviceName}</strong>
          </div>
          <Button variant="link" size="sm" onClick={openSettings}>Change name</Button>
          <span className={`connection-status ${connection === 'connected' ? 'is-connected' : connection === 'disconnected' ? 'is-offline' : ''}`} role="status">
            <span className="status-dot" aria-hidden="true" />
            {connection === 'connected' ? 'Visible' : connection === 'connecting' ? 'Connecting…' : 'Offline'}
          </span>
        </section>

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
          {!peers.length ? (
            <div className="files-surface nearby-empty">
              <div className={`nearby-radar${connection === 'connected' ? ' is-scanning' : ''}`} aria-hidden="true">
                <span /><span /><span />
                <DeviceIcon type={selfType} size={22} />
              </div>
              <h3>{connection === 'connected' ? 'Looking for devices…' : connectionMessage || 'Connecting…'}</h3>
              <p>Open DropFile's Nearby page on another phone or computer on the same Wi-Fi. It appears here automatically.</p>
              <Button variant="outline-secondary" size="sm" onClick={() => setShowQr(true)}><QrCode size={15} aria-hidden="true" /> Show QR code</Button>
            </div>
          ) : (
            <ul className="nearby-grid" aria-label="Nearby devices">
              {peers.map(peer => (
                <DeviceCard key={peer.id} peer={peer} busy={busyPeers.has(peer.id)} onSend={(target, files) => void sendFiles(target.id, files)} />
              ))}
            </ul>
          )}
        </section>

        {transfers.length > 0 && (
          <section className="file-section" aria-labelledby="nearby-transfers-title">
            <div className="section-heading">
              <h2 id="nearby-transfers-title">Transfers <span className="count-label">{transfers.length}</span></h2>
              {finished && <Button variant="link" size="sm" onClick={clearFinished}>Clear finished</Button>}
            </div>
            <div className="files-surface">
              <ul className="file-list" aria-label="Nearby transfers">
                {transfers.map(transfer => (
                  <TransferRow
                    key={transfer.id}
                    transfer={transfer}
                    now={now}
                    relayBusy={relayBusy === transfer.id}
                    onCancel={() => cancelTransfer(transfer.id)}
                    onRelay={() => void sendThroughServer(transfer)}
                  />
                ))}
              </ul>
            </div>
          </section>
        )}

        <p className="room-footnote"><Wifi size={14} aria-hidden="true" />Guest or public Wi-Fi may block devices from seeing each other. If nothing appears, use a room code instead.</p>
      </main>

      <Modal show={showQr} onHide={() => setShowQr(false)} centered aria-labelledby="nearby-qr-title">
        <Modal.Header closeButton><Modal.Title id="nearby-qr-title">Add a device</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="share-intro">Scan with a phone on the same Wi-Fi. It opens this page and shows up here right away.</p>
          <figure className="qr-block">
            <QrImage value={pageUrl} alt="Scan to open DropFile nearby sharing" />
            <figcaption className="nearby-qr-url">{pageUrl}</figcaption>
          </figure>
        </Modal.Body>
      </Modal>

      <Modal show={!!offer} onHide={() => offer && respondToOffer(offer.offer.id, false)} centered aria-labelledby="nearby-offer-title">
        <Modal.Header closeButton><Modal.Title id="nearby-offer-title">Incoming file</Modal.Title></Modal.Header>
        <Modal.Body>
          {offer && (
            <div className="nearby-offer">
              <span className="file-icon"><ArrowDownToLine size={19} aria-hidden="true" /></span>
              <div>
                <strong className="nearby-offer-name">{offer.offer.name}</strong>
                <p>{formatFileSize(offer.offer.size)} from <strong>{offer.peerName}</strong></p>
              </div>
            </div>
          )}
          {offers.length > 1 && <p className="muted nearby-offer-more">{offers.length - 1} more waiting</p>}
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
