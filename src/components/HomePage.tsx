import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Form, Button } from 'react-bootstrap';
import { ArrowRight, Sparkles } from 'lucide-react';
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
    <Container className="d-flex flex-column align-items-center justify-content-center min-vh-100 py-4">
      <header className="text-center mb-4">
        <h1 className="display-4 fw-bold text-primary">DropFile</h1>
        <p className="text-muted">Instant file sharing via access code.</p>
      </header>

      <Card className="w-100" style={{ maxWidth: '700px' }}>
        <Card.Body className="p-0">
          <Row className="g-0">
            <Col md={6} className="p-4">
              <h5 className="fw-semibold mb-2">Create a Space</h5>
              <p className="text-muted small mb-3">Start a new sharing session.</p>
              <Button
                variant="primary"
                className="w-100 mb-3 d-flex align-items-center justify-content-center gap-2"
                onClick={() => handleCreateRoom(generateAccessCode())}
              >
                <Sparkles size={18} /> Create Instant Space
              </Button>
              <hr />
              <Form.Group className="mb-2">
                <Form.Label className="small">Or use a custom code</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="e.g., 'MY-PROJECT'"
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

            <Col md={6} className="p-4 bg-light rounded-end">
              <Form onSubmit={handleJoinRoom}>
                <h5 className="fw-semibold mb-2">Join a Space</h5>
                <p className="text-muted small mb-3">Enter an access code to join.</p>
                <Form.Group className="mb-2">
                  <Form.Label className="small">Access Code</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g., AB12CD"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="text-uppercase"
                    style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}
                  />
                </Form.Group>
                <Button
                  type="submit"
                  variant="warning"
                  className="w-100 d-flex align-items-center justify-content-center gap-2"
                >
                  <ArrowRight size={18} /> Join Space
                </Button>
              </Form>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <footer className="mt-4 text-center text-muted small">
        <p className="mb-1">Files are temporary and automatically deleted after 15 minutes.</p>
        <p className="mb-2">&copy; {new Date().getFullYear()} DropFile. All rights reserved.</p>
        <p>
          <a
            href="https://github.com/Sunilsolankiji/DropFile"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link d-inline-flex align-items-center gap-1"
          >
            <svg className="me-1" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
          </a>
        </p>
      </footer>
    </Container>
  );
}
