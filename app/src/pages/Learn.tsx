/**
 * 통합 학습 페이지 (/learn).
 *   - 상단: 학습 통계 (collapsible)
 *   - 중단: 모드 탭 (플래시카드 / 문장 조립 / 4지선다 / 최소 대조쌍)
 *   - 하단: 선택된 모드의 콘텐츠 (Flashcards 또는 Quiz mode=...)
 *
 * URL ?mode=flashcard|sentence|mcq|pairs 로 초기 모드 결정 (북마크 호환).
 * 모드 전환 시 쿼리도 갱신되어 새로고침/공유에서 상태 보존.
 *
 * 라우팅: /flashcards, /quiz 는 이 페이지로 redirect (App.tsx 참조).
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Layers, ArrowLeftRight, ListChecks, Headphones } from 'lucide-react';
import Flashcards from './Flashcards';
import Quiz, { type QuizMode } from './Quiz';
import StatsPanel from '@/components/flashcards/StatsPanel';
import { cn } from '@/lib/cn';

type LearnMode = 'flashcard' | QuizMode; // 'flashcard' | 'sentence' | 'mcq' | 'pairs'

const VALID_MODES: readonly LearnMode[] = ['flashcard', 'sentence', 'mcq', 'pairs'] as const;
const isValidMode = (v: string | null): v is LearnMode =>
  v != null && (VALID_MODES as readonly string[]).includes(v);

export default function Learn(): JSX.Element {
  // URL을 단일 진실 소스로 사용 — mode/URL 양방향 useEffect를 두면
  // 두 effect가 같은 렌더에서 서로 다른 값으로 setState를 호출하며 핑퐁 루프가 생긴다.
  // derived state + setter 한 곳으로 통합해 그 가능성을 차단한다.
  const [params, setParams] = useSearchParams();
  const q = params.get('mode');
  const mode: LearnMode = isValidMode(q) ? q : 'flashcard';

  const setMode = useCallback((v: LearnMode): void => {
    const next = new URLSearchParams(params);
    next.set('mode', v);
    setParams(next, { replace: true });
  }, [params, setParams]);

  const tabs = useMemo(
    () =>
      [
        { v: 'flashcard' as const, label: '플래시카드', icon: <Layers size={14} aria-hidden /> },
        { v: 'sentence' as const, label: '문장 조립', icon: <ArrowLeftRight size={14} aria-hidden /> },
        { v: 'mcq' as const, label: '4지선다', icon: <ListChecks size={14} aria-hidden /> },
        { v: 'pairs' as const, label: '대조쌍', icon: <Headphones size={14} aria-hidden /> },
      ] satisfies ReadonlyArray<{ v: LearnMode; label: string; icon: JSX.Element }>,
    [],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-fg">학습</h1>

      {/* 학습 통계 (접기/펴기) — 모드 무관 공통 위젯 */}
      <details className="rounded-2xl border border-divider bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3 inline-flex items-center gap-2 text-sm font-semibold text-fg">
          <BarChart3 size={16} className="text-primary" aria-hidden /> 학습 통계
        </summary>
        <div className="px-4 pb-4">
          <StatsPanel />
        </div>
      </details>

      {/* 모드 탭 */}
      <div
        className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1"
        role="tablist"
        aria-label="학습 모드"
      >
        {tabs.map((t) => (
          <button
            key={t.v}
            type="button"
            role="tab"
            aria-selected={mode === t.v}
            onClick={() => setMode(t.v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold border whitespace-nowrap',
              mode === t.v
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-muted border-divider',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* 모드별 콘텐츠 — key로 모드 전환 시 내부 상태 리셋 */}
      <div role="tabpanel">
        {mode === 'flashcard' ? (
          <Flashcards key="flashcard" />
        ) : (
          <Quiz key={mode} mode={mode} />
        )}
      </div>
    </div>
  );
}
