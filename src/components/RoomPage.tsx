import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Spinner, Badge, Collapse } from 'react-bootstrap';
import { Copy, Users, Home, Check, WifiOff, Server, QrCode, Clock, Monitor } from 'lucide-react';
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
    currentPeerName
  } = useRoom(roomCode);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [hasCopied, setHasCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

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
                    <div className="d-flex align-items-center gap-2 p-3 rounded mb-3" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                      <Monitor size={18} style={{ width: 18, height: 18 }} className="text-primary flex-shrink-0" />
                      <div>
                        <div className="small fw-semibold text-primary">Your Device</div>
                        <div className="text-muted small">{currentPeerName}</div>
                      </div>
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
