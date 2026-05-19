/**
 * 최소 대조쌍 듣기 미니 게임.
 *   - 같은 무성조 pinyin을 공유하는 단음절 단어들에서 정답을 선정.
 *   - TTS로 정답 발음을 들려주고, 사용자는 후보 중 하나를 선택.
 *   - 진행률·점수, 다시 듣기, 다음 라운드, 종료.
 *
 * 진행 모델: SentenceBuilder와 동일한 cursor 기반 시퀀스.
 *   - 입력 pairs를 시드 셔플한 시퀀스(sequence)를 만들어 cursor++ 진행.
 *   - cursor >= sequence.length이면 세션 완료 화면.
 *   - reseed 카운터로 "다시 시작" 시 새 셔플.
 *   - 헤더에 "(현재/총)" 표시 → 범위 선택의 결과가 게임 안에서 명확히 보임.
 */
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, RotateCcw, Square, Check, X, Play } from 'lucide-react';
import { speak, stop as ttsStop, unlock, isSupported as ttsSupported } from '@/lib/tts';
import type { MinimalPair, PairItem } from '@/lib/minimal-pairs';
import { cn } from '@/lib/cn';

type Props = {
  pairs: MinimalPair[];
  ttsRate: number;
  ttsVoiceURI: string | null;
  onExit: () => void;
  /**
   * 정/오답 시 호출 — SRS 반영용 (정답 단어의 vocabId 기준).
   * rtMs: TTS 재생 완료 시각 → 사용자 선택까지 ms. SM-2 4단계 추정 신호.
   * signalLen: 단음절(=1)로 고정 — 임계값은 FAST_MIN/SLOW_MIN으로 결정됨.
   */
  onResult?: (vocabId: string, correct: boolean, rtMs?: number, signalLen?: number) => void;
};

type Round = {
  options: PairItem[];
  answer: PairItem;
};

function buildSequence(pairs: MinimalPair[], reseed: number): Round[] {
  const arr = pairs.slice();
  // Fisher-Yates with cheap LCG so 같은 reseed에서 동일 순서 (디버깅·재시작 안정)
  let s = (reseed * 2654435761 + 1) >>> 0 || 1;
  const rand = (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.map((g) => ({
    options: g.items,
    answer: g.items[Math.floor(rand() * g.items.length)],
  }));
}

export default function MinimalPairsGame({ pairs, ttsRate, ttsVoiceURI, onExit, onResult }: Props): JSX.Element {
  const [reseed, setReseed] = useState(() => Math.floor(Math.random() * 1e9));
  const sequence = useMemo(() => buildSequence(pairs, reseed), [pairs, reseed]);
  const [cursor, setCursor] = useState(0);
  const round: Round | null = sequence[cursor] ?? null;
  const [picked, setPicked] = useState<PairItem | null>(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [played, setPlayed] = useState(false);
  const playedRef = useRef(false);
  // 오디오 재생 직후 시각 — select 시 RT 계산.
  // (라운드 시작 시점이 아니라 재생 직후로 잡아야 TTS 지연이 RT에 섞이지 않음.)
  const playedAtRef = useRef<number>(performance.now());
  // ARIA Radio Pattern: roving tabindex
  const [focusIdx, setFocusIdx] = useState(0);
  const choiceRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const play = useCallback((text: string) => {
    if (!ttsSupported()) return;
    unlock();
    ttsStop();
    speak(text, { rate: ttsRate, voiceURI: ttsVoiceURI ?? undefined });
  }, [ttsRate, ttsVoiceURI]);

  // 라운드 변경(cursor 이동) 시 자동 1회 재생 · 선택 초기화
  useEffect(() => {
    playedRef.current = false;
    setPlayed(false);
    setPicked(null);
    setFocusIdx(0);
    if (!round) return;
    const t = window.setTimeout(() => {
      play(round.answer.word);
      playedRef.current = true;
      setPlayed(true);
      playedAtRef.current = performance.now();
    }, 200);
    return () => window.clearTimeout(t);
  }, [round, play]);

  // 마운트 해제 시 TTS 중지
  useEffect(() => () => { ttsStop(); }, []);

  // focusIdx 변경 → 라디오그룹 내 포커스 이동(외부 포커스 빼앗지 않음)
  useEffect(() => {
    const btn = choiceRefs.current[focusIdx];
    if (btn && document.activeElement && choiceRefs.current.includes(document.activeElement as HTMLButtonElement)) {
      btn.focus();
    }
  }, [focusIdx]);

  const select = (it: PairItem, idx?: number): void => {
    if (picked) return;
    if (!round) return;
    setPicked(it);
    if (typeof idx === 'number') setFocusIdx(idx);
    const ok = it.word === round.answer.word;
    setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
    const rtMs = Math.max(0, performance.now() - playedAtRef.current);
    onResult?.(round.answer.vocabId, ok, rtMs, 1);
  };

  // 라디오그룹 키보드 이동
  const onChoiceKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, idx: number): void => {
    if (!round) return;
    const n = round.options.length;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        setFocusIdx((idx + 1) % n);
        return;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        setFocusIdx((idx - 1 + n) % n);
        return;
      case 'Home':
        e.preventDefault();
        setFocusIdx(0);
        return;
      case 'End':
        e.preventDefault();
        setFocusIdx(n - 1);
        return;
      default:
        return;
    }
  };

  const nextRound = (): void => {
    setCursor((c) => c + 1);
  };

  // 전역 단축키: 1-N로 보기 선택, 답변 후 Enter로 다음 라운드
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!round) return;
      if (e.key === 'Enter' && picked) {
        e.preventDefault();
        nextRound();
        return;
      }
      if (picked) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= round.options.length) {
        e.preventDefault();
        const opt = round.options[n - 1];
        if (opt) select(opt, n - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, picked]);

  const restart = (): void => {
    setCursor(0);
    setScore({ correct: 0, wrong: 0 });
    setReseed((x) => x + 1);
  };

  const exit = (): void => {
    ttsStop();
    onExit();
  };

  const total = score.correct + score.wrong;
  const accuracy = total === 0 ? 0 : Math.round((score.correct / total) * 100);

  if (pairs.length === 0) {
    return (
      <div className="rounded-2xl border border-divider bg-surface p-6 text-center space-y-3">
        <p className="text-fg font-semibold">대조쌍을 만들 단음절 단어가 부족합니다.</p>
        <p className="text-sm text-muted">레슨 범위를 넓히거나 단음절 단어가 더 많은 과를 선택해 주세요.</p>
        <button
          type="button"
          onClick={exit}
          className="inline-flex items-center gap-1 rounded-full bg-primary text-white px-4 py-2 text-sm font-semibold"
        >
          <Square size={14} aria-hidden /> 종료
        </button>
      </div>
    );
  }

  // 세션 종료 화면 — cursor가 시퀀스 끝을 넘었을 때
  if (!round) {
    return (
      <div className="rounded-2xl border border-divider bg-surface p-6 text-center space-y-3">
        <p className="text-fg font-semibold">세션 완료!</p>
        <p className="text-sm text-muted">정답 {score.correct} · 오답 {score.wrong} ({accuracy}%)</p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-1 rounded-full bg-primary text-white font-semibold px-5 py-2"
          >
            <RotateCcw size={14} aria-hidden /> 다시 시작
          </button>
          <button
            type="button"
            onClick={exit}
            className="inline-flex items-center gap-1 rounded-full bg-surface text-fg border border-divider font-semibold px-4 py-2"
          >
            <Square size={14} aria-hidden /> 종료
          </button>
        </div>
      </div>
    );
  }

  const showAnswer = picked != null;

  return (
    <div className="rounded-2xl border border-primary bg-primary-soft p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-primary inline-flex items-center gap-2">
          <Headphones size={14} aria-hidden /> 최소 대조쌍 ({cursor + 1}/{sequence.length})
        </p>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="text-success font-semibold">{score.correct}</span>
          <span>/</span>
          <span className="text-accent font-semibold">{score.wrong}</span>
          <span className="text-muted">({accuracy}%)</span>
          <button
            type="button"
            onClick={exit}
            className="inline-flex items-center gap-1 rounded-full bg-surface text-fg border border-divider text-xs font-semibold px-3 py-1.5"
            aria-label="종료"
          >
            <Square size={12} aria-hidden /> 종료
          </button>
        </div>
      </div>

      <div className="text-center space-y-2">
        <p className="text-xs text-muted">들리는 글자의 성조를 고르세요</p>
        <button
          type="button"
          onClick={() => play(round.answer.word)}
          className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary text-white shadow"
          aria-label="다시 듣기"
        >
          {played ? <Play size={26} aria-hidden /> : <Play size={26} aria-hidden />}
        </button>
        <p className="text-[11px] text-muted">탭하여 다시 듣기 · 무성조 키: <b className="text-fg">{round.options[0] && stripped(round.options[0].pinyin)}</b></p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="대조쌍 보기">
        {round.options.map((opt, i) => {
          const isAnswer = opt.word === round.answer.word;
          const isPicked = picked?.word === opt.word;
          const tabbable = showAnswer ? isAnswer : focusIdx === i;
          return (
            <button
              key={opt.vocabId}
              ref={(el) => { choiceRefs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={isPicked}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => select(opt, i)}
              onKeyDown={(e) => onChoiceKeyDown(e, i)}
              disabled={showAnswer}
              aria-label={`보기 ${i + 1}: ${opt.word}`}
              className={cn(
                'rounded-xl border px-3 py-3 text-center transition',
                !showAnswer && 'bg-surface border-divider text-fg hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary',
                showAnswer && isAnswer && 'bg-success/15 border-success',
                showAnswer && isPicked && !isAnswer && 'bg-accent/15 border-accent',
                showAnswer && !isAnswer && !isPicked && 'bg-surface border-divider opacity-60',
              )}
            >
              <p className="text-3xl font-bold text-fg" lang="zh-CN">{opt.word}</p>
              {showAnswer && (
                <>
                  <p className="text-pinyin font-pinyin text-sm mt-1">{opt.pinyin}</p>
                  <p className="text-xs text-muted mt-0.5">{opt.meaning}</p>
                </>
              )}
            </button>
          );
        })}
      </div>

      {showAnswer && (
        <div className="text-center">
          <div>
            {picked!.word === round.answer.word ? (
              <p className="text-success font-semibold inline-flex items-center gap-1 justify-center">
                <Check size={16} aria-hidden /> 정답!
              </p>
            ) : (
              <p className="text-accent font-semibold inline-flex items-center gap-1 justify-center">
                <X size={16} aria-hidden /> 오답 — 정답: <b className="text-fg ml-1" lang="zh-CN">{round.answer.word}</b>
                <span className="text-muted ml-1">({round.answer.pinyin})</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={nextRound}
            className="mt-5 inline-flex items-center gap-1 rounded-full bg-primary text-white font-semibold px-5 py-2"
          >
            <RotateCcw size={14} aria-hidden /> 다음 문제
          </button>
        </div>
      )}
    </div>
  );
}

function stripped(p: string): string {
  // UI 표시용 무성조 — 헬퍼는 lib/minimal-pairs의 stripTone과 동등하지만
  // 컴포넌트 안에서 매번 import하지 않도록 동일 매핑 인라인.
  const map: Record<string, string> = {
    ā: 'a', á: 'a', ǎ: 'a', à: 'a',
    ē: 'e', é: 'e', ě: 'e', è: 'e',
    ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
    ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
    ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
    ǖ: 'u', ǘ: 'u', ǚ: 'u', ǜ: 'u', ü: 'u',
  };
  return p.toLowerCase().split('').map((c) => map[c] ?? c).join('');
}
