import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, RotateCcw, Star } from 'lucide-react';
import type { VocabEntry } from '@/types/lesson';
import { loadAllLessons } from '@/data/loaders';
import { useSRS, BOX_DAYS } from '@/stores/srs';
import { useFavorites } from '@/stores/favorites';
import TTSButton from '@/components/TTSButton';
import { cn } from '@/lib/cn';

type Deck = 'due' | 'all' | 'favorites';

type CardItem = { vocab: VocabEntry; lessonId: string; lessonTitleKo: string };

export default function Flashcards(): JSX.Element {
  const [items, setItems] = useState<CardItem[]>([]);
  const [deck, setDeck] = useState<Deck>('due');
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0 });

  const cards = useSRS((s) => s.cards);
  const ensure = useSRS((s) => s.ensure);
  const grade = useSRS((s) => s.grade);
  const favItems = useFavorites((s) => s.items);

  useEffect(() => {
    let alive = true;
    loadAllLessons().then((lessons) => {
      if (!alive) return;
      const out: CardItem[] = [];
      for (const l of lessons) {
        for (const v of l.vocab) {
          out.push({ vocab: v, lessonId: l.id, lessonTitleKo: l.titleKo });
        }
      }
      setItems(out);
      ensure(out.map((x) => x.vocab.id));
    });
    return () => { alive = false; };
  }, [ensure]);

  const filtered = useMemo(() => {
    if (items.length === 0) return [];
    const now = Date.now();
    if (deck === 'all') return items;
    if (deck === 'favorites') {
      return items.filter((x) => favItems[`${x.lessonId}::vocab::${x.vocab.id}`]);
    }
    // due
    return items.filter((x) => {
      const c = cards[x.vocab.id];
      if (!c) return true;
      return new Date(c.due).getTime() <= now;
    });
  }, [items, deck, cards, favItems]);

  useEffect(() => {
    setCursor(0);
    setRevealed(false);
    setSessionStats({ correct: 0, wrong: 0 });
  }, [deck]);

  const current = filtered[cursor];

  const dueCount = items.filter((x) => {
    const c = cards[x.vocab.id];
    return !c || new Date(c.due).getTime() <= Date.now();
  }).length;
  const favCount = items.filter((x) => favItems[`${x.lessonId}::vocab::${x.vocab.id}`]).length;

  const onGrade = (correct: boolean): void => {
    if (!current) return;
    grade(current.vocab.id, correct);
    setSessionStats((s) => ({
      correct: s.correct + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
    }));
    setRevealed(false);
    setCursor((c) => c + 1);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-fg">플래시카드</h1>

      <div className="flex gap-2" role="tablist">
        <DeckChip on={deck === 'due'} onClick={() => setDeck('due')} label="복습 대상" badge={dueCount} />
        <DeckChip on={deck === 'favorites'} onClick={() => setDeck('favorites')} label="즐겨찾기" badge={favCount} />
        <DeckChip on={deck === 'all'} onClick={() => setDeck('all')} label="전체" badge={items.length} />
      </div>

      <p className="text-sm text-muted">
        세션 진행: <span className="text-success font-semibold">{sessionStats.correct}</span>
        <span className="mx-1">·</span>
        <span className="text-accent font-semibold">{sessionStats.wrong}</span>
        <span className="text-muted"> ({cursor}/{filtered.length})</span>
      </p>

      {items.length === 0 && <p className="text-muted">불러오는 중…</p>}

      {items.length > 0 && filtered.length === 0 && (
        <div className="rounded-2xl border border-divider bg-surface p-6 text-center">
          <p className="text-fg font-semibold">표시할 카드가 없습니다.</p>
          <p className="text-muted text-sm mt-1">
            {deck === 'due' && '오늘 복습할 카드가 없어요. 잘하고 있습니다!'}
            {deck === 'favorites' && '아직 즐겨찾기한 단어가 없습니다.'}
          </p>
        </div>
      )}

      {current && (
        <div className="rounded-2xl border border-divider bg-surface p-6 sm:p-8 text-center select-none">
          <p className="text-xs text-muted uppercase tracking-wider">
            <Link to={`/lesson/${current.lessonId}`} className="hover:text-primary underline">
              {current.lessonTitleKo}
            </Link>
            {' · '}
            Box {cards[current.vocab.id]?.box ?? 1} · {BOX_DAYS[cards[current.vocab.id]?.box ?? 1]}일
          </p>

          <div className="mt-6">
            <div className="flex items-center justify-center gap-2">
              <p className="text-5xl sm:text-6xl font-bold text-fg">{current.vocab.word}</p>
              <TTSButton text={current.vocab.word} />
            </div>
            {revealed && (
              <>
                <p className="text-pinyin font-pinyin text-base mt-3">{current.vocab.pinyin}</p>
                <p className="text-xs text-muted">{current.vocab.pos}</p>
                <p className="text-fg text-xl mt-4 font-medium">{current.vocab.meaning}</p>
                {current.vocab.hanjaNote && (
                  <p className="text-xs text-muted mt-2">{current.vocab.hanjaNote}</p>
                )}
              </>
            )}
          </div>

          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-6 py-3"
            >
              뜻 보기
            </button>
          ) : (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => onGrade(false)}
                className="inline-flex items-center gap-2 rounded-full bg-surface border border-accent text-accent font-semibold px-5 py-3"
                aria-label="모름"
              >
                <X size={18} aria-hidden /> 모름
              </button>
              <button
                type="button"
                onClick={() => onGrade(true)}
                className="inline-flex items-center gap-2 rounded-full bg-success text-white font-semibold px-5 py-3"
                aria-label="알아요"
              >
                <Check size={18} aria-hidden /> 알아요
              </button>
            </div>
          )}
        </div>
      )}

      {cursor >= filtered.length && filtered.length > 0 && (
        <div className="rounded-2xl border border-divider bg-surface p-6 text-center">
          <p className="text-fg font-semibold">세션 완료!</p>
          <p className="text-muted text-sm mt-1">
            정답 {sessionStats.correct} · 오답 {sessionStats.wrong}
          </p>
          <button
            type="button"
            onClick={() => { setCursor(0); setRevealed(false); setSessionStats({ correct: 0, wrong: 0 }); }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-5 py-2.5"
          >
            <RotateCcw size={16} aria-hidden /> 다시 시작
          </button>
        </div>
      )}
    </div>
  );
}

function DeckChip({ on, onClick, label, badge }: { on: boolean; onClick: () => void; label: string; badge: number }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold border whitespace-nowrap',
        on ? 'bg-primary text-white border-primary' : 'bg-surface text-muted border-divider',
      )}
    >
      {label === '즐겨찾기' && <Star size={14} aria-hidden />}
      {label}
      <span className="text-xs opacity-80">({badge})</span>
    </button>
  );
}
