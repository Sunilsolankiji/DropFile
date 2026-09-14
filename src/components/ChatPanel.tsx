import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { Check, CircleAlert, Clock, MessageSquare, RotateCcw, Send, X } from 'lucide-react';
import type { ChatMessageWithMeta } from '@/hooks/use-backend-room';
import MessageText from './MessageText';

interface ChatPanelProps {
  messages: ChatMessageWithMeta[];
  currentPeerId: string | null;
  connected: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (value: string) => Promise<boolean>;
  onRetry: (messageId: string) => Promise<boolean>;
  sending: boolean;
  onClose: () => void;
}

export default function ChatPanel({ messages, currentPeerId, connected, draft, onDraftChange, onSend, onRetry, sending, onClose }: ChatPanelProps) {
  const [hasNew, setHasNew] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isAtBottom = useRef(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    if (isAtBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } else {
      setHasNew(true);
    }
  }, [messages]);

  const send = async () => {
    if (!draft.trim() || !connected || sending) return;
    isAtBottom.current = true;
    await onSend(draft.trim());
  };

  const messageGroups: { first: ChatMessageWithMeta; messages: ChatMessageWithMeta[] }[] = [];
  for (const message of messages) {
    const previousGroup = messageGroups[messageGroups.length - 1];
    if (previousGroup
      && previousGroup.first.peerId === message.peerId
      && Math.floor(new Date(previousGroup.first.createdAt).getTime() / 60000)
        === Math.floor(new Date(message.createdAt).getTime() / 60000)) {
      previousGroup.messages.push(message);
    } else {
      messageGroups.push({ first: message, messages: [message] });
    }
  }

  return (
    <section className="chat-panel" aria-labelledby="chat-title">
      <header className="chat-panel-header">
        <div className="chat-panel-heading"><h2 id="chat-title">Room chat</h2><p>A place for links and little notes.</p></div>
        <Button variant="link" className="icon-button" aria-label="Close chat" onClick={onClose}><X size={19} aria-hidden="true" /></Button>
      </header>
      <div
        ref={scrollRef}
        className="chat-messages"
        role="log"
        aria-label="Room messages"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) {
            isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            if (isAtBottom.current) setHasNew(false);
          }
        }}
      >
        {!messages.length ? (
          <div className="chat-empty"><MessageSquare size={28} strokeWidth={1.4} aria-hidden="true" /><h3>More than just files</h3><p>Send a link, a quick note, or text you need on another device.</p></div>
        ) : messageGroups.map(({ first, messages: group }) => {
          const isMine = first.peerId === currentPeerId;
          return (
            <div key={first.id} className={`chat-message-group${isMine ? ' is-mine' : ''}`} role="group" aria-label={`Messages from ${isMine ? 'you' : first.peerName}`}>
              <div className="message-meta"><span>{isMine ? 'You' : first.peerName}</span><time dateTime={new Date(first.createdAt).toISOString()}>{new Date(first.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
              {group.map(message => {
                const text = message.text || message.message || '';
                const statusLabel = message.status === 'pending' ? 'Sending' : message.status === 'failed' ? 'Not sent' : 'Sent';
                const StatusIcon = message.status === 'pending' ? Clock : message.status === 'failed' ? CircleAlert : Check;
                return (
                  <article key={message.id} className="message-body">
                    <div className={`message-content${isMine ? ' has-status' : ''}`}>
                      <MessageText text={text} />
                      {isMine && <div className="message-footer">
                        {message.status === 'failed' && <Button variant="link" className="message-retry" onClick={() => onRetry(message.id)} disabled={!connected || sending} aria-label="Retry failed message" title={connected ? 'Retry sending this message' : 'Reconnect to retry'}><RotateCcw size={13} aria-hidden="true" />Retry</Button>}
                        <span className={`message-status${message.status === 'failed' ? ' text-danger' : ''}`} role="status" title={statusLabel}><StatusIcon size={11} aria-hidden="true" /><span className="visually-hidden">{statusLabel}</span></span>
                      </div>}
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
      {hasNew && <Button variant="outline-secondary" className="new-messages-button" onClick={() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        isAtBottom.current = true;
        setHasNew(false);
      }}>View new messages</Button>}
      <Form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <Form.Label htmlFor="chat-message-input" className="visually-hidden">Message to the room</Form.Label>
        <div className="chat-input-row">
          <Form.Control
            id="chat-message-input"
            ref={inputRef}
            as="textarea"
            rows={2}
            placeholder="Write a message..."
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            readOnly={sending}
            aria-describedby="chat-hint"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button type="submit" className="icon-button" disabled={!connected || !draft.trim() || sending} aria-label={sending ? 'Sending message' : 'Send message'} title="Send message"><Send size={17} aria-hidden="true" /></Button>
        </div>
        <span id="chat-hint" className="composer-hint">{!connected ? 'Reconnect to send. Your draft will stay here.' : sending ? 'Sending your message...' : 'Ctrl / Cmd + Enter to send. Enter for a new line.'}</span>
      </Form>
    </section>
  );
}
