import { Link, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon, Search as SearchIcon } from 'lucide-react';

export default function Header(): JSX.Element {
  const loc = useLocation();
  const onHome = loc.pathname === '/';
  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-saturate-150 border-b border-divider pt-safe">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-fg text-lg" aria-label="홈으로">
          <span className="inline-block w-7 h-7 rounded-md bg-primary text-white text-[11px] font-bold leading-7 text-center">SMCB</span>
          <span className="hidden sm:inline">새문안 중국어 성경반</span>
          <span className="sm:hidden">SMCB</span>
        </Link>
        <nav className="flex items-center gap-1">
          {!onHome && (
            <Link
              to="/search"
              aria-label="검색"
              className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-primary-soft text-fg"
            >
              <SearchIcon size={20} aria-hidden />
            </Link>
          )}
          <Link
            to="/settings"
            aria-label="설정"
            className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-primary-soft text-fg"
          >
            <SettingsIcon size={20} aria-hidden />
          </Link>
        </nav>
      </div>
    </header>
  );
}
