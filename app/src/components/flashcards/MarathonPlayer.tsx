/**
 * 오디오 마라톤 모드.
 *   - 주어진 카드 리스트의 zh 텍스트를 순차 재생.
 *   - 채점 없음. 듣기 집중용.
 *   - 일시정지/이전/다음/속도 조절.
 *
 * 이용:
 *   Learn 페이지의 '마라톤' 탭(Marathon.tsx)에서 사용한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Square, Minus, Plus } from 'lucide-react';
import { speak, stop as ttsStop, unlock, isSupported as ttsSupported } from '@/lib/tts';
import {
  type CardSource, speakTextOf, cardIdOf,
} from '@/lib/flashcard-items';
import { cn } from '@/lib/cn';
import { useSettings } from '@/stores/settings';
import { alignRuby } from '@/lib/pinyinRuby';
import HanziRuby from '@/components/HanziRuby';

type Props = {
  cards: CardSource[];
  ttsRate: number;
  ttsVoiceURI: string | null;
  onExit: () => void;
  /** 표시 토글 — 모두 false면 진행 정보만 표시 (TTS는 zh로 항상 재생). 기본값: 모두 true. */
  show?: { zh: boolean; pinyin: boolean; ko: boolean };
};

type CardTexts = { zh: string; pinyin: string; ko: string };

function cardTextsOf(s: CardSource): CardTexts {
  if (s.kind === 'vocab') return { zh: s.vocab.word, pinyin: s.vocab.pinyin, ko: s.vocab.meaning };
  if (s.kind === 'example' && s.vocab.example) return { ...s.vocab.example };
  if (s.kind === 'verse') return { ...s.verse.text };
  if (s.kind === 'dialog' || s.kind === 'scenario' || s.kind === 'body') return { ...s.verse };
  return { zh: '', pinyin: '', ko: '' };
}

export default function MarathonPlayer({
  cards, ttsRate, ttsVoiceURI, onExit,
  show = { zh: true, pinyin: true, ko: true },
}: Props): JSX.Element {
  const { rubyPinyin } = useSettings();
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pauseBetweenMs, setPauseBetweenMs] = useState(1200);
  const [repeatCount, setRepeatCount] = useState(1);
  const [repeatCurrent, setRepeatCurrent] = useState(0); // display-only
  const timerRef = useRef<number | null>(null);
  const playingRef = useRef(playing);
  const idxRef = useRef(idx);
  const cardsRef = useRef(cards);
  const repeatRef = useRef(0); // 0-indexed, current repeat (scheduler-side)
  const repeatCountRef = useRef(repeatCount);
  const pauseBetweenRef = useRef(pauseBetweenMs);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { repeatCountRef.current = repeatCount; }, [repeatCount]);
  useEffect(() => { pauseBetweenRef.current = pauseBetweenMs; }, [pauseBetweenMs]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advanceOrRepeat = useCallback(() => {
    const currentRepeat = repeatRef.current + 1;
    if (currentRepeat < repeatCountRef.current) {
      repeatRef.current = currentRepeat;
      setRepeatCurrent(currentRepeat);
      timerRef.current = window.setTimeout(() => {
        if (playingRef.current) playCurrent();
      }, 800);
    } else {
      repeatRef.current = 0;
      setRepeatCurrent(0);
      timerRef.current = window.setTimeout(() => {
        setIdx((v) => v + 1);
      }, pauseBetweenRef.current);
    }
  }, []);

  const playCurrent = useCallback(() => {
    if (!playingRef.current) return;
    const list = cardsRef.current;
    const i = idxRef.current;
    if (i >= list.length) {
      setPlaying(false);
      return;
    }
    const text = speakTextOf(list[i]);
    if (!text) {
      setIdx((v) => v + 1);
      timerRef.current = window.setTimeout(() => {
        if (playingRef.current) playCurrent();
      }, 50);
      return;
    }
    speak(text, {
      rate: ttsRate,
      voiceURI: ttsVoiceURI ?? undefined,
      onEnd: () => {
        if (!playingRef.current) return;
        clearTimer();
        advanceOrRepeat();
      },
      onError: () => {
        if (!playingRef.current) return;
        clearTimer();
        timerRef.current = window.setTimeout(() => setIdx((v) => v + 1), 300);
      },
    });
  }, [ttsRate, ttsVoiceURI, advanceOrRepeat, clearTimer]);

  // when playing turns on, or idx changes while playing, kick off speak
  useEffect(() => {
    if (!playing) return;
    if (idx >= cards.length) { setPlaying(false); return; }
    playCurrent();
    return () => {
      ttsStop();
      clearTimer();
    };
  }, [playing, idx, cards.length, playCurrent, clearTimer]);

  // cleanup
  useEffect(() => () => {
    ttsStop();
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  const togglePlay = (): void => {
    if (!ttsSupported()) return;
    unlock();
    setPlaying((p) => {
      const next = !p;
      if (!next) ttsStop();
      return next;
    });
  };
  const next = (): void => {
    ttsStop();
    clearTimer();
    repeatRef.current = 0;
    setRepeatCurrent(0);
    setIdx((v) => Math.min(cards.length, v + 1));
  };
  const prev = (): void => {
    ttsStop();
    clearTimer();
    repeatRef.current = 0;
    setRepeatCurrent(0);
    setIdx((v) => Math.max(0, v - 1));
  };
  const exit = (): void => {
    setPlaying(false);
    ttsStop();
    clearTimer();
    onExit();
  };

  const current = cards[idx];
  const done = idx >= cards.length;
  const progress = cards.length === 0 ? 0 : Math.round((idx / cards.length) * 100);
  const repeatLabel = repeatCount > 1 ? ` (${repeatCurrent + 1}/${repeatCount}회)` : '';

  return (
    <div className="rounded-2xl border border-primary bg-primary-soft p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-primary inline-flex items-center gap-2">
          🎧 이어듣기{repeatLabel}
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

      <div className="text-center min-h-[5rem] flex items-center justify-center">
        {done ? (
          <p className="text-fg font-semibold">재생 완료</p>
        ) : current ? (
          (() => {
            const t = cardTextsOf(current);
            const useRuby = show.zh && show.pinyin && rubyPinyin && t.pinyin;
            const rubyTokens = useRuby ? alignRuby(t.zh, t.pinyin) : null;
            return (
              <div key={cardIdOf(current)}>
                <p className="text-xs text-muted">{current.lessonTitleKo} · {idx + 1}/{cards.length}</p>
                {rubyTokens ? (
                  <HanziRuby tokens={rubyTokens} className="justify-center mt-1" />
                ) : (
                  <>
                    {show.zh && (
                      <p className="text-2xl sm:text-3xl font-bold text-fg mt-1">{t.zh}</p>
                    )}
                    {show.pinyin && t.pinyin && (
                      <p className="text-pinyin font-pinyin text-sm mt-1">{t.pinyin}</p>
                    )}
                  </>
                )}
                {show.ko && t.ko && (
                  <p className="text-fg text-base mt-1">{t.ko}</p>
                )}
              </div>
            );
          })()
        ) : (
          <p className="text-muted">재생할 카드가 없습니다</p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={prev} aria-label="이전" disabled={idx === 0}
          className={cn('inline-flex items-center justify-center w-11 h-11 rounded-full border border-divider bg-surface text-fg',
            idx === 0 && 'opacity-50')}>
          <SkipBack size={18} aria-hidden />
        </button>
        <button type="button" onClick={togglePlay} aria-label={playing ? '일시정지' : '재생'} disabled={done}
          className={cn('inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary text-white shadow',
            done && 'opacity-50')}>
          {playing ? <Pause size={22} aria-hidden /> : <Play size={22} aria-hidden />}
        </button>
        <button type="button" onClick={next} aria-label="다음" disabled={done}
          className={cn('inline-flex items-center justify-center w-11 h-11 rounded-full border border-divider bg-surface text-fg',
            done && 'opacity-50')}>
          <SkipForward size={18} aria-hidden />
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-muted flex-wrap">
        <label htmlFor="gap" className="whitespace-nowrap">카드 간격</label>
        <input
          id="gap"
          type="range"
          min={200}
          max={15000}
          step={100}
          value={pauseBetweenMs}
          onChange={(e) => setPauseBetweenMs(Number(e.target.value))}
          className="w-24"
          aria-label="다음 카드까지 간격"
        />
        <span className="tabular-nums w-8">{(pauseBetweenMs / 1000).toFixed(1)}s</span>
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-muted flex-wrap">
        <label className="whitespace-nowrap">반복</label>
        <button
          type="button"
          onClick={() => setRepeatCount((v) => Math.max(1, v - 1))}
          disabled={repeatCount <= 1}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-divider bg-surface disabled:opacity-30"
          aria-label="반복 횟수 감소"
        >
          <Minus size={10} aria-hidden />
        </button>
        <span className="tabular-nums w-6 text-center font-semibold text-fg">{repeatCount}</span>
        <button
          type="button"
          onClick={() => setRepeatCount((v) => Math.min(5, v + 1))}
          disabled={repeatCount >= 5}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-divider bg-surface disabled:opacity-30"
          aria-label="반복 횟수 증가"
        >
          <Plus size={10} aria-hidden />
        </button>
        <span className="text-muted">회</span>
      </div>
    </div>
  );
}
