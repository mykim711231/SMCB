import { Link, useParams, NavLink } from 'react-router-dom';
import { Check, Circle } from 'lucide-react';
import { META } from '@/data/loaders';
import { useProgress } from '@/stores/progress';
import { cn } from '@/lib/cn';

const VOLS: Array<{ key: 1 | 2 | 3; label: string }> = [
  { key: 1, label: '1권' },
  { key: 2, label: '2권' },
  { key: 3, label: '3권' },
];

function volRange(vol: 1 | 2 | 3): string {
  const list = META.filter((m) => m.vol === vol).map((m) => m.no);
  if (list.length === 0) return '';
  const min = Math.min(...list);
  const max = Math.max(...list);
  return `${min}~${max}과`;
}

export default function Toc(): JSX.Element {
  const { vol: volParam } = useParams();
  const vol = (volParam ? Number(volParam) : 1) as 1 | 2 | 3;
  const byId = useProgress((s) => s.byId);
  const lessons = META.filter((m) => m.vol === vol);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-fg">목차</h1>

      <div className="flex gap-2 flex-wrap" role="tablist" aria-label="권 선택">
        {VOLS.map((v) => {
          const count = META.filter((m) => m.vol === v.key).length;
          return (
            <NavLink
              key={v.key}
              to={`/toc/${v.key}`}
              role="tab"
              aria-selected={vol === v.key}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold border inline-flex flex-col items-center leading-tight',
                vol === v.key
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-fg border-divider',
              )}
            >
              <span>{v.label}</span>
              <span className={cn('text-[10px] mt-0.5', vol === v.key ? 'text-white/80' : 'text-muted')}>
                {volRange(v.key)} · {count}과
              </span>
            </NavLink>
          );
        })}
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
                <span className="w-16 text-xs text-muted shrink-0 tabular-nums">
                  {l.vol}권.{String(l.no).padStart(2, '0')}과.
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
