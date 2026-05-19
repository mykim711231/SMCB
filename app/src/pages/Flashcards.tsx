import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, X, RotateCcw, Star, ArrowLeftRight, BookOpen, MessageSquareText, Layers, AlertTriangle, Headphones, ChevronDown,
} from 'lucide-react';
import { loadAllLessons, META } from '@/data/loaders';
import type { VocabEntry } from '@/types/lesson';
import { useSRS, BOX_DAYS, type SRSGrade } from '@/stores/srs';
import { useFavorites } from '@/stores/favorites';
import { useSettings, type FlashcardDirection } from '@/stores/settings';
import { useLearnScope } from '@/stores/learnScope';
import TTSButton from '@/components/TTSButton';
import { speak, unlock, isSupported as ttsSupported } from '@/lib/tts';
import {
  type CardSource, buildAllCardSources, cardIdOf, favKeyOf, speakTextOf,
} from '@/lib/flashcard-items';
import MarathonPlayer from '@/components/flashcards/MarathonPlayer';
import { pickMistakeCards } from '@/lib/srs-stats';
import { cn } from '@/lib/cn';

type Deck = 'due' | 'all' | 'favorites' | 'lapses' | 'mistakes';

export default function Flashcards(): JSX.Element {
  const [sources, setSources] = useState<CardSource[]>([]);
  const [deck, setDeck] = useState<Deck>('due');
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0 });
  const [lapses, setLapses] = useState<CardSource[]>([]);
  const [inLapses, setInLapses] = useState(false);
  // session-local card type overrides (initialized from settings on mount)
  const [typeFilter, setTypeFilter] = useState({ vocab: true, example: true, verse: true });
  // session-local direction (overrides settings within the page)
  const [direction, setDirection] = useState<FlashcardDirection>('zh2ko');
  // 레슨 필터 (빈 Set = 전체, 그 외 = 선택된 lessonId만 표시) — Quiz와 공유
  const lessonSel = useLearnScope((s) => s.lessonSel);
  const setLessonSel = useLearnScope((s) => s.setLessonSel);
  // 마라톤 모드 활성 여부 (설정 fcAudioMarathon이 켜져 있어야 시작 가능)
  const [marathonOn, setMarathonOn] = useState(false);

  const cards = useSRS((s) => s.cards);
  const ensure = useSRS((s) => s.ensure);
  const grade = useSRS((s) => s.grade);
  const favItems = useFavorites((s) => s.items);

  const fcAlgorithm = useSettings((s) => s.fcAlgorithm);
  const fcGrades = useSettings((s) => s.fcGrades);
  const fcDirectionSetting = useSettings((s) => s.fcDirection);
  const fcAutoplay = useSettings((s) => s.fcAutoplay);
  const fcCardTypes = useSettings((s) => s.fcCardTypes);
  const fcAudioMarathon = useSettings((s) => s.fcAudioMarathon);
  const ttsRate = useSettings((s) => s.ttsRate);
  const ttsVoiceURI = useSettings((s) => s.ttsVoiceURI);

  // initial sync of session-local toggles from settings
  useEffect(() => {
    setTypeFilter(fcCardTypes);
    setDirection(fcDirectionSetting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load lessons + ensure SRS records exist
  useEffect(() => {
    let alive = true;
    void loadAllLessons().then((lessons) => {
      if (!alive) return;
      const out = buildAllCardSources(lessons);
      setSources(out);
      ensure(out.map(cardIdOf));
    });
    return () => { alive = false; };
  }, [ensure]);

  // apply card-type + lesson filter
  const typeFiltered = useMemo(
    () => sources.filter((s) => typeFilter[s.kind] && (lessonSel.size === 0 || lessonSel.has(s.lessonId))),
    [sources, typeFilter, lessonSel],
  );

  // 전체 레슨 목록 (드롭다운용) — 권별 그룹 + "01과. 제목" 라벨
  const lessonGroups = useMemo(() => {
    const seen = new Set<string>();
    for (const s of sources) seen.add(s.lessonId);
    const metaById = new Map(META.map((m) => [m.id, m]));
    const byVol: Record<1 | 2 | 3, Array<{ id: string; no: number; label: string }>> = { 1: [], 2: [], 3: [] };
    for (const id of seen) {
      const m = metaById.get(id);
      if (!m) continue;
      const vol = m.vol as 1 | 2 | 3;
      byVol[vol].push({ id, no: m.no, label: `${String(m.no).padStart(2, '0')}과. ${m.titleKo}` });
    }
    for (const k of [1, 2, 3] as const) byVol[k].sort((a, b) => a.no - b.no);
    return byVol;
  }, [sources]);

  // 오답노트 카드 ID 셋
  const mistakeIds = useMemo(() => {
    const ids = new Set(pickMistakeCards(cards).map((c) => c.id));
    return ids;
  }, [cards]);

  // current "playable" deck
  const filtered = useMemo<CardSource[]>(() => {
    if (inLapses) return lapses;
    if (typeFiltered.length === 0) return [];
    if (deck === 'all') return typeFiltered;
    if (deck === 'favorites') return typeFiltered.filter((s) => favItems[favKeyOf(s)]);
    if (deck === 'lapses') return lapses; // also available as a deck after session
    if (deck === 'mistakes') return typeFiltered.filter((s) => mistakeIds.has(cardIdOf(s)));
    // due
    const now = Date.now();
    const out: CardSource[] = [];
    for (const s of typeFiltered) {
      const c = cards[cardIdOf(s)];
      const due = !c || new Date(c.due).getTime() <= now;
      if (!due) continue;
      out.push(s);
    }
    return out;
  }, [inLapses, lapses, typeFiltered, deck, favItems, cards, mistakeIds]);

  // reset session when deck or filter changes
  useEffect(() => {
    setCursor(0);
    setRevealed(false);
    setLapses([]);
    setInLapses(false);
    setSessionStats({ correct: 0, wrong: 0 });
  }, [deck, typeFilter, lessonSel]);

  const current = filtered[cursor];

  // per-card effective direction (stable per cursor when mixed)
  const effectiveDirection = useMemo<'zh2ko' | 'ko2zh'>(() => {
    if (direction === 'mixed') {
      // deterministic by cursor + first char of id so it doesn't flicker
      const id = current ? cardIdOf(current) : 'x';
      const sum = (id.charCodeAt(0) + cursor) % 2;
      return sum === 0 ? 'zh2ko' : 'ko2zh';
    }
    return direction;
  }, [direction, current, cursor]);

  // autoplay TTS when a new card appears
  useEffect(() => {
    if (!current || !fcAutoplay || !ttsSupported()) return;
    // ko→zh: 사용자가 한국어 보고 떠올려야 하므로 reveal 후에만 재생
    if (effectiveDirection === 'ko2zh' && !revealed) return;
    const text = speakTextOf(current);
    if (!text) return;
    const t = window.setTimeout(() => {
      speak(text, { rate: ttsRate, voiceURI: ttsVoiceURI ?? undefined });
    }, 250);
    return () => window.clearTimeout(t);
  }, [current, effectiveDirection, revealed, fcAutoplay, ttsRate, ttsVoiceURI]);

  const dueCount = useMemo(() => {
    const now = Date.now();
    return typeFiltered.filter((s) => {
      const c = cards[cardIdOf(s)];
      return !c || new Date(c.due).getTime() <= now;
    }).length;
  }, [typeFiltered, cards]);

  const favCount = useMemo(
    () => typeFiltered.filter((s) => favItems[favKeyOf(s)]).length,
    [typeFiltered, favItems],
  );

  const advance = useCallback(() => {
    setRevealed(false);
    setCursor((c) => c + 1);
  }, []);

  const onGrade = useCallback((g: SRSGrade): void => {
    if (!current) return;
    // iOS gesture 보호: grade는 사용자 직접 입력(버튼 또는 키보드)이므로 gesture
    // 컨텍스트 안이다. unlock()을 여기서 한 번 호출해두지 않으면, 250ms 후 advance
    // 효과의 autoplay speak() 시점엔 이미 gesture window가 닫혀 있어 iOS PWA에서
    // silent fail. (F2: Flashcards autoplay 첫 단발 무음 회귀 방지)
    unlock();
    grade(cardIdOf(current), g, fcAlgorithm);
    const correct = g !== 'again';
    setSessionStats((s) => ({
      correct: s.correct + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
    }));
    // lapses: again/hard → 같은 세션 끝에 1회 재투입 (중복 방지)
    if ((g === 'again' || g === 'hard') && !inLapses) {
      setLapses((prev) => {
        const id = cardIdOf(current);
        if (prev.some((p) => cardIdOf(p) === id)) return prev;
        return [...prev, current];
      });
    }
    advance();
  }, [current, grade, fcAlgorithm, inLapses, advance]);

  const replayTTS = useCallback(() => {
    if (!current) return;
    // 'r' 키/버튼은 사용자 gesture. iOS 첫 진입에서 reveal 전에 r 키만 누른
    // 시나리오를 커버.
    unlock();
    const text = speakTextOf(current);
    if (text) speak(text, { rate: ttsRate, voiceURI: ttsVoiceURI ?? undefined });
  }, [current, ttsRate, ttsVoiceURI]);

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!current) return;
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        else onGrade('good');
        return;
      }
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); replayTTS(); return; }
      if (!revealed) return;
      if (fcGrades === 2) {
        if (e.key === '1') { e.preventDefault(); onGrade('again'); }
        else if (e.key === '2') { e.preventDefault(); onGrade('good'); }
      } else {
        if (e.key === '1') { e.preventDefault(); onGrade('again'); }
        else if (e.key === '2') { e.preventDefault(); onGrade('hard'); }
        else if (e.key === '3') { e.preventDefault(); onGrade('good'); }
        else if (e.key === '4') { e.preventDefault(); onGrade('easy'); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, revealed, onGrade, replayTTS, fcGrades]);

  const sessionEnded = filtered.length > 0 && cursor >= filtered.length;

  const startLapses = (): void => {
    if (lapses.length === 0) return;
    setInLapses(true);
    setCursor(0);
    setRevealed(false);
    setSessionStats({ correct: 0, wrong: 0 });
  };

  const restart = (): void => {
    setCursor(0);
    setRevealed(false);
    setSessionStats({ correct: 0, wrong: 0 });
    setInLapses(false);
    setLapses([]);
  };

  return (
    <div className="space-y-4">
      {/* 덱 선택 */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1" role="tablist" aria-label="덱 선택">
        <DeckChip on={deck === 'due' && !inLapses} onClick={() => { setInLapses(false); setDeck('due'); }} label="복습 대상" badge={dueCount} />
        <DeckChip on={deck === 'favorites' && !inLapses} onClick={() => { setInLapses(false); setDeck('favorites'); }} label="즐겨찾기" badge={favCount} icon={<Star size={14} aria-hidden />} />
        <DeckChip on={deck === 'mistakes' && !inLapses} onClick={() => { setInLapses(false); setDeck('mistakes'); }} label="오답노트" badge={mistakeIds.size} icon={<AlertTriangle size={14} aria-hidden />} />
        <DeckChip on={inLapses} onClick={startLapses} label="오답 재투입" badge={lapses.length} disabled={lapses.length === 0} />
        <DeckChip on={deck === 'all' && !inLapses} onClick={() => { setInLapses(false); setDeck('all'); }} label="전체" badge={typeFiltered.length} />
      </div>

      {/* 레슨 필터 (권별 그룹 + 멀티 선택) */}
      <LessonMultiFilter groups={lessonGroups} selected={lessonSel} onChange={setLessonSel} />

      {/* 카드 종류 / 방향 토글 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <TypeChip
          on={typeFilter.vocab} onClick={() => setTypeFilter((t) => ({ ...t, vocab: !t.vocab }))}
          label="단어" icon={<BookOpen size={12} aria-hidden />}
        />
        <TypeChip
          on={typeFilter.example} onClick={() => setTypeFilter((t) => ({ ...t, example: !t.example }))}
          label="예문" icon={<MessageSquareText size={12} aria-hidden />}
        />
        <TypeChip
          on={typeFilter.verse} onClick={() => setTypeFilter((t) => ({ ...t, verse: !t.verse }))}
          label="구절" icon={<Layers size={12} aria-hidden />}
        />
        <span className="mx-1 text-divider">|</span>
        <button
          type="button"
          onClick={() => {
            const next: FlashcardDirection = direction === 'zh2ko' ? 'ko2zh' : direction === 'ko2zh' ? 'mixed' : 'zh2ko';
            setDirection(next);
          }}
          className="inline-flex items-center gap-1 rounded-full border border-divider bg-surface text-fg px-3 py-1 font-semibold"
          aria-label="방향 전환"
        >
          <ArrowLeftRight size={12} aria-hidden />
          {direction === 'zh2ko' ? '中→韓' : direction === 'ko2zh' ? '韓→中' : '혼합'}
        </button>
        {fcAudioMarathon && !marathonOn && filtered.length > 0 && (
          <button
            type="button"
            onClick={() => { unlock(); setMarathonOn(true); }}
            className="inline-flex items-center gap-1 rounded-full bg-primary-soft text-primary border border-primary/30 px-3 py-1 font-semibold"
            aria-label="오디오 마라톤 시작"
            title="현재 덱을 순서대로 들으며 듣기 집중 모드 시작"
          >
            <Headphones size={12} aria-hidden /> 마라톤
          </button>
        )}
      </div>

      <p className="text-sm text-muted">
        세션 진행: <span className="text-success font-semibold">{sessionStats.correct}</span>
        <span className="mx-1">·</span>
        <span className="text-accent font-semibold">{sessionStats.wrong}</span>
        <span className="text-muted"> ({Math.min(cursor, filtered.length)}/{filtered.length})</span>
        {inLapses && <span className="ml-2 text-accent">(오답 재투입 중)</span>}
      </p>

      {sources.length === 0 && <p className="text-muted">불러오는 중…</p>}

      {sources.length > 0 && filtered.length === 0 && !sessionEnded && !marathonOn && (
        <EmptyState deck={deck} onStartLapses={startLapses} hasLapses={lapses.length > 0} />
      )}

      {marathonOn && (
        <MarathonPlayer
          cards={filtered}
          ttsRate={ttsRate}
          ttsVoiceURI={ttsVoiceURI}
          onExit={() => setMarathonOn(false)}
        />
      )}

      {!marathonOn && current && !sessionEnded && (
        <CardView
          source={current}
          revealed={revealed}
          direction={effectiveDirection}
          srsBox={cards[cardIdOf(current)]?.box ?? 1}
          intervalDays={cards[cardIdOf(current)]?.intervalDays ?? 0}
          onReveal={() => { unlock(); setRevealed(true); }}
        />
      )}

      {!marathonOn && current && !sessionEnded && revealed && (
        <GradeButtons
          grades={fcGrades}
          onGrade={onGrade}
          algorithm={fcAlgorithm}
          card={cards[cardIdOf(current)]}
        />
      )}

      {!marathonOn && sessionEnded && (
        <div className="rounded-2xl border border-divider bg-surface p-6 text-center">
          <p className="text-fg font-semibold">{inLapses ? '오답 재투입 완료!' : '세션 완료!'}</p>
          <p className="text-muted text-sm mt-1">
            정답 {sessionStats.correct} · 오답 {sessionStats.wrong}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {!inLapses && lapses.length > 0 && (
              <button
                type="button"
                onClick={startLapses}
                className="inline-flex items-center gap-2 rounded-full bg-accent text-white font-semibold px-5 py-2.5"
              >
                오답 {lapses.length}장 다시 풀기
              </button>
            )}
            <button
              type="button"
              onClick={restart}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-5 py-2.5"
            >
              <RotateCcw size={16} aria-hidden /> 다시 시작
            </button>
          </div>
        </div>
      )}

      <details className="text-xs text-muted">
        <summary className="cursor-pointer select-none">단축키</summary>
        <ul className="mt-2 space-y-0.5 pl-4 list-disc">
          <li>Space: 뜻 보기 / 정답(알아요)</li>
          <li>1: 모름(Again) {fcGrades === 4 && '· 2: 어려움 · 3: 알아요 · 4: 쉬움'}</li>
          {fcGrades === 2 && <li>2: 알아요(Good)</li>}
          <li>R: 음성 다시 재생</li>
        </ul>
      </details>
    </div>
  );
}

// ───────── helpers / subcomponents ─────────

function DeckChip({
  on, onClick, label, badge, icon, disabled,
}: {
  on: boolean; onClick: () => void; label: string; badge: number; icon?: JSX.Element; disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold border whitespace-nowrap',
        on ? 'bg-primary text-white border-primary'
           : disabled ? 'bg-surface text-muted/50 border-divider/50 opacity-60'
                      : 'bg-surface text-muted border-divider',
      )}
    >
      {icon}
      {label}
      <span className="text-xs opacity-80">({badge})</span>
    </button>
  );
}

function TypeChip({
  on, onClick, label, icon,
}: { on: boolean; onClick: () => void; label: string; icon: JSX.Element }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold border',
        on ? 'bg-primary-soft text-primary border-primary/30' : 'bg-surface text-muted border-divider',
      )}
    >
      {icon}{label}
    </button>
  );
}

function EmptyState({
  deck, onStartLapses, hasLapses,
}: { deck: Deck; onStartLapses: () => void; hasLapses: boolean }): JSX.Element {
  return (
    <div className="rounded-2xl border border-divider bg-surface p-6 text-center">
      <p className="text-fg font-semibold">표시할 카드가 없습니다.</p>
      <p className="text-muted text-sm mt-1">
        {deck === 'due' && '오늘 복습할 카드가 없어요. 잘하고 있습니다!'}
        {deck === 'favorites' && '아직 즐겨찾기한 항목이 없습니다.'}
        {deck === 'all' && '카드 종류 필터를 확인하세요.'}
        {deck === 'lapses' && '오답 카드가 없습니다.'}
        {deck === 'mistakes' && '오답이 누적된 카드가 없습니다.'}
      </p>
      {hasLapses && deck !== 'lapses' && (
        <button
          type="button"
          onClick={onStartLapses}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent text-white font-semibold px-4 py-2"
        >
          오답 재투입 시작
        </button>
      )}
    </div>
  );
}

function CardView({
  source, revealed, direction, srsBox, intervalDays, onReveal,
}: {
  source: CardSource;
  revealed: boolean;
  direction: 'zh2ko' | 'ko2zh';
  srsBox: number;
  intervalDays: number;
  onReveal: () => void;
}): JSX.Element {
  const lessonLink = `/lesson/${source.lessonId}`;
  const intervalLabel = intervalDays > 0 ? `${intervalDays}일` : `${BOX_DAYS[1]}일`;
  const headerLabel = source.kind === 'vocab' ? '단어' : source.kind === 'example' ? '예문' : '구절';

  return (
    <div className="rounded-2xl border border-divider bg-surface p-6 sm:p-8 text-center select-none">
      <p className="text-xs text-muted uppercase tracking-wider">
        <span className="font-semibold text-primary">{headerLabel}</span>
        {' · '}
        <Link to={lessonLink} className="hover:text-primary underline">{source.lessonTitleKo}</Link>
        {' · '}
        Box {srsBox} · {intervalLabel}
      </p>

      <div className="mt-6">
        {source.kind === 'vocab' && (
          <VocabFront vocab={source.vocab} direction={direction} revealed={revealed} />
        )}
        {source.kind === 'example' && source.vocab.example && (
          <ExampleFront verse={source.vocab.example} word={source.vocab.word} direction={direction} revealed={revealed} />
        )}
        {source.kind === 'verse' && (
          <VerseFront quote={source.verse} direction={direction} revealed={revealed} />
        )}
      </div>

      {!revealed && (
        <div className="mt-5 flex items-center justify-center">
          <button
            type="button"
            onClick={onReveal}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-white font-semibold px-6 py-3"
          >
            뜻 보기 (Space)
          </button>
        </div>
      )}
    </div>
  );
}

function VocabFront({
  vocab, direction, revealed,
}: { vocab: VocabEntry; direction: 'zh2ko' | 'ko2zh'; revealed: boolean }): JSX.Element {
  if (direction === 'zh2ko') {
    return (
      <>
        <div className="flex items-center justify-center gap-2">
          <p className="text-5xl sm:text-6xl font-bold text-fg">{vocab.word}</p>
          <TTSButton text={vocab.word} />
        </div>
        {revealed && (
          <>
            <p className="text-pinyin font-pinyin text-base mt-3">{vocab.pinyin}</p>
            <p className="text-xs text-muted">{vocab.pos}</p>
            <p className="text-fg text-xl mt-4 font-medium">{vocab.meaning}</p>
            {vocab.hanjaNote && (
              <p className="text-xs text-muted mt-2">{vocab.hanjaNote}</p>
            )}
          </>
        )}
      </>
    );
  }
  // ko → zh
  return (
    <>
      <p className="text-2xl sm:text-3xl font-bold text-fg">{vocab.meaning}</p>
      <p className="text-xs text-muted mt-1">{vocab.pos}</p>
      {revealed && (
        <>
          <div className="flex items-center justify-center gap-2 mt-5">
            <p className="text-4xl sm:text-5xl font-bold text-fg">{vocab.word}</p>
            <TTSButton text={vocab.word} />
          </div>
          <p className="text-pinyin font-pinyin text-base mt-2">{vocab.pinyin}</p>
          {vocab.hanjaNote && (
            <p className="text-xs text-muted mt-2">{vocab.hanjaNote}</p>
          )}
        </>
      )}
    </>
  );
}

function ExampleFront({
  verse, word, direction, revealed,
}: {
  verse: { zh: string; pinyin: string; ko: string };
  word: string;
  direction: 'zh2ko' | 'ko2zh';
  revealed: boolean;
}): JSX.Element {
  return (
    <>
      <p className="text-xs text-muted mb-2">단어: <b className="text-fg">{word}</b></p>
      {direction === 'zh2ko' ? (
        <>
          <div className="flex items-center justify-center gap-2">
            <p className="text-2xl sm:text-3xl font-semibold text-fg">{verse.zh}</p>
            <TTSButton text={verse.zh} />
          </div>
          {revealed && (
            <>
              <p className="text-pinyin font-pinyin text-sm mt-3">{verse.pinyin}</p>
              <p className="text-fg text-base mt-3">{verse.ko}</p>
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-lg sm:text-xl font-semibold text-fg">{verse.ko}</p>
          {revealed && (
            <>
              <div className="flex items-center justify-center gap-2 mt-5">
                <p className="text-2xl sm:text-3xl font-semibold text-fg">{verse.zh}</p>
                <TTSButton text={verse.zh} />
              </div>
              <p className="text-pinyin font-pinyin text-sm mt-2">{verse.pinyin}</p>
            </>
          )}
        </>
      )}
    </>
  );
}

function VerseFront({
  quote, direction, revealed,
}: {
  quote: { ref: string; refKo: string; text: { zh: string; pinyin: string; ko: string } };
  direction: 'zh2ko' | 'ko2zh';
  revealed: boolean;
}): JSX.Element {
  return (
    <>
      <p className="text-xs text-muted mb-2">{quote.ref} <span className="opacity-70">({quote.refKo})</span></p>
      {direction === 'zh2ko' ? (
        <>
          <div className="flex items-center justify-center gap-2">
            <p className="text-xl sm:text-2xl font-semibold text-fg">{quote.text.zh}</p>
            <TTSButton text={quote.text.zh} />
          </div>
          {revealed && (
            <>
              <p className="text-pinyin font-pinyin text-sm mt-3">{quote.text.pinyin}</p>
              <p className="text-fg text-base mt-3">{quote.text.ko}</p>
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-lg sm:text-xl font-semibold text-fg">{quote.text.ko}</p>
          {revealed && (
            <>
              <div className="flex items-center justify-center gap-2 mt-5">
                <p className="text-xl sm:text-2xl font-semibold text-fg">{quote.text.zh}</p>
                <TTSButton text={quote.text.zh} />
              </div>
              <p className="text-pinyin font-pinyin text-sm mt-2">{quote.text.pinyin}</p>
            </>
          )}
        </>
      )}
    </>
  );
}

function GradeButtons({
  grades, onGrade, algorithm, card,
}: {
  grades: 2 | 4;
  onGrade: (g: SRSGrade) => void;
  algorithm: 'leitner' | 'sm2';
  card: ReturnType<typeof useSRS.getState>['cards'][string] | undefined;
}): JSX.Element {
  // 다음 간격을 예상해서 버튼에 표시
  const nextInterval = (g: SRSGrade): string => {
    const base = card?.intervalDays ?? 0;
    const ease = card?.ease ?? 2.5;
    const reps = card?.reps ?? 0;
    let i = base;
    if (algorithm === 'leitner') {
      const box = card?.box ?? 1;
      const map: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
      if (g === 'again') i = map[1];
      else if (g === 'hard') i = map[box];
      else if (g === 'good') i = map[Math.min(5, box + 1)];
      else i = map[Math.min(5, box + 2)];
    } else {
      if (g === 'again') i = 1;
      else if (g === 'hard') i = Math.max(1, Math.round((base || 1) * 1.2));
      else if (g === 'good') i = reps === 0 ? 1 : reps === 1 ? 6 : Math.round((base || 1) * ease);
      else i = reps === 0 ? 4 : Math.round((base || 1) * ease * 1.3);
    }
    return i < 1 ? '<1일' : `${i}일`;
  };

  if (grades === 2) {
    return (
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => onGrade('again')}
          className="flex-1 max-w-[160px] inline-flex flex-col items-center gap-0.5 rounded-2xl bg-surface border border-accent text-accent font-semibold px-4 py-3"
          aria-label="모름"
        >
          <span className="inline-flex items-center gap-1"><X size={16} aria-hidden /> 모름</span>
          <span className="text-[10px] opacity-80">1일 뒤 (1)</span>
        </button>
        <button
          type="button"
          onClick={() => onGrade('good')}
          className="flex-1 max-w-[160px] inline-flex flex-col items-center gap-0.5 rounded-2xl bg-success text-white font-semibold px-4 py-3"
          aria-label="알아요"
        >
          <span className="inline-flex items-center gap-1"><Check size={16} aria-hidden /> 알아요</span>
          <span className="text-[10px] opacity-90">{nextInterval('good')} 뒤 (2)</span>
        </button>
      </div>
    );
  }
  // 4-grade
  return (
    <div className="grid grid-cols-4 gap-2">
      <GradeBtn label="모름" sub={`${nextInterval('again')} (1)`} cls="bg-surface border-accent text-accent border" onClick={() => onGrade('again')} />
      <GradeBtn label="어려움" sub={`${nextInterval('hard')} (2)`} cls="bg-surface border-warning text-warning border" onClick={() => onGrade('hard')} fallbackCls="bg-surface border-accent text-accent border" />
      <GradeBtn label="알아요" sub={`${nextInterval('good')} (3)`} cls="bg-success text-white" onClick={() => onGrade('good')} />
      <GradeBtn label="쉬움" sub={`${nextInterval('easy')} (4)`} cls="bg-primary text-white" onClick={() => onGrade('easy')} />
    </div>
  );
}

function GradeBtn({ label, sub, cls, fallbackCls, onClick }: { label: string; sub: string; cls: string; fallbackCls?: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn('inline-flex flex-col items-center justify-center gap-0.5 rounded-2xl font-semibold px-2 py-3', cls || fallbackCls)}
    >
      <span className="text-sm">{label}</span>
      <span className="text-[10px] opacity-90">{sub}</span>
    </button>
  );
}

/**
 * 레슨 멀티 필터: 권별 그룹 + "권 전체" 체크 + 각 과 체크박스.
 * - 선택 0개 = 전체 (필터 미적용)
 * - 권 전체 체크 = 해당 권의 모든 과를 selected에 추가/제거
 */
function LessonMultiFilter({
  groups,
  selected,
  onChange,
}: {
  groups: Record<1 | 2 | 3, Array<{ id: string; no: number; label: string }>>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}): JSX.Element {
  const totalCount = groups[1].length + groups[2].length + groups[3].length;
  const summary =
    selected.size === 0
      ? '전체'
      : selected.size === 1
        ? (() => {
            const id = Array.from(selected)[0];
            for (const k of [1, 2, 3] as const) {
              const hit = groups[k].find((l) => l.id === id);
              if (hit) return `${k}권.${hit.label}`;
            }
            return `${selected.size}개 선택`;
          })()
        : `${selected.size}/${totalCount}개 선택`;

  const toggleOne = (id: string): void => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };
  const toggleVol = (vol: 1 | 2 | 3): void => {
    const next = new Set(selected);
    const list = groups[vol];
    const allOn = list.length > 0 && list.every((l) => next.has(l.id));
    if (allOn) for (const l of list) next.delete(l.id);
    else for (const l of list) next.add(l.id);
    onChange(next);
  };
  const clear = (): void => onChange(new Set());

  return (
    <details className="group rounded-xl border border-divider bg-surface text-xs">
      <summary className="cursor-pointer select-none px-3 py-2 flex items-center justify-between w-full gap-2 list-none [&::-webkit-details-marker]:hidden">
        <span className="text-muted shrink-0">범위</span>
        <span className="text-fg font-semibold truncate flex-1 text-right">{summary}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className="shrink-0 text-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="px-3 pb-3 space-y-3">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={clear}
            disabled={selected.size === 0}
            className="text-xs text-primary font-semibold disabled:opacity-40"
          >
            전체 해제
          </button>
        </div>
        {([1, 2, 3] as const).map((vol) => {
          const list = groups[vol];
          if (list.length === 0) return null;
          const allOn = list.every((l) => selected.has(l.id));
          const someOn = !allOn && list.some((l) => selected.has(l.id));
          return (
            <div key={vol} className="rounded-lg border border-divider">
              <label className="flex items-center gap-2 px-3 py-2 cursor-pointer bg-surface">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => { if (el) el.indeterminate = someOn; }}
                  onChange={() => toggleVol(vol)}
                  aria-label={`${vol}권 전체 선택`}
                />
                <span className="font-semibold text-fg">{vol}권 전체</span>
                <span className="text-muted ml-auto">{list.length}과</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 px-3 py-2 border-t border-divider">
                {list.map((l) => {
                  const on = selected.has(l.id);
                  return (
                    <label key={l.id} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleOne(l.id)}
                        aria-label={`${vol}권.${l.label}`}
                      />
                      <span className={cn('truncate', on ? 'text-fg' : 'text-muted')}>{l.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={(e) => {
              const det = (e.currentTarget.closest('details')) as HTMLDetailsElement | null;
              if (det) det.open = false;
            }}
            className="inline-flex items-center gap-1 rounded-full bg-primary text-white font-semibold px-4 py-1.5 text-xs"
            aria-label="레슨 필터 패널 닫기"
          >
            <ChevronDown size={12} aria-hidden className="rotate-180" /> 닫기
          </button>
        </div>
      </div>
    </details>
  );
}
