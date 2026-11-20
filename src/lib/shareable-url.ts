import { useEffect, useState } from 'react';
import { LAN_MODE, apiUrl } from './config';

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i;

/**
 * The current page URL as other devices should open it. In LAN mode, a page opened on the host
 * computer as http://localhost is rewritten to the server's Wi-Fi address so QR codes work on phones.
 */
export function useShareableUrl(): string {
  const [url, setUrl] = useState(() => window.location.href);

  useEffect(() => {
    setUrl(window.location.href);
    if (!LAN_MODE || !LOOPBACK.test(window.location.hostname)) return;
    let active = true;
    fetch(apiUrl('/api/server-info'), { credentials: 'omit' })
      .then(response => response.ok ? response.json() : null)
      .then((info: { lanUrls?: string[] } | null) => {
        const lanOrigin = info?.lanUrls?.[0];
        if (!active || !lanOrigin) return;
        const current = new URL(window.location.href);
        const lan = new URL(lanOrigin);
        current.protocol = lan.protocol;
        current.host = lan.host;
        setUrl(current.href);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return url;
}
