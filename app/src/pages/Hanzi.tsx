/**
 * 한자 인덱스 페이지.
 *   - 모든 레슨 vocab에서 한자(한 글자)를 추출하여 빈도 기준으로 정렬.
 *   - 각 한자 카드에는 그 한자가 들어간 단어 리스트와 출현 레슨이 표시됨.
 *   - 한자 검색(한자/음 입력), 정렬(빈도 / 가나다), TTS로 한 글자 발음 듣기.
 *
 * URL: /hanzi
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search as SearchIcon, Volume2, ArrowRight, X } from 'lucide-react';
import { loadAllLessons } from '@/data/loaders';
import type { Lesson, VocabEntry } from '@/types/lesson';
import { speak, unlock, isSupported as ttsSupported } from '@/lib/tts';
import { useSettings } from '@/stores/settings';
import { cn } from '@/lib/cn';

type HanziEntry = {
  char: string;
  count: number; // 등장 단어 수 (중복 단어는 1회)
  words: Array<{ vocab: VocabEntry; lessonId: string; lessonTitleKo: string }>;
};

// CJK Unified Ideographs (간/번체 핵심 범위) 정도만 한자로 인정
const HAN_RE = /^[一-鿿]$/;

function buildHanziIndex(lessons: Lesson[]): HanziEntry[] {
  const map = new Map<string, HanziEntry>();
  for (const l of lessons) {
    for (const v of l.vocab) {
      const seenInWord = new Set<string>();
      for (const ch of v.word) {
        if (!HAN_RE.test(ch)) continue;
        if (seenInWord.has(ch)) continue;
        seenInWord.add(ch);
        const cur = map.get(ch);
        const item = { vocab: v, lessonId: l.id, lessonTitleKo: l.titleKo };
        if (cur) {
          cur.count += 1;
          cur.words.push(item);
        } else {
          map.set(ch, { char: ch, count: 1, words: [item] });
        }
      }
    }
  }
  return Array.from(map.values());
}

/**
 * 빈도 티어 — 시각적 구분에만 사용.
 *   - high: 10+ — primary 배경 강조
 *   - mid : 4~9 — primary-soft 배경
 *   - low : 1~3 — surface 기본
 */
function tierOf(count: number): 'high' | 'mid' | 'low' {
  if (count >= 10) return 'high';
  if (count >= 4) return 'mid';
  return 'low';
}

/**
 * 그리드 컬럼 수를 화면 폭에 맞춰 반환한다.
 *   - Hanzi 카드 그리드는 grid-cols-4 / sm:grid-cols-6 / md:grid-cols-8.
 *   - 클릭한 카드가 속한 "행 끝" 인덱스를 계산해 그 위치에 detail 패널을 끼워 넣기 위해 필요.
 */
function useColsPerRow(): number {
  const get = (): number => {
    if (typeof window === 'undefined') return 4;
    if (window.innerWidth >= 768) return 8;
    if (window.innerWidth >= 640) return 6;
    return 4;
  };
  const [cols, setCols] = useState<number>(get);
  useEffect(() => {
    const onResize = (): void => setCols(get());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return cols;
}

export default function Hanzi(): JSX.Element {
  const [entries, setEntries] = useState<HanziEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'freq' | 'char'>('freq');
  const [activeChar, setActiveChar] = useState<string | null>(null);
  const colsPerRow = useColsPerRow();

  const ttsRate = useSettings((s) => s.ttsRate);
  const ttsVoiceURI = useSettings((s) => s.ttsVoiceURI);

  useEffect(() => {
    let alive = true;
    void loadAllLessons().then((lessons) => {
      if (!alive) return;
      setEntries(buildHanziIndex(lessons));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Esc로 활성 패널 닫기
  useEffect(() => {
    if (!activeChar) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setActiveChar(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeChar]);

  const filtered = useMemo(() => {
    const q = query.trim();
    let list = entries;
    if (q) {
      // 한자 직접 검색 또는 단어 안에서 검색 또는 병음/뜻 매칭
      const ql = q.toLowerCase();
      list = entries.filter((e) =>
        e.char === q
        || e.words.some((w) =>
          w.vocab.word.includes(q)
          || w.vocab.pinyin.toLowerCase().includes(ql)
          || w.vocab.meaning.toLowerCase().includes(ql),
        ),
      );
    }
    const sorted = list.slice();
    if (sort === 'freq') sorted.sort((a, b) => b.count - a.count || a.char.localeCompare(b.char));
    else sorted.sort((a, b) => a.char.localeCompare(b.char));
    return sorted;
  }, [entries, query, sort]);

  const speakChar = (ch: string): void => {
    if (!ttsSupported()) return;
    unlock();
    speak(ch, { rate: ttsRate, voiceURI: ttsVoiceURI ?? undefined });
  };

  const activeEntry = activeChar ? entries.find((e) => e.char === activeChar) : null;
  // 활성 한자가 속한 "행 끝" 인덱스 — 클릭한 카드의 행 다음에 detail 패널을 인라인 삽입할 위치
  const activeIdxInFiltered = activeEntry ? filtered.findIndex((e) => e.char === activeEntry.char) : -1;
  const inlineDetailAfterIdx = activeIdxInFiltered >= 0
    ? Math.min(filtered.length - 1, Math.floor(activeIdxInFiltered / colsPerRow) * colsPerRow + colsPerRow - 1)
    : -1;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold text-fg">한자 인덱스</h1>
        <span className="text-xs text-muted">
          {query.trim() ? `${filtered.length} / ${entries.length}자` : `${entries.length}자`}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="한자/단어/병음/뜻 검색"
            className="w-full rounded-xl border border-divider bg-bg text-fg pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="한자 검색"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-full text-muted hover:bg-primary-soft"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
        <div
          className="inline-flex rounded-xl border border-divider bg-bg p-0.5 self-stretch sm:self-auto"
          role="tablist"
          aria-label="정렬 방식"
        >
          <button
            type="button"
            onClick={() => setSort('freq')}
            aria-pressed={sort === 'freq'}
            className={cn(
              'flex-1 sm:flex-none rounded-lg px-3 py-1.5 text-sm font-semibold',
              sort === 'freq' ? 'bg-primary text-white' : 'text-muted',
            )}
          >
            빈도순
          </button>
          <button
            type="button"
            onClick={() => setSort('char')}
            aria-pressed={sort === 'char'}
            className={cn(
              'flex-1 sm:flex-none rounded-lg px-3 py-1.5 text-sm font-semibold',
              sort === 'char' ? 'bg-primary text-white' : 'text-muted',
            )}
          >
            한자순
          </button>
        </div>
      </div>

      {/* 빈도 범례 — 빈도순일 때만 표시 */}
      {!loading && sort === 'freq' && filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>빈도</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-primary" /> 10+
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-primary-soft border border-primary/40" /> 4–9
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-surface border border-divider" /> 1–3
          </span>
        </div>
      )}

      {loading && <p className="text-muted">불러오는 중…</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-muted text-sm">일치하는 한자가 없습니다.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {filtered.map((e, i) => {
            const t = tierOf(e.count);
            const isActive = activeChar === e.char;
            return (
              <Fragment key={e.char}>
                <button
                  type="button"
                  onClick={() => setActiveChar(isActive ? null : e.char)}
                  className={cn(
                    'relative rounded-xl border p-3 text-center transition active:scale-[0.97]',
                    t === 'high' && 'bg-primary text-white border-primary',
                    t === 'mid' && 'bg-primary-soft text-fg border-primary/40',
                    t === 'low' && 'bg-surface text-fg border-divider hover:border-primary',
                    isActive && 'ring-2 ring-primary ring-offset-1 ring-offset-bg',
                  )}
                  aria-label={`${e.char} 단어 ${e.count}개`}
                  aria-pressed={isActive}
                >
                  <p className="text-3xl font-bold leading-none">{e.char}</p>
                  <span
                    className={cn(
                      'absolute top-1 right-1 text-[10px] font-semibold tabular-nums leading-none px-1.5 py-0.5 rounded-full',
                      t === 'high' && 'bg-white/25 text-white',
                      t === 'mid' && 'bg-white/70 text-primary',
                      t === 'low' && 'bg-divider/60 text-muted',
                    )}
                  >
                    {e.count}
                  </span>
                </button>
                {i === inlineDetailAfterIdx && activeEntry && (
                  <HanziDetailPanel
                    entry={activeEntry}
                    onClose={() => setActiveChar(null)}
                    onSpeak={speakChar}
                    className="col-span-full"
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HanziDetailPanel({
  entry,
  onClose,
  onSpeak,
  className,
}: {
  entry: HanziEntry;
  onClose: () => void;
  onSpeak: (text: string) => void;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-2xl border border-primary bg-primary-soft p-4 sm:p-5 space-y-3',
        className,
      )}
      role="region"
      aria-label={`${entry.char} 상세`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-5xl font-bold text-fg">{entry.char}</p>
          <button
            type="button"
            onClick={() => onSpeak(entry.char)}
            aria-label="발음 듣기"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white"
          >
            <Volume2 size={16} aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 닫기"
          className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-divider text-fg"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="text-xs text-muted">등장 단어 {entry.words.length}개 · ESC로 닫기</p>
      <ul className="divide-y divide-divider/60 bg-bg rounded-xl border border-divider">
        {entry.words.map((w, i) => (
          <li key={`${w.vocab.id}-${i}`} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-fg font-semibold truncate">
                <span className="text-lg">{highlightChar(w.vocab.word, entry.char)}</span>
                <span className="text-pinyin font-pinyin text-xs ml-2">{w.vocab.pinyin}</span>
              </p>
              <p className="text-xs text-muted truncate">{w.vocab.meaning}</p>
              <p className="text-[10px] text-muted/80">{w.lessonTitleKo}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onSpeak(w.vocab.word)}
                aria-label={`${w.vocab.word} 발음`}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-divider bg-surface text-primary"
              >
                <Volume2 size={14} aria-hidden />
              </button>
              <Link
                to={`/lesson/${w.lessonId}`}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-divider bg-surface text-fg"
                aria-label="레슨으로 이동"
              >
                <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 단어 안에서 target 한자만 primary 색으로 강조. */
function highlightChar(word: string, target: string): JSX.Element {
  return (
    <>
      {Array.from(word).map((ch, i) =>
        ch === target ? (
          <span key={i} className="text-primary">{ch}</span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}
