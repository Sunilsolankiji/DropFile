import { useEffect, useRef, useState } from 'react';
import { Button, Offcanvas, Spinner } from 'react-bootstrap';
import { Check, CircleAlert, Clock, Copy, MessageSquare, Share2, Users } from 'lucide-react';
import AppHeader from './AppHeader';
import ChatPanel from './ChatPanel';
import FileUpload from './FileUpload';
import FileList from './FileList';
import ShareRoomModal from './ShareRoomModal';
import { useRoom } from '@/hooks/use-backend-room';
import { useCopyText } from '@/hooks/use-copy-text';
import { useMediaQuery } from '@/hooks/use-media-query';

export default function RoomPage({ roomCode }: { roomCode: string }) {
  const {
    files, uploadingFiles, uploadFiles, deleteFile, downloadFile, loading, error,
    isConnected, peerCount, currentPeerId, currentPeerName, sendText, textMessages,
    updateDeviceName, retryConnection, retryText,
  } = useRoom(roomCode);
  const [showShare, setShowShare] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const pendingSend = useRef(false);
  const draftVersion = useRef(0);
  const [unread, setUnread] = useState(0);
  const chatButton = useRef<HTMLButtonElement>(null);
  const knownMessages = useRef(new Set<string>());
  const hasLoaded = useRef(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { copy, copiedText } = useCopyText();

  useEffect(() => {
    if (showChat) setUnread(0);
    else if (hasLoaded.current) {
      const incoming = textMessages.filter(message => !knownMessages.current.has(message.id) && message.peerId !== currentPeerId);
      if (incoming.length) setUnread(count => count + incoming.length);
    }
    knownMessages.current = new Set(textMessages.map(message => message.id));
    if (!loading) hasLoaded.current = true;
  }, [textMessages, showChat, currentPeerId, loading]);

  const closeChat = () => {
    setShowChat(false);
    if (isDesktop) chatButton.current?.focus();
  };

  const changeDraft = (value: string) => {
    draftVersion.current += 1;
    setDraft(value);
  };

  const sendDraft = async (value: string) => {
    if (pendingSend.current) return false;
    pendingSend.current = true;
    setSending(true);
    const version = draftVersion.current;
    try {
      const sent = await sendText(value);
      if (sent && draftVersion.current === version) setDraft('');
      return sent;
    } finally {
      pendingSend.current = false;
      setSending(false);
    }
  };

  const retryMessage = async (messageId: string) => {
    if (pendingSend.current) return false;
    const message = textMessages.find(item => item.id === messageId);
    const matchesDraft = message && draft.trim() === (message.text || message.message || '').trim();
    const version = draftVersion.current;
    pendingSend.current = true;
    setSending(true);
    try {
      const sent = await retryText(messageId);
      if (sent && matchesDraft && draftVersion.current === version) setDraft('');
      return sent;
    } finally {
      pendingSend.current = false;
      setSending(false);
    }
  };

  useEffect(() => {
    if (!showChat || !isDesktop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !showShare) {
        setShowChat(false);
        chatButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showChat, isDesktop, showShare]);

  const chat = <ChatPanel
    messages={textMessages}
    currentPeerId={currentPeerId}
    connected={isConnected}
    draft={draft}
    onDraftChange={changeDraft}
    onSend={sendDraft}
    onRetry={retryMessage}
    sending={sending}
    onClose={closeChat}
  />;

  return (
    <div className="app-shell">
      <AppHeader>
        <nav className="header-actions" aria-label="Room actions">
          <Button ref={chatButton} variant="outline-secondary" onClick={() => setShowChat(!showChat)} aria-expanded={showChat} aria-controls="room-chat" aria-label={`Chat${unread ? `, ${unread} unread messages` : ''}`}>
            <MessageSquare size={16} aria-hidden="true" /> Chat
            {unread > 0 && <span className="unread-dot" aria-hidden="true" />}
          </Button>
          <Button onClick={() => setShowShare(true)}><Share2 size={16} aria-hidden="true" /> Share room</Button>
        </nav>
      </AppHeader>
      <main id="main-content" tabIndex={-1} className="shell-width room-main enter-content">
        <div className="room-heading">
          <div>
            <h1>Your shared room</h1>
            <p>Drop something here. Pick it up on another device.</p>
          </div>
          <div>
            <div className="room-identity">
              <span className="eyebrow">Room code</span>
              <Button variant="outline-secondary" className="room-code-button" onClick={() => copy(roomCode)} title={`Copy room code ${roomCode}`} aria-label={copiedText === roomCode ? 'Room code copied' : `Copy room code ${roomCode}`}>
                <span>{roomCode}</span>{copiedText === roomCode ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              </Button>
              <span className="visually-hidden" role="status">{copiedText === roomCode ? 'Room code copied' : ''}</span>
            </div>
            <div className="room-meta">
              <span className={`connection-status ${isConnected ? 'is-connected' : !loading ? 'is-offline' : ''}`} role="status"><span className="status-dot" aria-hidden="true" />{isConnected ? 'Connected' : loading ? 'Connecting...' : 'Not connected'}</span>
              {isConnected && <span className="device-summary"><Users size={14} aria-hidden="true" />{peerCount} device{peerCount === 1 ? '' : 's'}</span>}
            </div>
          </div>
        </div>

        {(error || (!loading && !isConnected)) && (
          <div className="notice" role="alert">
            <CircleAlert size={18} aria-hidden="true" />
            <div className="notice-content"><strong>{isConnected ? 'Something needs your attention' : 'Unable to connect to this room'}</strong><p>{error || 'Check your connection and try again.'}</p></div>
            {!isConnected && <Button variant="outline-secondary" onClick={retryConnection} disabled={loading}>Try again</Button>}
          </div>
        )}

        <div className={`workspace${showChat && isDesktop ? ' chat-is-open' : ''}`}>
          <div className="workspace-content">
            <FileUpload onUpload={uploadFiles} disabled={!isConnected} />
            <section className="file-section" aria-labelledby="files-title">
              <div className="section-heading">
                <h2 id="files-title" tabIndex={-1}>Shared files <span className="count-label">{files.length}</span></h2>
                <span className="expiry-note"><Clock size={13} aria-hidden="true" />Available for a little while</span>
              </div>
              {loading ? (
                <div className="files-surface loading-state" role="status"><Spinner animation="border" aria-hidden="true" />Connecting to your room...</div>
              ) : !isConnected && !files.length && !uploadingFiles.length ? (
                <div className="files-surface empty-state"><CircleAlert size={28} aria-hidden="true" /><h3>Let's get you connected</h3><p>Your files will appear once the room reconnects. You can still copy and share its code.</p></div>
              ) : (
                <FileList files={files} uploadingFiles={uploadingFiles} currentPeerId={currentPeerId} disabled={!isConnected} onDelete={deleteFile} onDownload={downloadFile} />
              )}
            </section>
            <p className="room-footnote"><Clock size={14} aria-hidden="true" />Files expire automatically. Download anything you'd like to keep.</p>
          </div>
          {showChat && isDesktop && <div id="room-chat">{chat}</div>}
        </div>
      </main>
      {!isDesktop && <Offcanvas show={showChat} onHide={closeChat} onExited={() => chatButton.current?.focus()} restoreFocus={false} placement="end" className="chat-mobile" aria-labelledby="chat-title"><div id="room-chat">{showChat && chat}</div></Offcanvas>}
      <ShareRoomModal show={showShare} onHide={() => setShowShare(false)} roomCode={roomCode} deviceName={currentPeerName} peerCount={peerCount} connected={isConnected} onRename={updateDeviceName} />
    </div>
  );
}
