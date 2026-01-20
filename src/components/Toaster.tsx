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
    <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 1050 }}>
      {toasts.map((t) => (
        <Toast
          key={t.id}
          onClose={() => dismiss(t.id)}
          className="border-0"
          style={{
            minWidth: '300px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
          }}
        >
          <Toast.Header className="border-0 pb-0">
            <div className="d-flex align-items-center gap-2 me-auto">
              {getToastIcon(t.variant)}
              <strong>{t.title}</strong>
            </div>
          </Toast.Header>
          {t.description && (
            <Toast.Body className="pt-1 text-muted">{t.description}</Toast.Body>
          )}
        </Toast>
      ))}
    </ToastContainer>
  );
}
