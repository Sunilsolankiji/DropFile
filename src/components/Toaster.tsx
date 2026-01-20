import { Toast, ToastContainer } from 'react-bootstrap';
import { useToast } from '@/hooks/use-toast';

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 1050 }}>
      {toasts.map((t) => (
        <Toast
          key={t.id}
          onClose={() => dismiss(t.id)}
          bg={t.variant || 'info'}
          autohide
          delay={5000}
        >
          <Toast.Header>
            <strong className="me-auto">{t.title}</strong>
          </Toast.Header>
          {t.description && (
            <Toast.Body className={t.variant === 'danger' || t.variant === 'success' ? 'text-white' : ''}>
              {t.description}
            </Toast.Body>
          )}
        </Toast>
      ))}
    </ToastContainer>
  );
}

