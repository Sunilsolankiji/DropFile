import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Form, Button } from 'react-bootstrap';
import { ArrowRight, Sparkles, Share2, Shield, Zap } from 'lucide-react';
import { generateAccessCode } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function HomePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [joinCode, setJoinCode] = useState('');
  const [customCode, setCustomCode] = useState('');

  const handleCreateRoom = (code: string) => {
    if (code) {
      navigate(`/room/${code.toUpperCase()}`);
    } else {
      toast({
        title: 'Error',
        description: 'Could not create a room. Please try again.',
        variant: 'danger'
      });
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim()) {
      navigate(`/room/${joinCode.trim().toUpperCase()}`);
    } else {
      toast({
        title: 'Invalid Code',
        description: 'Please enter a valid access code.',
        variant: 'danger'
      });
    }
  };

  const handleCreateWithCustomCode = () => {
    if (customCode.trim()) {
      handleCreateRoom(customCode.trim().replace(/\s+/g, '-'));
    } else {
      toast({
        title: 'Code Required',
        description: 'Please enter a custom code.',
        variant: 'danger'
      });
    }
  };

  return (
    <div className="min-vh-100 d-flex flex-column">
      <Container className="flex-grow-1 d-flex flex-column align-items-center justify-content-center py-5">
        {/* Hero Section */}
        <header className="text-center mb-5">
          <div className="mb-3">
            <span className="badge bg-primary bg-opacity-10 text-primary px-3 py-2 rounded-pill d-inline-flex align-items-center">
              <Zap size={14} style={{ width: 14, height: 14 }} className="me-1" /> Fast & Secure File Sharing
            </span>
          </div>
          <h1 className="page-title">DropFile</h1>
          <p className="text-muted fs-5 mb-0">
            Share files instantly with anyone using a simple access code
          </p>
        </header>

        {/* Main Card */}
        <Card className="w-100 mb-5" style={{ maxWidth: '780px' }}>
          <Card.Body className="p-0">
            <Row className="g-0">
              {/* Create Section */}
              <Col md={6} className="p-4 p-lg-5">
                <div className="d-flex align-items-center gap-2 mb-3">
                  <div className="rounded-circle bg-primary bg-opacity-10 p-2 d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
                    <Sparkles size={20} style={{ width: 20, height: 20 }} className="text-primary" />
                  </div>
                  <h5 className="fw-bold mb-0">Create a Space</h5>
                </div>
                <p className="text-muted mb-4">Start a new file sharing session instantly.</p>

                <Button
                  variant="primary"
                  size="lg"
                  className="w-100 mb-4 d-flex align-items-center justify-content-center gap-2"
                  onClick={() => handleCreateRoom(generateAccessCode())}
                >
                  <Sparkles size={18} style={{ width: 18, height: 18 }} /> Create Instant Space
                </Button>

                <div className="section-divider">
                  <span>or use custom code</span>
                </div>

                <Form.Group className="mb-3">
                  <Form.Control
                    type="text"
                    placeholder="Enter custom code (e.g., MY-PROJECT)"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                  />
                </Form.Group>
                <Button
                  variant="outline-primary"
                  className="w-100"
                  onClick={handleCreateWithCustomCode}
                >
                  Create with Custom Code
                </Button>
              </Col>

              {/* Join Section */}
              <Col md={6} className="p-4 p-lg-5" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
                <Form onSubmit={handleJoinRoom}>
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <div className="rounded-circle bg-warning bg-opacity-10 p-2 d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
                      <Share2 size={20} style={{ width: 20, height: 20 }} className="text-warning" />
                    </div>
                    <h5 className="fw-bold mb-0">Join a Space</h5>
                  </div>
                  <p className="text-muted mb-4">Enter an access code to join an existing room.</p>

                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-semibold">Access Code</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="Enter code (e.g., AB12CD)"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      className="text-uppercase text-center"
                      style={{
                        fontFamily: 'monospace',
                        letterSpacing: '0.15em',
                        fontSize: '1.1rem',
                        padding: '0.85rem'
                      }}
                    />
                  </Form.Group>
                  <Button
                    type="submit"
                    variant="warning"
                    size="lg"
                    className="w-100 d-flex align-items-center justify-content-center gap-2"
                  >
                    Join Space <ArrowRight size={18} style={{ width: 18, height: 18 }} />
                  </Button>
                </Form>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Features */}
        <Row className="g-4 mb-5" style={{ maxWidth: '780px' }}>
          <Col xs={12} md={4}>
            <div className="text-center">
              <div className="rounded-circle bg-primary bg-opacity-10 p-3 d-inline-flex align-items-center justify-content-center mb-3" style={{ width: 56, height: 56 }}>
                <Zap size={24} style={{ width: 24, height: 24 }} className="text-primary" />
              </div>
              <h6 className="fw-bold">Lightning Fast</h6>
              <p className="text-muted small mb-0">
                Local network sharing for instant transfers
              </p>
            </div>
          </Col>
          <Col xs={12} md={4}>
            <div className="text-center">
              <div className="rounded-circle bg-success bg-opacity-10 p-3 d-inline-flex align-items-center justify-content-center mb-3" style={{ width: 56, height: 56 }}>
                <Shield size={24} style={{ width: 24, height: 24 }} className="text-success" />
              </div>
              <h6 className="fw-bold">Auto-Expiring</h6>
              <p className="text-muted small mb-0">
                Files automatically deleted after 15 minutes
              </p>
            </div>
          </Col>
          <Col xs={12} md={4}>
            <div className="text-center">
              <div className="rounded-circle bg-warning bg-opacity-10 p-3 d-inline-flex align-items-center justify-content-center mb-3" style={{ width: 56, height: 56 }}>
                <Share2 size={24} style={{ width: 24, height: 24 }} className="text-warning" />
              </div>
              <h6 className="fw-bold">Easy Sharing</h6>
              <p className="text-muted small mb-0">
                Simple codes and QR for quick access
              </p>
            </div>
          </Col>
        </Row>
      </Container>

      {/* Footer */}
      <footer className="py-4 text-center">
        <p className="text-muted small mb-2">
          &copy; {new Date().getFullYear()} DropFile. All rights reserved.
        </p>
        <a
          href="https://github.com/Sunilsolankiji/DropFile"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          View on GitHub
        </a>
      </footer>
    </div>
  );
}
