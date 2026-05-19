/**
 * 한자 인덱스 페이지.
 *   - 모든 레슨 vocab에서 한자(한 글자)를 추출하여 빈도 기준으로 정렬.
 *   - 각 한자 카드에는 그 한자가 들어간 단어 리스트와 출현 레슨이 표시됨.
 *   - 한자 검색(한자/음 입력), 정렬(빈도 / 가나다), TTS로 한 글자 발음 듣기.
 *
 * URL: /hanzi
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search as SearchIcon, Volume2, SortAsc, ArrowRight } from 'lucide-react';
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

export default function Hanzi(): JSX.Element {
  const [entries, setEntries] = useState<HanziEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'freq' | 'char'>('freq');
  const [activeChar, setActiveChar] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold text-fg">한자 인덱스</h1>
        <span className="text-xs text-muted">{entries.length}자</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="한자/단어/병음/뜻 검색"
            className="w-full rounded-xl border border-divider bg-bg text-fg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="한자 검색"
          />
        </div>
        <button
          type="button"
          onClick={() => setSort((s) => (s === 'freq' ? 'char' : 'freq'))}
          className="inline-flex items-center gap-1 rounded-xl border border-divider bg-surface text-fg px-3 py-2 text-sm font-semibold"
          aria-label="정렬 전환"
        >
          <SortAsc size={14} aria-hidden />
          {sort === 'freq' ? '빈도순' : '한자순'}
        </button>
      </div>

      {loading && <p className="text-muted">불러오는 중…</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-muted text-sm">일치하는 한자가 없습니다.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {filtered.map((e) => (
            <button
              key={e.char}
              type="button"
              onClick={() => setActiveChar(e.char)}
              className={cn(
                'rounded-xl border bg-surface text-fg p-3 text-center transition active:scale-[0.97]',
                activeChar === e.char ? 'border-primary ring-2 ring-primary/30' : 'border-divider hover:border-primary',
              )}
              aria-label={`${e.char} ${e.count}개 단어`}
            >
              <p className="text-3xl font-bold">{e.char}</p>
              <p className="text-[10px] text-muted mt-0.5">{e.count}개</p>
            </button>
          ))}
        </div>
      )}

      {activeEntry && (
        <div className="rounded-2xl border border-primary bg-primary-soft p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <p className="text-5xl font-bold text-fg">{activeEntry.char}</p>
              <button
                type="button"
                onClick={() => speakChar(activeEntry.char)}
                aria-label="발음 듣기"
                className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white"
              >
                <Volume2 size={16} aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setActiveChar(null)}
              className="text-sm text-primary font-semibold"
            >
              닫기
            </button>
          </div>
          <p className="text-xs text-muted">등장 단어 {activeEntry.words.length}개</p>
          <ul className="divide-y divide-divider/60 bg-bg rounded-xl border border-divider">
            {activeEntry.words.map((w, i) => (
              <li key={`${w.vocab.id}-${i}`} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-fg font-semibold truncate">
                    <span className="text-lg">{w.vocab.word}</span>
                    <span className="text-pinyin font-pinyin text-xs ml-2">{w.vocab.pinyin}</span>
                  </p>
                  <p className="text-xs text-muted truncate">{w.vocab.meaning}</p>
                  <p className="text-[10px] text-muted/80">{w.lessonTitleKo}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => speakChar(w.vocab.word)}
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
      )}
    </div>
  );
}
