/**
 * 오디오 마라톤 모드.
 *   - 주어진 카드 리스트의 zh 텍스트를 순차 재생.
 *   - 채점 없음. 듣기 집중용.
 *   - 일시정지/이전/다음/속도 조절.
 *
 * 이용:
 *   {fcAudioMarathon && <MarathonPlayer cards={filtered} ttsRate={...} ttsVoiceURI={...} />}
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import { speak, stop as ttsStop, unlock, isSupported as ttsSupported } from '@/lib/tts';
import {
  type CardSource, speakTextOf, cardIdOf,
} from '@/lib/flashcard-items';
import { cn } from '@/lib/cn';

type Props = {
  cards: CardSource[];
  ttsRate: number;
  ttsVoiceURI: string | null;
  onExit: () => void;
};

export default function MarathonPlayer({ cards, ttsRate, ttsVoiceURI, onExit }: Props): JSX.Element {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pauseBetweenMs, setPauseBetweenMs] = useState(1200);
  const timerRef = useRef<number | null>(null);
  const playingRef = useRef(playing);
  const idxRef = useRef(idx);
  const cardsRef = useRef(cards);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
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
      // skip
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
        timerRef.current = window.setTimeout(() => {
          setIdx((v) => v + 1);
        }, pauseBetweenMs);
      },
      onError: () => {
        if (!playingRef.current) return;
        clearTimer();
        timerRef.current = window.setTimeout(() => setIdx((v) => v + 1), 300);
      },
    });
  }, [ttsRate, ttsVoiceURI, pauseBetweenMs, clearTimer]);

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
    setIdx((v) => Math.min(cards.length, v + 1));
  };
  const prev = (): void => {
    ttsStop();
    clearTimer();
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

  return (
    <div className="rounded-2xl border border-primary bg-primary-soft p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-primary inline-flex items-center gap-2">
          🎧 오디오 마라톤
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
          <div>
            <p className="text-xs text-muted">{current.lessonTitleKo} · {idx + 1}/{cards.length}</p>
            <p className="text-2xl sm:text-3xl font-bold text-fg mt-1">{speakTextOf(current)}</p>
            <p className="text-xs text-muted mt-1" key={cardIdOf(current)}>
              {current.kind === 'vocab' ? current.vocab.meaning
                : current.kind === 'example' && current.vocab.example ? current.vocab.example.ko
                : current.kind === 'verse' ? current.verse.text.ko
                : ''}
            </p>
          </div>
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

      <div className="flex items-center justify-center gap-2 text-xs text-muted">
        <label htmlFor="gap" className="whitespace-nowrap">간격</label>
        <input
          id="gap"
          type="range"
          min={200}
          max={3000}
          step={100}
          value={pauseBetweenMs}
          onChange={(e) => setPauseBetweenMs(Number(e.target.value))}
          className="w-32"
          aria-label="카드 사이 간격"
        />
        <span className="tabular-nums">{(pauseBetweenMs / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}
