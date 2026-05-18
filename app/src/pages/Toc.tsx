import { Link, useParams, NavLink } from 'react-router-dom';
import { Check, Circle } from 'lucide-react';
import { META } from '@/data/loaders';
import { useProgress } from '@/stores/progress';
import { cn } from '@/lib/cn';

const VOLS: Array<{ key: 1 | 2 | 3; label: string }> = [
  { key: 1, label: 'Vol.1' },
  { key: 2, label: 'Vol.2' },
  { key: 3, label: 'Vol.3' },
];

export default function Toc(): JSX.Element {
  const { vol: volParam } = useParams();
  const vol = (volParam ? Number(volParam) : 1) as 1 | 2 | 3;
  const byId = useProgress((s) => s.byId);
  const lessons = META.filter((m) => m.vol === vol);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-fg">목차</h1>

      <div className="flex gap-2" role="tablist" aria-label="권 선택">
        {VOLS.map((v) => (
          <NavLink
            key={v.key}
            to={`/toc/${v.key}`}
            role="tab"
            aria-selected={vol === v.key}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-semibold border',
              vol === v.key
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-fg border-divider',
            )}
          >
            {v.label}
            <span className="ml-1 text-xs opacity-80">
              ({META.filter((m) => m.vol === v.key).length})
            </span>
          </NavLink>
        ))}
      </div>

      <ul className="rounded-2xl bg-surface border border-divider overflow-hidden divide-y divide-divider">
        {lessons.map((l) => {
          const p = byId[l.id];
          const read = Boolean(p?.read);
          return (
            <li key={l.id}>
              <Link
                to={`/lesson/${l.id}`}
                className="flex items-center gap-3 px-4 py-3 active:bg-primary-soft/40"
              >
                <span className="w-8 text-xs text-muted shrink-0 tabular-nums">
                  {String(l.no).padStart(2, '0')}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-fg font-medium truncate">{l.titleKo}</span>
                  <span className="block text-sm text-muted truncate">
                    {l.titleZh} · {l.titlePinyin}
                  </span>
                </span>
                {read ? (
                  <Check size={20} className="text-success shrink-0" aria-label="학습 완료" />
                ) : (
                  <Circle size={20} className="text-divider shrink-0" aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
