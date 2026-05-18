import { NavLink } from 'react-router-dom';
import { Home, BookOpen, Search, Layers, Info } from 'lucide-react';
import { cn } from '@/lib/cn';

const items = [
  { to: '/', label: '홈', icon: Home, end: true },
  { to: '/toc', label: '목차', icon: BookOpen, end: false },
  { to: '/search', label: '검색', icon: Search, end: false },
  { to: '/flashcards', label: '플래시', icon: Layers, end: false },
  { to: '/about', label: '안내', icon: Info, end: false },
];

export default function BottomNav(): JSX.Element {
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
                  isActive ? 'text-primary font-semibold' : 'text-muted',
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
