import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Spinner, Badge } from 'react-bootstrap';
import { Copy, Users, Home, Check, Wifi, WifiOff, Cloud, Monitor } from 'lucide-react';
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
    setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(url)}`);
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

  const getConnectionStatusIcon = () => {
    if (connectionMode === 'local') {
      return <Monitor size={16} className="status-local" />;
    } else if (connectionMode === 'both') {
      return <Wifi size={16} className="status-local" />;
    } else if (connectionMode === 'firebase') {
      return <Cloud size={16} className="status-cloud" />;
    }
    return <WifiOff size={16} className="status-offline" />;
  };

  const getConnectionStatusText = () => {
    if (connectionMode === 'local') {
      return `Local only${localPeerCount > 0 ? ` (${localPeerCount} peer${localPeerCount > 1 ? 's' : ''})` : ''}`;
    } else if (connectionMode === 'both') {
      return `Local${localPeerCount > 0 ? ` (${localPeerCount})` : ''} + Cloud`;
    } else if (connectionMode === 'firebase') {
      return 'Cloud only';
    }
    return 'Disconnected';
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <header className="app-header py-3 px-4">
        <Container fluid>
          <div className="d-flex justify-content-between align-items-center">
            <Link to="/" className="d-flex align-items-center gap-2 text-decoration-none">
              <Home size={24} className="text-primary" />
              <h1 className="h4 mb-0 fw-bold text-primary">DropFile</h1>
            </Link>
            <div className="d-flex align-items-center gap-3">
              <div className="d-flex align-items-center gap-2 text-muted small">
                {getConnectionStatusIcon()}
                <span>{getConnectionStatusText()}</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <Users size={20} className="text-muted" />
                <span className="fw-semibold">Room:</span>
                <div className="d-flex align-items-center gap-2 bg-light px-3 py-2 rounded">
                  <span className="room-code">{roomCode}</span>
                  <Button
                    variant="link"
                    className="p-0 text-muted"
                    onClick={handleCopy}
                  >
                    {hasCopied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </header>

      <main className="flex-grow-1 py-4">
        <Container>
          <Row>
            <Col lg={8}>
              <FileUpload onUpload={uploadFiles} />
              <div className="mt-4">
                <h2 className="h4 mb-3">Shared Files</h2>
                {loading ? (
                  <div className="d-flex align-items-center justify-content-center p-5">
                    <Spinner animation="border" variant="primary" className="me-2" />
                    <span className="text-muted">Loading files...</span>
                  </div>
                ) : (
                  <FileList files={files} onDelete={deleteFile} onDownload={downloadFile} />
                )}
              </div>
            </Col>

            <Col lg={4}>
              <Card className="sticky-top" style={{ top: '1rem' }}>
                <Card.Body>
                  <h5 className="mb-3">Share this Room</h5>
                  <p className="text-muted small">
                    Others can join this room using the access code or by scanning the QR code.
                  </p>
                  {qrCodeUrl && (
                    <div className="qr-container">
                      <img
                        src={qrCodeUrl}
                        alt="Room QR Code"
                        width={128}
                        height={128}
                      />
                    </div>
                  )}
                  <div className="mt-3 text-center">
                    <p className="text-muted small mb-2">Files expire 15 minutes after upload.</p>
                    {isLocalConnected && (
                      <Badge bg="success" className="d-inline-flex align-items-center gap-1">
                        <Monitor size={12} />
                        Local sharing enabled
                      </Badge>
                    )}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </main>
    </div>
  );
}
