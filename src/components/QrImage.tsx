import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Locally generated QR code; the URL is never sent to a third-party service. */
export default function QrImage({ value, alt, size = 176 }: { value: string; alt: string; size?: number }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc('');
    setFailed(false);
    QRCode.toDataURL(value, { width: size * 2, margin: 2, color: { dark: '#202936', light: '#ffffff' } })
      .then(url => { if (active) setSrc(url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [value, size]);

  if (src) return <img src={src} alt={alt} width={size} height={size} />;
  return <p className={failed ? 'inline-error' : 'muted'} role="status">{failed ? 'QR unavailable. Use the link instead.' : 'Preparing QR code...'}</p>;
}
