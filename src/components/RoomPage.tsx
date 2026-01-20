import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Spinner, Badge } from 'react-bootstrap';
import { Copy, Users, Home, Check, Wifi, WifiOff, Cloud, Monitor, QrCode, Clock } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import FileList from '@/components/FileList';
import { useToast } from '@/hooks/use-toast';
import { useRoom } from '@/hooks/use-room';

type RoomPageProps = {
  roomCode: string;
};

export default function RoomPage({ roomCode }: RoomPageProps) {
  const { toast } = useToast();
  const {
    files,
    uploadFiles,
    deleteFile,
    downloadFile,
    loading,
    error,
    connectionMode,
    localPeerCount,
    isLocalConnected
  } = useRoom(roomCode);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [hasCopied, setHasCopied] = useState(false);

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

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
    setHasCopied(true);
    toast({
      title: 'Copied!',
      description: 'Access code copied to clipboard.',
      variant: 'success'
    });
    setTimeout(() => setHasCopied(false), 2000);
  };

  const getConnectionBadge = () => {
    if (connectionMode === 'local') {
      return (
        <span className="status-badge status-local">
          <Monitor size={14} style={{ width: 14, height: 14 }} />
          Local {localPeerCount > 0 && `(${localPeerCount})`}
        </span>
      );
    } else if (connectionMode === 'both') {
      return (
        <span className="status-badge status-local">
          <Wifi size={14} style={{ width: 14, height: 14 }} />
          Local + Cloud
        </span>
      );
    } else if (connectionMode === 'firebase') {
      return (
        <span className="status-badge status-cloud">
          <Cloud size={14} style={{ width: 14, height: 14 }} />
          Cloud
        </span>
      );
    }
    return (
      <span className="status-badge status-offline">
        <WifiOff size={14} style={{ width: 14, height: 14 }} />
        Offline
      </span>
    );
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      {/* Header */}
      <header className="app-header py-3 px-3 px-md-4">
        <Container fluid>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
            <Link to="/" className="d-flex align-items-center gap-2 text-decoration-none">
              <div className="rounded-circle bg-primary bg-opacity-10 p-2 d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
                <Home size={20} style={{ width: 20, height: 20 }} className="text-primary" />
              </div>
              <span className="app-logo d-none d-sm-inline">DropFile</span>
            </Link>

            <div className="d-flex align-items-center gap-3">
              {getConnectionBadge()}

              <div className="d-flex align-items-center gap-2">
                <Users size={18} style={{ width: 18, height: 18 }} className="text-muted d-none d-sm-inline" />
                <span className="fw-semibold d-none d-sm-inline">Room:</span>
                <div className="d-flex align-items-center gap-2">
                  <span className="room-code">{roomCode}</span>
                  <Button
                    variant={hasCopied ? "success" : "outline-secondary"}
                    size="sm"
                    onClick={handleCopy}
                    className="d-flex align-items-center justify-content-center"
                    style={{ width: '36px', height: '36px', padding: 0 }}
                  >
                    {hasCopied ? <Check size={16} style={{ width: 16, height: 16 }} /> : <Copy size={16} style={{ width: 16, height: 16 }} />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </header>

      {/* Main Content */}
      <main className="flex-grow-1 py-4">
        <Container>
          <Row className="g-4">
            {/* File Upload & List */}
            <Col lg={8}>
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
                  <FileList files={files} onDelete={deleteFile} onDownload={downloadFile} />
                )}
              </div>
            </Col>

            {/* Sidebar */}
            <Col lg={4}>
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

                  {isLocalConnected && (
                    <div className="d-flex align-items-center gap-2 p-3 rounded" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                      <Monitor size={18} style={{ width: 18, height: 18 }} className="text-success flex-shrink-0" />
                      <div>
                        <div className="small fw-semibold text-success">Local sharing active</div>
                        <div className="text-muted small">
                          {localPeerCount > 0
                            ? `${localPeerCount} peer${localPeerCount > 1 ? 's' : ''} connected`
                            : 'Waiting for peers...'
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
