import { Toast, ToastContainer } from 'react-bootstrap';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

function getToastIcon(variant?: string) {
  const iconStyle = { width: 20, height: 20 };
  switch (variant) {
    case 'success':
      return <CheckCircle size={20} style={iconStyle} className="text-success" />;
    case 'danger':
      return <XCircle size={20} style={iconStyle} className="text-danger" />;
    case 'warning':
      return <AlertCircle size={20} style={iconStyle} className="text-warning" />;
    default:
      return <Info size={20} style={iconStyle} className="text-info" />;
  }
}

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastContainer className="toast-container-fixed" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          onClose={() => dismiss(t.id)}
          role={t.variant === 'danger' ? 'alert' : 'status'}
        >
          <Toast.Header>
            <div className="toast-title">
              {getToastIcon(t.variant)}
              <strong>{t.title}</strong>
            </div>
          </Toast.Header>
          {t.description && (
            <Toast.Body>{t.description}</Toast.Body>
          )}
        </Toast>
      ))}
    </ToastContainer>
  );
}
