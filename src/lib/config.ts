/**
 * Central backend configuration.
 *
 * All backend communication (Socket.IO, REST, and chunk transfers) must use the
 * Render backend base URL provided at build time via `VITE_API_URL`, e.g.:
 *   VITE_API_URL=https://<your-render-service>.onrender.com
 *
 * The localhost fallback exists only for local `vite dev`; production builds for
 * GitHub Pages always inject `VITE_API_URL`, so localhost never ships to production.
 */

const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Normalize by trimming a single trailing slash so joins produce clean URLs.
export const API_URL = rawApiUrl.replace(/\/+$/, '');

/**
 * Build an absolute REST/API URL from a path, always rooted at the backend base URL.
 * Never uses window.location.origin, so it is safe on GitHub Pages.
 *
 * Example: apiUrl('/api/server-info') -> `${API_URL}/api/server-info`
 */
export function apiUrl(path: string): string {
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
