/**
 * 플래시카드 학습 통계 패널.
 *   - 연속 학습일(streak), 누적 학습수, 정확도
 *   - 12주 캘린더 히트맵
 *   - 박스별 카드 분포 막대
 *   - 최근 7일 라인
 *
 * Flashcards.tsx 안에서 collapsible <details> 형태로 임베드.
 */
import { useMemo, useState } from 'react';
import { Flame, TrendingUp, Boxes, Share2, Check } from 'lucide-react';
import { useSRS } from '@/stores/srs';
import {
  computeStreak, computeHeatmap, computeBoxDistribution, totalReviews, lastNDays,
} from '@/lib/srs-stats';
import { cn } from '@/lib/cn';

export default function StatsPanel(): JSX.Element {
  const cards = useSRS((s) => s.cards);
  const reviewsByDate = useSRS((s) => s.reviewsByDate);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const streak = useMemo(() => computeStreak(reviewsByDate), [reviewsByDate]);
  const heatmap = useMemo(() => computeHeatmap(reviewsByDate, 12), [reviewsByDate]);
  const dist = useMemo(() => computeBoxDistribution(cards), [cards]);
  const total = useMemo(() => totalReviews(reviewsByDate), [reviewsByDate]);
  const last7 = useMemo(() => lastNDays(reviewsByDate, 7), [reviewsByDate]);
  const accuracy = total.reviewed > 0 ? Math.round((total.correct / total.reviewed) * 100) : 0;
  const last7Max = Math.max(1, ...last7.map((d) => d.reviewed));

  const onShare = async (): Promise<void> => {
    const today = reviewsByDate[isoToday()] ?? { reviewed: 0, correct: 0 };
    const text =
      `SMCB 圣经学习\n` +
      `오늘 ${today.reviewed}장 복습 · 연속 ${streak}일 🔥\n` +
      `누적 ${total.reviewed}회 · 정확도 ${accuracy}%\n` +
      `Box 5(완성) ${dist.byBox[5]}장 / 전체 ${dist.total}장`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'SMCB 학습 진도', text });
        setShareNote('공유됨');
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setShareNote('클립보드에 복사됨');
      } else {
        setShareNote('이 기기는 공유를 지원하지 않습니다');
      }
    } catch {
      setShareNote('공유 취소됨');
    }
    window.setTimeout(() => setShareNote(null), 2000);
  };

  return (
    <div className="rounded-2xl border border-divider bg-surface p-4 space-y-4">
      <div className="flex items-center justify-end gap-2 -mb-1">
        <button
          type="button"
          onClick={onShare}
          className="inline-flex items-center gap-1 rounded-full border border-divider bg-bg text-primary text-xs font-semibold px-3 py-1.5"
          aria-label="진도 공유"
        >
          {shareNote ? <Check size={12} aria-hidden /> : <Share2 size={12} aria-hidden />}
          {shareNote ?? '공유'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile
          icon={<Flame size={16} className="text-accent" aria-hidden />}
          label="연속 학습"
          value={`${streak}일`}
        />
        <StatTile
          icon={<TrendingUp size={16} className="text-success" aria-hidden />}
          label="정확도"
          value={total.reviewed === 0 ? '—' : `${accuracy}%`}
          sub={`${total.reviewed}회`}
        />
        <StatTile
          icon={<Boxes size={16} className="text-primary" aria-hidden />}
          label="카드"
          value={`${dist.total - dist.newCount}/${dist.total}`}
          sub={`새 ${dist.newCount}`}
        />
      </div>

      <div>
        <p className="text-xs text-muted mb-2">최근 12주</p>
        <Heatmap grid={heatmap} />
      </div>

      <div>
        <p className="text-xs text-muted mb-2">박스 분포</p>
        <BoxBars dist={dist} />
      </div>

      <div>
        <p className="text-xs text-muted mb-2">최근 7일</p>
        <div className="flex items-end gap-1 h-16">
          {last7.map((d, i) => {
            const ratio = d.reviewed / last7Max;
            const h = Math.max(2, Math.round(ratio * 56));
            const day = new Date(d.date).getDay();
            const labels = ['일', '월', '화', '수', '목', '금', '토'];
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.date}: ${d.reviewed}회`}>
                <div
                  className={cn(
                    'w-full rounded-t',
                    d.reviewed === 0 ? 'bg-divider' : 'bg-primary',
                  )}
                  style={{ height: `${h}px` }}
                  aria-label={`${d.date} ${d.reviewed}회`}
                />
                <span className="text-[10px] text-muted">{labels[day]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function StatTile({
  icon, label, value, sub,
}: { icon: JSX.Element; label: string; value: string; sub?: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-divider bg-bg px-3 py-2.5 text-center">
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted">
        {icon}<span>{label}</span>
      </div>
      <p className="text-base font-bold text-fg mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

function Heatmap({ grid }: { grid: import('@/lib/srs-stats').HeatmapCell[][] }): JSX.Element {
  // grid[week][day(0=일~6=토)]
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="inline-grid grid-flow-col grid-rows-7 gap-[2px]">
        {grid.flatMap((week, wi) =>
          week.map((cell, di) => (
            <div
              key={`${wi}-${di}`}
              title={`${cell.date}: ${cell.count}회`}
              className={cn(
                'w-3 h-3 rounded-[2px]',
                cell.level === 0 && 'bg-divider/60',
                cell.level === 1 && 'bg-success/25',
                cell.level === 2 && 'bg-success/50',
                cell.level === 3 && 'bg-success/75',
                cell.level === 4 && 'bg-success',
              )}
              aria-label={`${cell.date} ${cell.count}회`}
            />
          )),
        )}
      </div>
    </div>
  );
}

function BoxBars({ dist }: { dist: import('@/lib/srs-stats').BoxDistribution }): JSX.Element {
  const max = Math.max(1, dist.newCount, ...Object.values(dist.byBox));
  const rows: Array<{ label: string; n: number; color: string }> = [
    { label: '신규', n: dist.newCount, color: 'bg-muted/60' },
    { label: 'Box 1', n: dist.byBox[1], color: 'bg-accent' },
    { label: 'Box 2', n: dist.byBox[2], color: 'bg-accent/70' },
    { label: 'Box 3', n: dist.byBox[3], color: 'bg-primary' },
    { label: 'Box 4', n: dist.byBox[4], color: 'bg-success/75' },
    { label: 'Box 5', n: dist.byBox[5], color: 'bg-success' },
  ];
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[3rem_1fr_2rem] items-center gap-2">
          <span className="text-[11px] text-muted">{r.label}</span>
          <div className="h-2 rounded-full bg-divider/60 overflow-hidden">
            <div
              className={cn('h-full transition-all', r.color)}
              style={{ width: `${(r.n / max) * 100}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold text-fg text-right">{r.n}</span>
        </div>
      ))}
    </div>
  );
}
