import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Search as SearchIcon, HelpCircle, ChevronLeft } from 'lucide-react';

export default function Header(): JSX.Element {
  const loc = useLocation();
  const navigate = useNavigate();
  const onHome = loc.pathname === '/';

  const handleBack = (): void => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-saturate-150 border-b border-divider pt-safe">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          {!onHome && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="뒤로 가기"
              className="w-11 h-11 -ml-2 inline-flex items-center justify-center rounded-lg hover:bg-primary-soft text-fg"
            >
              <ChevronLeft size={24} aria-hidden />
            </button>
          )}
          <Link to="/" className="flex items-center gap-2 font-bold text-fg text-lg min-w-0" aria-label="홈으로">
            <span className="inline-block w-7 h-7 rounded-md bg-primary text-white text-[11px] font-bold leading-7 text-center flex-none">SMCB</span>
            <span className="hidden sm:inline truncate">새문안 중국어 성경반</span>
            <span className="sm:hidden">SMCB</span>
          </Link>
        </div>
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
            to="/help"
            aria-label="도움말"
            className="w-11 h-11 inline-flex items-center justify-center rounded-lg hover:bg-primary-soft text-fg"
          >
            <HelpCircle size={20} aria-hidden />
          </Link>
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
