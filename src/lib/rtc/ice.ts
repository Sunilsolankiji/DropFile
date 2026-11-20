import { apiUrl } from '../config';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }];
let cached: Promise<RTCIceServer[]> | null = null;

export function isWebRtcSupported(): boolean {
  return typeof globalThis.RTCPeerConnection === 'function';
}

let warmed = false;

/**
 * The first RTCPeerConnection in a page can take over a second to create (the browser initialises
 * its network stack). Do that once while the page is idle so the first transfer starts instantly.
 */
export function warmUpWebRtc(): void {
  if (warmed || !isWebRtcSupported()) return;
  warmed = true;
  const warm = () => {
    try {
      new RTCPeerConnection().close();
    } catch {
      // Ignore: the real connection reports any failure.
    }
  };
  const idle = (globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(warm, { timeout: 3000 });
  else setTimeout(warm, 1000);
}

/**
 * ICE servers from the backend (`/api/rtc-config`). Devices on the same Wi-Fi connect through
 * host candidates, so an empty list (offline LAN mode) still works.
 */
export function getIceServers(): Promise<RTCIceServer[]> {
  cached ??= (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(apiUrl('/api/rtc-config'), { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { iceServers?: RTCIceServer[] };
      return Array.isArray(body.iceServers) ? body.iceServers : FALLBACK_ICE_SERVERS;
    } catch {
      cached = null;
      return FALLBACK_ICE_SERVERS;
    } finally {
      clearTimeout(timer);
    }
  })();
  return cached;
}
