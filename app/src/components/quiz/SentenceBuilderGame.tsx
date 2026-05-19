/**
 * 문장 조립 퀴즈 — 한국어 단서를 보고 중국어 단어 토큰을 순서대로 탭하여 정답을 만든다.
 *
 * Duolingo의 word bank UX를 개선:
 *   - 답안 영역의 토큰을 탭하면 즉시 풀로 복귀 (Duolingo는 마지막부터만 제거 가능했던 비판 → 어디서든 즉시 제거)
 *   - 정답 확인 후에는 정답 병음·한국어가 함께 표시
 *
 * Intl.Segmenter('zh', 'word')로 단어 단위 분할 → 한 글자 분할보다 자연스러운 학습 단위.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, RotateCcw, Square, ArrowLeftRight, Volume2, Eye } from 'lucide-react';
import {
  type SentencePrompt,
  tokenizeChinese,
  makeDistractorTokens,
  shuffleSeeded,
  seedFromString,
  gradeAnswer,
} from '@/lib/sentence-builder';
import { speak, stop as ttsStop, unlock, isSupported as ttsSupported } from '@/lib/tts';
import { cn } from '@/lib/cn';

type Props = {
  prompts: SentencePrompt[];
  ttsRate: number;
  ttsVoiceURI: string | null;
  onExit: () => void;
  /**
   * 정/오답 시 호출 — 부모(Quiz)가 prompt.id로 SRS 매핑 가능 여부 판단.
   * rtMs: 카드 노출 → submit/skip까지 ms. SM-2 4단계 추정 신호.
   * signalLen: 정답 zh 문자 수 — 길이 보정으로 짧은 단어와 긴 문장을 같은 임계값으로 비교하지 않기 위해.
   */
  onResult?: (promptId: string, correct: boolean, rtMs?: number, signalLen?: number) => void;
  /**
   * distractor 토큰 추출 풀. 주지 않으면 prompts로 fallback.
   * 오답 재투입 등 prompts가 작은 세션에서도 토큰 다양성을 유지하려면 전체 prompts 풀을 넘긴다.
   */
  tokenPool?: SentencePrompt[];
};

type Token = { id: string; text: string };

function buildBank(p: SentencePrompt, allZh: string[]): { answer: Token[]; bank: Token[] } {
  const answerWords = tokenizeChinese(p.zh);
  const seed = seedFromString(p.id);
  // 거짓 토큰 수: 정답 토큰 수의 30% (최소 1, 최대 4)
  const distractCount = Math.min(4, Math.max(1, Math.round(answerWords.length * 0.3)));
  const distractors = makeDistractorTokens(answerWords, allZh, distractCount, seed);

  const answer: Token[] = answerWords.map((w, i) => ({ id: `a:${i}`, text: w }));
  const bank: Token[] = shuffleSeeded(
    [...answer, ...distractors.map((w, i) => ({ id: `d:${i}`, text: w }))],
    seed,
  );
  return { answer, bank };
}

export default function SentenceBuilderGame({ prompts, ttsRate, ttsVoiceURI, onExit, onResult, tokenPool }: Props): JSX.Element {
  const allZh = useMemo(
    () => (tokenPool && tokenPool.length > prompts.length ? tokenPool : prompts).map((p) => p.zh),
    [tokenPool, prompts],
  );
  const [cursor, setCursor] = useState(0);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [revealed, setRevealed] = useState(false);
  const [hinted, setHinted] = useState(false);
  // 카드 노출 시각 — submit/skip 시점에 RT 계산.
  const shownAtRef = useRef<number>(performance.now());

  const current = prompts[cursor];
  const { answer, bank } = useMemo(
    () => (current ? buildBank(current, allZh) : { answer: [], bank: [] }),
    [current, allZh],
  );

  // 사용자 선택: bank 토큰의 id 시퀀스
  const [picked, setPicked] = useState<Token[]>([]);
  const [remaining, setRemaining] = useState<Token[]>(bank);

  // 카드 전환 시 상태 리셋 + RT 타이머 리셋
  useEffect(() => {
    setPicked([]);
    setRemaining(bank);
    setRevealed(false);
    setHinted(false);
    shownAtRef.current = performance.now();
  }, [bank]);

  useEffect(() => () => { ttsStop(); }, []);

  const play = useCallback(() => {
    if (!current || !ttsSupported()) return;
    unlock();
    ttsStop();
    speak(current.zh, { rate: ttsRate, voiceURI: ttsVoiceURI ?? undefined });
  }, [current, ttsRate, ttsVoiceURI]);

  const pickToken = (t: Token): void => {
    if (revealed) return;
    setPicked((arr) => [...arr, t]);
    setRemaining((arr) => arr.filter((x) => x.id !== t.id));
  };
  const unpickToken = (t: Token): void => {
    if (revealed) return;
    setPicked((arr) => arr.filter((x) => x.id !== t.id));
    setRemaining((arr) => [...arr, t]);
  };
  const clearPicked = (): void => {
    if (revealed) return;
    setRemaining((arr) => [...arr, ...picked]);
    setPicked([]);
  };

  const submit = (): void => {
    if (revealed || picked.length === 0) return;
    const result = gradeAnswer(answer.map((t) => t.text), picked.map((t) => t.text));
    setScore((s) => ({
      correct: s.correct + (result.correct ? 1 : 0),
      wrong: s.wrong + (result.correct ? 0 : 1),
    }));
    setRevealed(true);
    if (current) {
      const rtMs = Math.max(0, performance.now() - shownAtRef.current);
      onResult?.(current.id, result.correct, rtMs, current.zh.length);
    }
    if (result.correct) {
      // 정답일 때만 자동 음성 재생 (학습 강화)
      window.setTimeout(() => play(), 250);
    }
  };

  const skip = (): void => {
    setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    setRevealed(true);
    // 건너뛰기는 RT 신호 의미 없음 — rtMs 없이 호출 → 자동으로 'again'(SM-2)/wrong(Leitner) 처리
    if (current) onResult?.(current.id, false);
  };

  const next = (): void => {
    setCursor((c) => c + 1);
  };

  const restart = (): void => {
    setCursor(0);
    setScore({ correct: 0, wrong: 0 });
  };

  const exit = (): void => { ttsStop(); onExit(); };

  if (prompts.length === 0) {
    return (
      <div className="rounded-2xl border border-divider bg-surface p-6 text-center space-y-3">
        <p className="text-fg font-semibold">조립할 문장이 없습니다.</p>
        <p className="text-sm text-muted">레슨 필터를 확인하거나 더 많은 회화·예문이 포함된 과를 선택하세요.</p>
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

  const sessionEnded = cursor >= prompts.length;
  if (sessionEnded) {
    const total = score.correct + score.wrong;
    const acc = total === 0 ? 0 : Math.round((score.correct / total) * 100);
    return (
      <div className="rounded-2xl border border-divider bg-surface p-6 text-center space-y-3">
        <p className="text-fg font-semibold">세션 완료!</p>
        <p className="text-sm text-muted">정답 {score.correct} · 오답 {score.wrong} ({acc}%)</p>
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

  const total = score.correct + score.wrong;
  const acc = total === 0 ? 0 : Math.round((score.correct / total) * 100);
  const correct = revealed
    ? gradeAnswer(answer.map((t) => t.text), picked.map((t) => t.text)).correct
    : false;

  return (
    <div className="rounded-2xl border border-primary bg-primary-soft p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-primary inline-flex items-center gap-2">
          <ArrowLeftRight size={14} aria-hidden /> 문장 조립 ({cursor + 1}/{prompts.length})
        </p>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="text-success font-semibold">{score.correct}</span>
          <span>/</span>
          <span className="text-accent font-semibold">{score.wrong}</span>
          <span className="text-muted">({acc}%)</span>
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

      {/* 한국어 단서 */}
      <div className="rounded-xl bg-surface border border-divider px-4 py-3">
        <p className="text-[10px] text-muted uppercase tracking-wider">
          {current.source === 'dialog' ? '회화' : current.source === 'example' ? '예문' : '구절'}
          {current.speakers ? ` · ${current.speakers}` : ''}
          {' · '}{current.lessonTitleKo}
        </p>
        <p className="mt-1 text-lg font-semibold text-fg">{current.ko}</p>
        {hinted && !revealed && (
          <p className="text-pinyin font-pinyin text-sm mt-2 text-muted">{current.pinyin}</p>
        )}
      </div>

      {/* 답안 영역 (탭하여 제거) */}
      <div
        className="min-h-[64px] rounded-xl border-2 border-dashed border-divider bg-surface p-2 flex flex-wrap gap-2"
        aria-label="답안 영역"
      >
        {picked.length === 0 ? (
          <span className="text-sm text-muted self-center mx-auto">아래 단어를 탭하여 문장을 만드세요</span>
        ) : picked.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => unpickToken(t)}
            disabled={revealed}
            className={cn(
              'rounded-lg px-3 py-2 text-base font-semibold border bg-primary text-white border-primary',
              revealed && correct && 'bg-success border-success',
              revealed && !correct && 'bg-accent border-accent',
            )}
            aria-label={`답안에서 ${t.text} 제거`}
            lang="zh-CN"
          >
            {t.text}
          </button>
        ))}
      </div>

      {/* 토큰 풀 */}
      <div className="rounded-xl bg-surface/60 p-2 flex flex-wrap gap-2 min-h-[64px]" aria-label="단어 풀">
        {remaining.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pickToken(t)}
            disabled={revealed}
            className="rounded-lg border border-divider bg-surface text-fg px-3 py-2 text-base font-semibold hover:border-primary disabled:opacity-40"
            aria-label={`${t.text} 추가`}
            lang="zh-CN"
          >
            {t.text}
          </button>
        ))}
        {remaining.length === 0 && (
          <span className="text-xs text-muted self-center mx-auto">모든 단어 사용</span>
        )}
      </div>

      {/* 컨트롤 */}
      {!revealed && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearPicked}
              disabled={picked.length === 0}
              className="rounded-full border border-divider bg-surface text-fg text-xs font-semibold px-3 py-1.5 disabled:opacity-40"
            >
              지우기
            </button>
            <button
              type="button"
              onClick={() => setHinted(true)}
              disabled={hinted}
              className="rounded-full border border-divider bg-surface text-muted text-xs font-semibold px-3 py-1.5 inline-flex items-center gap-1 disabled:opacity-40"
              aria-label="병음 힌트"
            >
              <Eye size={12} aria-hidden /> 힌트
            </button>
            <button
              type="button"
              onClick={skip}
              className="rounded-full border border-divider bg-surface text-muted text-xs font-semibold px-3 py-1.5"
            >
              건너뛰기
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={picked.length === 0}
            className="rounded-full bg-primary text-white font-semibold px-5 py-2 text-sm disabled:opacity-40"
          >
            정답 확인
          </button>
        </div>
      )}

      {/* 결과 */}
      {revealed && (
        <div className="rounded-xl bg-surface border border-divider px-4 py-3 space-y-2">
          {correct ? (
            <p className="text-success font-semibold inline-flex items-center gap-1">
              <Check size={16} aria-hidden /> 정답!
            </p>
          ) : (
            <p className="text-accent font-semibold inline-flex items-center gap-1">
              <X size={16} aria-hidden /> 오답
            </p>
          )}
          <div className="space-y-1">
            <p className="text-fg text-lg font-semibold" lang="zh-CN">{current.zh}</p>
            <p className="text-pinyin font-pinyin text-sm text-muted">{current.pinyin}</p>
            <p className="text-fg text-sm">{current.ko}</p>
          </div>
          <div className="flex items-center justify-between pt-2 gap-2">
            <button
              type="button"
              onClick={play}
              className="rounded-full border border-divider bg-surface text-fg text-xs font-semibold px-3 py-1.5 inline-flex items-center gap-1"
              aria-label="발음 듣기"
            >
              <Volume2 size={12} aria-hidden /> 듣기
            </button>
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-primary text-white font-semibold px-5 py-2 text-sm"
            >
              다음 문제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
