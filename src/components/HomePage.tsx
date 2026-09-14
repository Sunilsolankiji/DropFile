import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Collapse, Form } from 'react-bootstrap';
import { ArrowRight, ChevronDown, Clock } from 'lucide-react';
import AppHeader from './AppHeader';
import { generateAccessCode } from '@/lib/utils';

export default function HomePage() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [customError, setCustomError] = useState('');

  const openRoom = (code: string) => navigate(`/room/${encodeURIComponent(code.toUpperCase())}`);

  const handleJoin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!joinCode.trim()) {
      setJoinError('Enter the room code you received.');
      return;
    }
    openRoom(joinCode.trim());
  };

  const handleCustom = (event: React.FormEvent) => {
    event.preventDefault();
    if (!customCode.trim()) {
      setCustomError('Give your room a code to continue.');
      return;
    }
    openRoom(customCode.trim().replace(/\s+/g, '-'));
  };

  return (
    <div className="app-shell">
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="shell-width home-main enter-content">
        <div className="home-layout">
          <section className="home-intro" aria-labelledby="home-title">
            <div className="eyebrow">From your device to theirs</div>
            <h1 id="home-title">Files to share.<br /><span>Nothing in the way.</span></h1>
            <p className="home-description">A simple place to send files, links, and notes between devices. Create a room, share the code, and you're in.</p>
            <div className="home-note"><Clock size={15} aria-hidden="true" />Temporary files. No account needed.</div>
          </section>

          <section className="start-card" aria-label="Create or join a room">
            <h2>Start sharing</h2>
            <p>Create a room for you and your files.</p>
            <Button className="create-button" onClick={() => openRoom(generateAccessCode())}>
              Create a room <ArrowRight size={17} aria-hidden="true" />
            </Button>
            <Button
              variant="link"
              className="custom-toggle"
              aria-expanded={showCustom}
              aria-controls="custom-room-form"
              onClick={() => setShowCustom(!showCustom)}
            >
              Use a custom code <ChevronDown size={14} aria-hidden="true" />
            </Button>
            <Collapse in={showCustom}>
              <div id="custom-room-form">
                <Form className="custom-form" onSubmit={handleCustom} noValidate>
                  <Form.Group controlId="custom-code">
                    <Form.Label>Your room code</Form.Label>
                    <Form.Control
                      value={customCode}
                      onChange={(event) => { setCustomCode(event.target.value); setCustomError(''); }}
                      placeholder="e.g. DESIGN-TEAM"
                      className="code-input"
                      autoComplete="off"
                      spellCheck={false}
                      isInvalid={!!customError}
                      aria-invalid={!!customError}
                      required
                      aria-describedby={customError ? 'custom-error' : 'custom-hint'}
                    />
                    <Form.Control.Feedback type="invalid" id="custom-error" role="alert">{customError}</Form.Control.Feedback>
                    <Form.Text id="custom-hint">Use a code others can remember. Spaces become hyphens.</Form.Text>
                  </Form.Group>
                  <Button variant="outline-secondary" type="submit">Create with this code</Button>
                </Form>
              </div>
            </Collapse>

            <section className="join-section" aria-labelledby="join-title">
              <h2 id="join-title">Have a room code?</h2>
              <p>Pick up where someone else started.</p>
              <Form onSubmit={handleJoin} noValidate>
                <Form.Group controlId="join-code">
                  <Form.Label>Room code</Form.Label>
                  <div className="join-input-row">
                    <Form.Control
                      className="code-input"
                      placeholder="e.g. AB12CD"
                      value={joinCode}
                      onChange={(event) => { setJoinCode(event.target.value); setJoinError(''); }}
                      autoComplete="off"
                      spellCheck={false}
                      isInvalid={!!joinError}
                      aria-invalid={!!joinError}
                      required
                      aria-describedby={joinError ? 'join-error' : undefined}
                    />
                    <Button variant="outline-secondary" type="submit">Join <ArrowRight size={16} aria-hidden="true" /></Button>
                  </div>
                  {joinError && <p id="join-error" className="inline-error" role="alert">{joinError}</p>}
                </Form.Group>
              </Form>
            </section>
          </section>
        </div>

        <ol className="how-it-works" aria-label="How it works">
          <li className="how-step"><span className="step-number" aria-hidden="true">01</span><div><h2>Make a little room</h2><p>Start a shared space in one click.</p></div></li>
          <li className="how-step"><span className="step-number" aria-hidden="true">02</span><div><h2>Bring another device</h2><p>Share your code or scan the room's QR.</p></div></li>
          <li className="how-step"><span className="step-number" aria-hidden="true">03</span><div><h2>Drop it. Pick it up.</h2><p>Add files here. Download them over there.</p></div></li>
        </ol>
      </main>
      <footer className="shell-width app-footer">
        <span>DropFile &copy; {new Date().getFullYear()}</span>
        <a href="https://github.com/Sunilsolankiji/DropFile" target="_blank" rel="noopener noreferrer">View on GitHub</a>
      </footer>
    </div>
  );
}
