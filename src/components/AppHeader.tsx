import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Files, Wifi } from 'lucide-react';
import { LAN_MODE } from '@/lib/config';
import { SettingsButton } from './SettingsModal';

export default function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <>
      <a href="#main-content" className="skip-link" onClick={(event) => {
        event.preventDefault();
        document.getElementById('main-content')?.focus();
      }}>Skip to content</a>
      <header className="app-header">
        <div className="shell-width header-inner">
          <div className="brand-group">
            <Link to="/" className="brand" aria-label="DropFile home">
              <span className="brand-mark"><Files size={19} aria-hidden="true" /></span>
              DropFile
            </Link>
            {LAN_MODE && (
              <span className="lan-pill" title="Running on this local network. No internet needed.">
                <Wifi size={12} aria-hidden="true" />Local network
              </span>
            )}
          </div>
          <div className="header-end">
            {children || <span className="header-note">A little less friction. A little more flow.</span>}
            <SettingsButton />
          </div>
        </div>
      </header>
    </>
  );
}
