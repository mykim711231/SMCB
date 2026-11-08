/**
 * 단계 듣기 플레이어.
 *   - 카드마다 영역별 단계 계획(lib/stagedListen.ts)대로 재생한다.
 *   - 단계별로 화면 표시·속도·대기(떠올리기/따라 말하기)를 바꾸고,
 *     마지막 단계는 대기 후 전체 문장을 잠깐 보여 준다(정답 확인).
 *   - '다시 듣기' 표시한 문장은 목록이 끝난 뒤 뒤쪽 단계만 한 번 더 재생한다.
 *   - 나눠 듣기(split): 전체 목록을 앞 단계로 한 바퀴 → 뒤 단계로 다시 한 바퀴.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Square, RotateCcw } from 'lucide-react';
import { speak, stop as ttsStop, unlock, isSupported as ttsSupported } from '@/lib/tts';
import { type CardSource, speakTextOf, cardIdOf } from '@/lib/flashcard-items';
import {
  planOf, buildQueue, buildRetry, shadowWaitMs, type Step, type StageShow,
  SLOW_FACTOR, WAIT_SHORT_MS, WAIT_RECALL_MS, REVEAL_MS, CARD_GAP_MS,
} from '@/lib/stagedListen';
import { cn } from '@/lib/cn';
import { useSettings } from '@/stores/settings';
import { alignRuby } from '@/lib/pinyinRuby';
import HanziRuby from '@/components/HanziRuby';
import { markChunksText, markChunksTokens } from '@/lib/chunkMarks';
import { useChunkData } from '@/lib/useChunkData';
import { cardTextsOf } from './MarathonPlayer';
import {
  startSession as startMediaSession,
  endSession as endMediaSession,
  setMetadata as setMediaMetadata,
  setPlaybackState as setMediaPlaybackState,
} from '@/lib/mediaSession';

type Props = {
  cards: CardSource[];
  split: boolean;
  ttsRate: number;
  ttsVoiceURI: string | null;
  onExit: () => void;
};

/** 현재 진행 상태: 재생 중 / 떠올리기 대기 / 따라 말하기 대기 / 정답 확인 */
type Phase = 'audio' | 'wait' | 'recall' | 'shadow' | 'reveal';

const SHOW_FLAGS: Record<StageShow, { zh: boolean; pinyin: boolean; ko: boolean }> = {
  none: { zh: false, pinyin: false, ko: false },
  all: { zh: true, pinyin: true, ko: true },
  hzpy: { zh: true, pinyin: true, ko: false },
  hz: { zh: true, pinyin: false, ko: false },
};

export default function StagedListenPlayer({ cards, split, ttsRate, ttsVoiceURI, onExit }: Props): JSX.Element {
  const { rubyPinyin, chunkLevel } = useSettings();
  useChunkData(chunkLevel);
  const userMode = useSettings((s) => s.userMode);

  const initialQueue = useMemo(() => buildQueue(cards, split), [cards, split]);
  const [queue, setQueue] = useState<Step[]>(initialQueue);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>('audio');
  const [marked, setMarked] = useState<Set<number>>(() => new Set());
  const [finished, setFinished] = useState(false);

  const queueRef = useRef(queue);
  const posRef = useRef(pos);
  const playingRef = useRef(playing);
  const markedRef = useRef(marked);
  const retryAddedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { posRef.current = pos; }, [pos]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { markedRef.current = marked; }, [marked]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    const q = queueRef.current;
    const p = posRef.current;
    const nextStep = q[p + 1];
    const gap = nextStep && nextStep.ci !== q[p]?.ci ? CARD_GAP_MS : 300;
    timerRef.current = window.setTimeout(() => {
      if (playingRef.current) setPos(p + 1);
    }, gap);
  }, []);

  const runStep = useCallback(() => {
    if (!playingRef.current) return;
    let q = queueRef.current;
    const p = posRef.current;
    if (p >= q.length) {
      // 목록 끝 — '다시 듣기' 표시 문장이 있으면 한 번만 뒤 단계를 이어 붙인다.
      if (!retryAddedRef.current && markedRef.current.size > 0) {
        retryAddedRef.current = true;
        q = [...q, ...buildRetry(cards, markedRef.current)];
        queueRef.current = q;
        setQueue(q);
      } else {
        setPlaying(false);
        setFinished(true);
        endMediaSession();
        return;
      }
    }
    const step = q[p];
    const card = cards[step.ci];
    const stage = planOf(card).stages[step.si];
    const text = speakTextOf(card);
    setPhase('audio');
    if (!text) { advance(); return; }
    const t0 = Date.now();
    speak(text, {
      rate: Math.max(0.5, ttsRate * (stage.slow ? SLOW_FACTOR : 1)),
      voiceURI: ttsVoiceURI ?? undefined,
      onEnd: () => {
        if (!playingRef.current) return;
        clearTimer();
        const spoken = Date.now() - t0;
        const wait = stage.wait === 'shadow' ? shadowWaitMs(spoken)
          : stage.wait === 'recall' ? WAIT_RECALL_MS
          : WAIT_SHORT_MS;
        setPhase(stage.wait === 'shadow' ? 'shadow' : stage.wait === 'recall' ? 'recall' : 'wait');
        timerRef.current = window.setTimeout(() => {
          if (!playingRef.current) return;
          if (stage.reveal) {
            setPhase('reveal');
            timerRef.current = window.setTimeout(() => {
              if (playingRef.current) advance();
            }, REVEAL_MS);
          } else {
            advance();
          }
        }, wait);
      },
      onError: () => {
        if (!playingRef.current) return;
        clearTimer();
        advance();
      },
    });
  }, [cards, ttsRate, ttsVoiceURI, advance, clearTimer]);

  // 재생 시작 / 단계 이동 시 현재 단계 재생
  useEffect(() => {
    if (!playing) return;
    runStep();
    return () => {
      ttsStop();
      clearTimer();
    };
  }, [playing, pos, runStep, clearTimer]);

  useEffect(() => () => {
    ttsStop();
    endMediaSession();
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  const step: Step | undefined = queue[Math.min(pos, queue.length - 1)];
  const card = step ? cards[step.ci] : undefined;
  const plan = card ? planOf(card) : undefined;
  const stage = plan && step ? plan.stages[step.si] : undefined;

  // 잠금화면 메타데이터 (recorded 모드)
  useEffect(() => {
    if (userMode !== 'recorded' || !card) return;
    const t = cardTextsOf(card);
    setMediaMetadata({ title: t.zh || t.ko || '단계 듣기', artist: card.lessonTitleKo, album: 'SMCB 단계 듣기' });
  }, [card, userMode]);

  /** 같은 카드가 이어지는 구간의 시작 위치 */
  const segmentStart = (q: Step[], p: number): number => {
    let s = Math.min(p, q.length - 1);
    while (s > 0 && q[s - 1].ci === q[s].ci && !!q[s - 1].retry === !!q[s].retry) s--;
    return s;
  };

  const jump = useCallback((to: number): void => {
    ttsStop();
    clearTimer();
    setFinished(false);
    setPhase('audio');
    setPos(Math.max(0, Math.min(to, queueRef.current.length)));
  }, [clearTimer]);

  const prev = useCallback((): void => {
    const q = queueRef.current;
    const p = Math.min(posRef.current, q.length - 1);
    const s = segmentStart(q, p);
    jump(p > s ? s : segmentStart(q, Math.max(0, s - 1)));
  }, [jump]);

  const next = useCallback((): void => {
    const q = queueRef.current;
    let p = posRef.current;
    const cur = q[p];
    if (!cur) return;
    while (p < q.length && q[p].ci === cur.ci && !!q[p].retry === !!cur.retry) p++;
    jump(p);
  }, [jump]);

  const playAction = useCallback((): void => {
    // 끝까지 들은 뒤 다시 재생하면 처음부터
    if (posRef.current >= queueRef.current.length) { posRef.current = 0; setPos(0); }
    setFinished(false);
    setPlaying(true);
    setMediaPlaybackState('playing');
  }, []);

  const pauseAction = useCallback((): void => {
    ttsStop();
    clearTimer();
    setPlaying(false);
    setPhase('audio');
    setMediaPlaybackState('paused');
  }, [clearTimer]);

  const togglePlay = (): void => {
    if (!ttsSupported()) return;
    unlock();
    if (playingRef.current) { pauseAction(); return; }
    if (userMode === 'recorded') {
      startMediaSession({ play: playAction, pause: pauseAction, previoustrack: prev, nexttrack: next });
    }
    playAction();
  };

  const exit = (): void => {
    setPlaying(false);
    ttsStop();
    clearTimer();
    endMediaSession();
    onExit();
  };

  const toggleMark = (): void => {
    if (!step) return;
    setMarked((prevSet) => {
      const s = new Set(prevSet);
      if (s.has(step.ci)) s.delete(step.ci); else s.add(step.ci);
      return s;
    });
  };

  const done = finished || pos >= queue.length;
  const progress = queue.length === 0 ? 0 : Math.round((Math.min(pos, queue.length) / queue.length) * 100);
  const isRetry = !!step?.retry;
  const isMarked = step ? marked.has(step.ci) : false;

  const hint =
    phase === 'shadow' ? '따라 말해 보세요'
    : phase === 'recall' ? '뜻을 떠올려 보세요'
    : phase === 'reveal' ? '맞게 들었나요?'
    : stage?.show === 'none' && playing ? '소리에 집중하세요'
    : '';

  const flags = phase === 'reveal' ? SHOW_FLAGS.all : SHOW_FLAGS[stage?.show ?? 'all'];

  return (
    <div className="rounded-2xl border border-primary bg-primary-soft p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-primary">
          단계 듣기{isRetry && ' · 다시 듣기'}
        </p>
        <button
          type="button"
          onClick={exit}
          className="inline-flex items-center gap-1 rounded-full bg-surface text-fg border border-divider text-xs font-semibold px-3 py-1.5"
        >
          <Square size={12} aria-hidden /> 종료
        </button>
      </div>

      <div className="w-full h-1 rounded-full bg-divider/50 overflow-hidden">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>

      {!done && plan && stage && step && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>{card?.lessonTitleKo} · 문장 {step.ci + 1}/{cards.length}</span>
          <span className="font-semibold text-fg">
            {plan.name} {step.si + 1}/{plan.stages.length} · {stage.label}{stage.slow && ' (느리게)'}
          </span>
        </div>
      )}

      <div className="text-center min-h-[6rem] flex items-center justify-center">
        {done ? (
          <div className="space-y-1">
            <p className="text-fg font-semibold">단계 듣기 완료</p>
            {retryAddedRef.current && <p className="text-xs text-muted">다시 듣기 {marked.size}문장까지 마쳤어요.</p>}
          </div>
        ) : card ? (
          (() => {
            const t = cardTextsOf(card);
            const useRuby = flags.zh && flags.pinyin && rubyPinyin && t.pinyin;
            const aligned = useRuby ? alignRuby(t.zh, t.pinyin) : null;
            const rubyTokens = aligned ? markChunksTokens(aligned, chunkLevel) : aligned;
            const marked2 = markChunksText(t.zh, t.pinyin, chunkLevel);
            const nothing = !flags.zh && !flags.pinyin && !flags.ko;
            return (
              <div key={`${cardIdOf(card)}:${step?.si}`}>
                {rubyTokens ? (
                  <HanziRuby tokens={rubyTokens} className="justify-center" />
                ) : (
                  <>
                    {flags.zh && <p className="text-2xl sm:text-3xl font-bold text-fg">{marked2.zh}</p>}
                    {flags.pinyin && t.pinyin && (
                      <p className="text-pinyin font-pinyin text-sm mt-1">{marked2.pinyin}</p>
                    )}
                  </>
                )}
                {flags.ko && t.ko && <p className="text-fg text-base mt-1">{t.ko}</p>}
                {nothing && <p className="text-muted text-3xl tracking-widest" aria-hidden>· · ·</p>}
                {hint && <p className="text-primary text-sm font-semibold mt-2">{hint}</p>}
              </div>
            );
          })()
        ) : (
          <p className="text-muted">재생할 문장이 없습니다</p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={prev} aria-label="이전 문장" disabled={pos === 0}
          className={cn('inline-flex items-center justify-center w-11 h-11 rounded-full border border-divider bg-surface text-fg',
            pos === 0 && 'opacity-50')}>
          <SkipBack size={18} aria-hidden />
        </button>
        <button type="button" onClick={togglePlay} aria-label={playing ? '일시정지' : '재생'}
          disabled={done && !queue.length}
          className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary text-white shadow">
          {playing ? <Pause size={22} aria-hidden /> : <Play size={22} aria-hidden />}
        </button>
        <button type="button" onClick={next} aria-label="다음 문장" disabled={done}
          className={cn('inline-flex items-center justify-center w-11 h-11 rounded-full border border-divider bg-surface text-fg',
            done && 'opacity-50')}>
          <SkipForward size={18} aria-hidden />
        </button>
      </div>

      {!done && !isRetry && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={toggleMark}
            aria-pressed={isMarked}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold',
              isMarked ? 'bg-accent text-white border-accent' : 'bg-surface text-fg border-divider',
              phase === 'reveal' && !isMarked && 'border-accent text-accent',
            )}
          >
            <RotateCcw size={12} aria-hidden />
            {isMarked ? '다시 듣기 표시됨' : '어려우면 다시 듣기'}
          </button>
        </div>
      )}
      {!done && marked.size > 0 && !isRetry && (
        <p className="text-center text-xs text-muted">다시 듣기 {marked.size}문장 — 목록이 끝난 뒤 한 번 더 들려줘요.</p>
      )}
    </div>
  );
}
