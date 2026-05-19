import { NavLink, useLocation } from 'react-router-dom';
import { Home, BookOpen, Search, GraduationCap, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

const items = [
  { to: '/', label: '홈', icon: Home, end: true },
  { to: '/toc', label: '목차', icon: BookOpen, end: false },
  { to: '/search', label: '검색', icon: Search, end: false },
  { to: '/learn', label: '학습', icon: GraduationCap, end: false },
  { to: '/settings', label: '설정', icon: SettingsIcon, end: false },
];

export default function BottomNav(): JSX.Element {
  const loc = useLocation();
  // 구 경로(/flashcards, /quiz)에서도 '학습' 탭 활성화 표시 (redirect 직전 한 프레임 깜빡임 방지)
  const onLegacyLearn = loc.pathname === '/flashcards' || loc.pathname === '/quiz';
  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-divider pb-safe"
    >
      <ul className="mx-auto max-w-3xl grid grid-cols-5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] text-xs',
                  (isActive || (to === '/learn' && onLegacyLearn))
                    ? 'text-primary font-semibold'
                    : 'text-muted',
                )
              }
            >
              <Icon size={20} aria-hidden />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
