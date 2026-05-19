import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search as SearchIcon, X } from 'lucide-react';
import { search as runSearch, KIND_LABELS, type SearchHit, type SearchKind } from '@/lib/search';
import { cn } from '@/lib/cn';

const KIND_FILTERS: Array<SearchKind | 'all'> = ['all', 'title', 'vocab', 'body', 'bible', 'dialog', 'grammar', 'pron', 'question'];

export default function SearchPage(): JSX.Element {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<SearchKind | 'all'>('all');
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      void runSearch(q, 60).then((res) => {
        setHits(res);
        setLoading(false);
      });
    }, 180);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q]);

  const filtered = useMemo(
    () => (filter === 'all' ? hits : hits.filter((h) => h.kind === filter)),
    [hits, filter],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-fg">검색</h1>

      <div className="relative">
        <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="한자 · 병음 · 한국어"
          aria-label="검색어 입력"
          className="w-full h-12 pl-10 pr-10 rounded-full border border-divider bg-surface text-fg text-base focus:outline-none focus:border-primary"
          autoFocus
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="검색어 지우기"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-full text-muted hover:bg-primary-soft"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 pb-1" role="tablist">
        {KIND_FILTERS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            aria-pressed={filter === k}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold border whitespace-nowrap',
              filter === k
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-muted border-divider',
            )}
          >
            {k === 'all' ? '전체' : KIND_LABELS[k]}
            {k !== 'all' && (
              <span className="ml-1 text-xs opacity-70">
                ({hits.filter((h) => h.kind === k).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <p className="text-muted text-sm">검색 중…</p>}

      {!loading && q && filtered.length === 0 && (
        <p className="text-muted text-sm">결과가 없습니다.</p>
      )}

      {!q && (
        <p className="text-muted text-sm">한자(예: 上帝), 병음(shen), 한국어(사랑)로 검색할 수 있습니다.</p>
      )}

      <ul className="divide-y divide-divider rounded-2xl bg-surface border border-divider overflow-hidden">
        {filtered.map((h) => (
          <li key={h.id}>
            <Link
              to={
                h.lessonId.startsWith('appendix')
                  ? `/appendix/${h.lessonId}`
                  : `/lesson/${h.lessonId}`
              }
              className="block px-4 py-3 active:bg-primary-soft/40"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-primary-soft text-primary font-semibold px-2 py-0.5">
                  {KIND_LABELS[h.kind]}
                </span>
                <span className="text-muted truncate">{h.lessonTitleKo} · {h.lessonTitleZh}</span>
              </div>
              <p className="text-fg text-lg font-medium mt-1 truncate">{h.snippet.zh}</p>
              {h.snippet.pinyin && (
                <p className="text-pinyin font-pinyin text-xs truncate">{h.snippet.pinyin}</p>
              )}
              {h.snippet.ko && (
                <p className="text-fg/80 text-sm truncate mt-0.5">{h.snippet.ko}</p>
              )}
              {'ref' in h.snippet && h.snippet.ref && (
                <p className="text-xs text-primary mt-0.5">{h.snippet.ref}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
