import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Files } from 'lucide-react';

export default function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <>
      <a href="#main-content" className="skip-link" onClick={(event) => {
        event.preventDefault();
        document.getElementById('main-content')?.focus();
      }}>Skip to content</a>
      <header className="app-header">
        <div className="shell-width header-inner">
          <Link to="/" className="brand" aria-label="DropFile home">
            <span className="brand-mark"><Files size={19} aria-hidden="true" /></span>
            DropFile
          </Link>
          {children || <span className="header-note">A little less friction. A little more flow.</span>}
        </div>
      </header>
    </>
  );
}
