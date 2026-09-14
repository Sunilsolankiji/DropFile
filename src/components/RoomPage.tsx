import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Spinner, Badge, Collapse, Form } from 'react-bootstrap';
import { Copy, Users, Home, Check, WifiOff, Server, QrCode, Clock, Monitor, MessageSquareText, Send, ClipboardCopy, CircleCheckBig, CircleAlert } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import FileList from '@/components/FileList';
import { useToast } from '@/hooks/use-toast';
import { useRoom } from '@/hooks/use-backend-room';

type RoomPageProps = {
  roomCode: string;
};

export default function RoomPage({ roomCode }: RoomPageProps) {
  const { toast } = useToast();
  const {
    files,
    uploadingFiles,
    uploadFiles,
    deleteFile,
    downloadFile,
    loading,
    error,
    isConnected,
    peerCount,
    currentPeerId,
    currentPeerName,
    sendText,
    textMessages,
    updateDeviceName
  } = useRoom(roomCode);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [hasCopied, setHasCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState(currentPeerName || '');
  const [isEditingDeviceName, setIsEditingDeviceName] = useState(false);
  const [showCopyOnSent, setShowCopyOnSent] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const url = window.location.href;
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`);
  }, []);

  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "danger",
      });
    }
  }, [error, toast]);

  useEffect(() => {
    setDeviceNameInput(currentPeerName || '');
  }, [currentPeerName]);

  useEffect(() => {
    if (showChat) {
      const el = chatScrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
      chatInputRef.current?.focus();
    }
  }, [textMessages, showChat]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setHasCopied(true);
      toast({
        title: 'Copied!',
        description: 'Access code copied to clipboard.',
        variant: 'success'
      });
      setTimeout(() => setHasCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = roomCode;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setHasCopied(true);
        toast({
          title: 'Copied!',
          description: 'Access code copied to clipboard.',
          variant: 'success'
        });
        setTimeout(() => setHasCopied(false), 2000);
      } catch (e) {
        toast({
          title: 'Copy Failed',
          description: 'Please copy the code manually.',
          variant: 'danger'
        });
      }
      document.body.removeChild(textArea);
    }
  };

  const handleRenameDevice = () => {
    updateDeviceName(deviceNameInput);
    setIsEditingDeviceName(false);
  };

  const handleShareText = async () => {
    if (!textValue.trim()) {
      toast({
        title: 'Text Required',
        description: 'Enter text to share with other devices.',
        variant: 'danger'
      });
      return;
    }

    setIsSending(true);
    sendText(textValue.trim());
    setTextValue('');
    setTimeout(() => {
      setIsSending(false);
      if (showChat) {
        chatInputRef.current?.focus();
      }
    }, 1200);
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleShareText();
    }
  };

  const copyMessageText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: 'Message copied to clipboard.',
      variant: 'success'
    });
  };

  const getConnectionBadge = () => {
    if (isConnected) {
      return (
        <span className="status-badge status-local" title="Connected to backend server">
          <Server size={14} style={{ width: 14, height: 14 }} />
          Backend Connected
        </span>
      );
    }
    return (
      <span className="status-badge status-offline" title="Connecting to backend server">
        <WifiOff size={14} style={{ width: 14, height: 14 }} />
        Connecting...
      </span>
    );
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      {/* Header */}
      <header className="app-header py-2 py-md-3 px-2 px-md-4">
        <Container fluid>
          <div className="d-flex justify-content-between align-items-center gap-2">
            <Link to="/" className="d-flex align-items-center gap-2 text-decoration-none">
              <div className="rounded-circle bg-primary bg-opacity-10 p-2 d-flex align-items-center justify-content-center" style={{ width: 36, height: 36 }}>
                <Home size={18} style={{ width: 18, height: 18 }} className="text-primary" />
              </div>
              <span className="app-logo">DropFile</span>
            </Link>

            <div className="d-flex align-items-center gap-2">
              <span className="d-none d-md-inline">{getConnectionBadge()}</span>
              <span className="room-code">{roomCode}</span>
              <Button
                variant={hasCopied ? "success" : "outline-secondary"}
                size="sm"
                onClick={handleCopy}
                className="d-flex align-items-center justify-content-center"
                style={{ width: '36px', height: '36px', padding: 0 }}
                title="Copy room code"
              >
                {hasCopied ? <Check size={16} style={{ width: 16, height: 16 }} /> : <Copy size={16} style={{ width: 16, height: 16 }} />}
              </Button>
            </div>
          </div>
        </Container>
      </header>

      {/* Main Content */}
      <main className="flex-grow-1 py-3 py-md-4">
        <Container>
          <Row className="g-3 g-md-4">
            {/* Mobile connection status & QR - shown only on mobile */}
            <Col xs={12} className="d-lg-none">
              <Card className="mb-0">
                <Card.Body className="p-2">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      {isConnected ? (
                        <span className="status-badge status-local">
                          <Server size={14} style={{ width: 14, height: 14 }} />
                          <span>Connected</span>
                        </span>
                      ) : (
                        <span className="status-badge status-offline">
                          <WifiOff size={14} style={{ width: 14, height: 14 }} />
                          <span>Connecting...</span>
                        </span>
                      )}
                      {currentPeerName && (
                        <span className="badge bg-primary bg-opacity-10 text-primary">
                          <Monitor size={12} style={{ width: 12, height: 12 }} className="me-1" />
                          {currentPeerName}
                        </span>
                      )}
                      <span className="badge bg-success bg-opacity-10 text-success">
                        <Users size={12} style={{ width: 12, height: 12 }} className="me-1" />
                        {peerCount} device{peerCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => setShowQR(!showQR)}
                      className="d-flex align-items-center justify-content-center"
                      style={{ width: '36px', height: '36px', padding: 0 }}
                      title={showQR ? 'Hide QR Code' : 'Show QR Code'}
                    >
                      <QrCode size={16} style={{ width: 16, height: 16 }} />
                    </Button>
                  </div>

                  <Collapse in={showQR}>
                    <div>
                      <div className="text-center py-2">
                        <p className="text-muted small mb-2">
                          Room Code: <strong className="text-primary">{roomCode}</strong>
                        </p>
                        {qrCodeUrl && (
                          <div className="d-inline-block p-2 rounded" style={{ background: 'white' }}>
                            <img
                              src={qrCodeUrl}
                              alt="Room QR Code"
                              width={120}
                              height={120}
                              style={{ display: 'block' }}
                            />
                          </div>
                        )}
                        <p className="text-muted small mt-2 mb-0">
                          Scan to join this room
                        </p>
                      </div>
                    </div>
                  </Collapse>
                </Card.Body>
              </Card>
            </Col>

            {/* File Upload & List */}
            <Col lg={8} className="order-2 order-lg-1">
              <FileUpload onUpload={uploadFiles} />

              <Card className="mt-4">
                <Card.Body>
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
                    <div className="d-flex align-items-center gap-2">
                      <MessageSquareText size={18} style={{ width: 18, height: 18 }} className="text-primary" />
                      <h2 className="h5 fw-bold mb-0">Chat</h2>
                    </div>
                    <Button
                      variant={showChat ? 'outline-secondary' : 'primary'}
                      size="sm"
                      onClick={() => setShowChat(!showChat)}
                      className="d-inline-flex align-items-center gap-2 rounded-pill"
                      style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', lineHeight: 1 }}
                    >
                      <span
                        className="d-inline-block rounded-circle"
                        style={{
                          width: 8,
                          height: 8,
                          backgroundColor: showChat ? 'currentColor' : 'white'
                        }}
                      />
                      {showChat ? 'Hide chat' : 'Open chat'}
                    </Button>
                  </div>
                  {showChat ? (
                  <div className="d-flex flex-column gap-2 gap-md-3">
                    <div
                      ref={chatScrollRef}
                      className="rounded p-2 p-md-3 d-flex flex-column gap-2"
                      style={{ minHeight: '240px', maxHeight: '45vh', overflowY: 'auto', background: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.2)' }}
                    >
                      {textMessages.length === 0 ? (
                        <div className="text-muted small text-center py-5">No messages yet.</div>
                      ) : (
                        textMessages.map(message => {
                          const isMine = message.peerId === currentPeerId || message.peerName === currentPeerName;
                          return (
                            <div key={message.id} className={`d-flex ${isMine ? 'justify-content-end' : 'justify-content-start'}`}>
                              <div className={`d-flex align-items-end gap-2 ${isMine ? 'flex-row-reverse' : ''}`} style={{ maxWidth: 'min(86%, 100%)' }}>
                                <div
                                  className="px-3 py-2 rounded-4"
                                  style={{
                                    background: isMine ? '#2563eb' : 'white',
                                    color: isMine ? 'white' : 'inherit',
                                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
                                    border: isMine ? 'none' : '1px solid rgba(148, 163, 184, 0.22)'
                                  }}
                                >
                                  <div className="d-flex align-items-center justify-content-between gap-3 mb-1" style={{ fontSize: '0.72rem', opacity: 0.85 }}>
                                    <span className="fw-semibold">{isMine ? 'You' : message.peerName}</span>
                                    <span className="d-inline-flex align-items-center gap-1">
                                      <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                      {isMine && message.status === 'sent' && <CircleCheckBig size={10} style={{ width: 10, height: 10 }} />}
                                      {isMine && message.status === 'pending' && <CircleAlert size={10} style={{ width: 10, height: 10 }} />}
                                    </span>
                                  </div>
                                  <div style={{ whiteSpace: 'pre-wrap' }}>{message.text || message.message || ''}</div>
                                </div>
                                {showCopyOnSent && (
                                  <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    className="rounded-circle flex-shrink-0 d-inline-flex align-items-center justify-content-center"
                                    onClick={() => copyMessageText(message.text || message.message || '')}
                                    title="Copy message"
                                    style={{ width: 30, height: 30, padding: 0 }}
                                  >
                                    <ClipboardCopy size={12} style={{ width: 12, height: 12 }} />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="rounded p-2 d-flex align-items-end gap-2 flex-column flex-sm-row" style={{ background: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.2)' }}>
                      <Form.Control
                        ref={chatInputRef}
                        as="textarea"
                        rows={1}
                        placeholder="Message"
                        value={textValue}
                        onChange={(e) => setTextValue(e.target.value)}
                        onKeyDown={handleChatKeyDown}
                        onFocus={() => {
                          if (showChat) {
                            chatInputRef.current?.focus();
                          }
                        }}
                        style={{ resize: 'none', border: 'none', boxShadow: 'none', background: 'transparent', minHeight: '38px', width: '100%' }}
                      />
                      <Button
                        variant="primary"
                        onClick={handleShareText}
                        onMouseDown={(e) => e.preventDefault()}
                        disabled={isSending}
                        className="d-inline-flex align-items-center justify-content-center rounded-circle flex-shrink-0 align-self-end align-self-sm-auto"
                        style={{ width: 40, height: 40, padding: 0 }}
                      >
                        <Send size={16} style={{ width: 16, height: 16 }} />
                      </Button>
                    </div>
                    <Form.Check
                      type="checkbox"
                      id="show-copy-on-sent"
                      label="Show copy button on sent messages"
                      checked={showCopyOnSent}
                      onChange={(e) => setShowCopyOnSent(e.target.checked)}
                      className="small text-muted"
                    />
                  </div>
                  ) : (
                    <div className="text-muted small">Chat is collapsed.</div>
                  )}
                </Card.Body>
              </Card>

              <div className="mt-4">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h2 className="h5 fw-bold mb-0">
                    Shared Files
                    {files.length > 0 && (
                      <Badge bg="primary" className="ms-2">{files.length}</Badge>
                    )}
                  </h2>
                </div>

                {loading ? (
                  <Card>
                    <Card.Body className="text-center py-5">
                      <Spinner animation="border" variant="primary" className="mb-3" />
                      <p className="text-muted mb-0">Loading files...</p>
                    </Card.Body>
                  </Card>
                ) : (
                  <FileList files={files} uploadingFiles={uploadingFiles} currentPeerId={currentPeerId} onDelete={deleteFile} onDownload={downloadFile} />
                )}
              </div>
            </Col>

            {/* Sidebar - hidden on mobile, shown on desktop */}
            <Col lg={4} className="order-1 order-lg-2 d-none d-lg-block">
              <Card className="sidebar-card">
                <Card.Body>
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <QrCode size={20} style={{ width: 20, height: 20 }} className="text-primary" />
                    <h5 className="mb-0">Share this Room</h5>
                  </div>

                  <p className="text-muted small mb-4">
                    Others can join using the code <strong>{roomCode}</strong> or by scanning the QR code below.
                  </p>

                  {qrCodeUrl && (
                    <div className="qr-container mb-4">
                      <img
                        src={qrCodeUrl}
                        alt="Room QR Code"
                        width={150}
                        height={150}
                      />
                    </div>
                  )}

                  <div className="d-flex align-items-center gap-2 p-3 rounded mb-3" style={{ background: 'rgba(100, 116, 139, 0.1)' }}>
                    <Clock size={18} style={{ width: 18, height: 18 }} className="text-muted flex-shrink-0" />
                    <div>
                      <div className="small fw-semibold">Auto-expiring files</div>
                      <div className="text-muted small">Files deleted after 15 minutes</div>
                    </div>
                  </div>

                  {currentPeerName && (
                    <div className="p-2 rounded mb-3 d-flex align-items-center justify-content-between gap-2 flex-wrap" style={{ background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                      <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1">
                        <div className="rounded-circle bg-primary bg-opacity-10 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 28, height: 28 }}>
                          <Monitor size={14} style={{ width: 14, height: 14 }} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="small fw-semibold text-primary mb-0">Your Device</div>
                          {!isEditingDeviceName ? (
                            <div className="text-muted text-truncate" style={{ fontSize: '0.8rem' }}>{currentPeerName}</div>
                          ) : (
                            <Form.Control
                              size="sm"
                              value={deviceNameInput}
                              onChange={(e) => setDeviceNameInput(e.target.value)}
                              placeholder="Rename device"
                            />
                          )}
                        </div>
                      </div>
                      {!isEditingDeviceName ? (
                        <Button
                          variant="link"
                          className="p-0 text-primary text-decoration-none"
                          onClick={() => setIsEditingDeviceName(true)}
                          style={{ fontSize: '0.8rem' }}
                        >
                          Edit
                        </Button>
                      ) : (
                        <Button
                          variant="link"
                          className="p-0 text-primary text-decoration-none"
                          onClick={handleRenameDevice}
                          style={{ fontSize: '0.8rem' }}
                        >
                          Save
                        </Button>
                      )}
                    </div>
                  )}

                  {isConnected && (
                    <div className="d-flex align-items-center gap-2 p-3 rounded" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                      <Users size={18} style={{ width: 18, height: 18 }} className="text-success flex-shrink-0" />
                      <div>
                        <div className="small fw-semibold text-success">Backend Connected</div>
                        <div className="text-muted small">
                          {peerCount > 1
                            ? `${peerCount - 1} other device${peerCount - 1 > 1 ? 's' : ''} connected`
                            : 'You are the only one here'
                          }
                        </div>
                      </div>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </main>
    </div>
  );
}
