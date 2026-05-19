/**
 * 4지선다 퀴즈 — 단어를 보고 뜻을 고르거나(中→韓), 뜻을 보고 단어를 고른다(韓→中).
 *
 * SentenceBuilder/MinimalPairs와 동일한 cursor 기반 진행 모델:
 *   - 입력 prompts(시드 셔플된 vocab 리스트)를 cursor++로 순회.
 *   - 각 문제마다 같은 풀에서 다른 vocab 답 3개를 distractor로 추출 (deterministic seed).
 *   - 답 선택 즉시 정/오답 표시 → "다음 문제".
 *   - cursor === prompts.length 시 세션 완료 화면(다시 시작/종료).
 *
 * 출제 대상: vocab만. 예문/구절은 4지선다 텍스트가 길어 부적합.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, RotateCcw, Square, ListChecks, Volume2 } from 'lucide-react';
import type { VocabEntry } from '@/types/lesson';
import { speak, stop as ttsStop, unlock, isSupported as ttsSupported } from '@/lib/tts';
import { shuffleSeeded, seedFromString } from '@/lib/sentence-builder';
import { cn } from '@/lib/cn';

export type Direction = 'zh2ko' | 'ko2zh';

export type McqPrompt = {
  vocab: VocabEntry;
  lessonId: string;
  lessonTitleKo: string;
};

type Props = {
  prompts: McqPrompt[];
  direction: Direction;
  ttsRate: number;
  ttsVoiceURI: string | null;
  onExit: () => void;
  /**
   * 정/오답 시 호출 — SRS 반영용.
   * rtMs: 카드 노출 → 답 선택까지 걸린 ms. SM-2의 hard/easy 추정 신호로 부모가 사용한다.
   * signalLen: 추정 정규화용 신호 길이(문자 수). 짧은 단어와 긴 문장을 같은 임계값으로 비교하지 않기 위해.
   */
  onResult?: (vocabId: string, correct: boolean, rtMs?: number, signalLen?: number) => void;
  /**
   * distractor 추출 풀. 주지 않으면 prompts로 fallback.
   * 오답 재투입 등 prompts가 작은 세션에서도 4지선다를 유지하려면 전체 vocab 풀을 넘긴다.
   */
  distractorPool?: McqPrompt[];
};

function questionText(v: VocabEntry, dir: Direction): string {
  return dir === 'zh2ko' ? v.word : v.meaning;
}
function answerText(v: VocabEntry, dir: Direction): string {
  return dir === 'zh2ko' ? v.meaning : v.word;
}

// pos 문자열에서 영문 품사 태그 + 한국어 "고유명사" 표시를 set으로 추출.
// 예: "[동사, 명사 (v. / n.)]" → {v., n.}, "[명사 (고유명사)]" → {n., 고유명사}
const POS_TAG_RE = /(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|m\.w\.|idiom|고유명사)/g;
function posTags(pos: string | undefined | null): Set<string> {
  if (!pos) return new Set();
  const matches = pos.match(POS_TAG_RE);
  return matches ? new Set(matches) : new Set();
}
function shareAnyTag(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function buildChoices(current: McqPrompt, pool: McqPrompt[], dir: Direction): string[] {
  const expected = answerText(current.vocab, dir);
  // 정답 카드와 같은 단서(question)를 공유하는 vocab은 distractor에서 제외.
  // 예: ko2zh 모드 단서 "감사하다" → 정답 谢谢 / pool에 感谢도 존재 시 사용자가 감사를
  // 다 알고 있어도 어느 한쪽만 정답이 되어 SRS wrongCount 누적. 데이터에 동의어/이형
  // 표기 22+쌍이 확인됨(천국 天堂/天国, 만약 若/如果, 축복 祝福 변형 등) → 화면에
  // 같은 단서로 두 카드가 동시 노출되지 않도록 차단.
  const currentQuestion = questionText(current.vocab, dir);
  const currentTags = posTags(current.vocab.pos);
  // 같은 POS 후보(samePos)와 그 외(other)를 분리.
  // 명사 단서에 명사 distractor를 모으면 "단서가 한국어 뜻 → 보기가 모두 한자"일 때
  // 단순히 "한자 1개 = 명사" 같은 표면 패턴만 보고 답할 수 없게 되어 신뢰도가 올라간다.
  // (적대적 검토 #6 — 의미·POS 유사도 distractor)
  const samePos: string[] = [];
  const other: string[] = [];
  const seen = new Set<string>([expected]);
  for (const p of pool) {
    if (p.vocab.id === current.vocab.id) continue;
    if (questionText(p.vocab, dir) === currentQuestion) continue;
    const t = answerText(p.vocab, dir);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    if (shareAnyTag(currentTags, posTags(p.vocab.pos))) samePos.push(t);
    else other.push(t);
  }
  const seed = seedFromString(`mcq:${current.vocab.id}:${dir}`);
  // 같은 POS에서 먼저 채우고 부족하면 그 외에서 보충 (deterministic).
  const samePicked = shuffleSeeded(samePos, seed).slice(0, 3);
  const need = 3 - samePicked.length;
  const otherPicked = need > 0 ? shuffleSeeded(other, seed).slice(0, need) : [];
  const distractors = [...samePicked, ...otherPicked];
  return shuffleSeeded([expected, ...distractors], seed);
}

export default function McqGame({ prompts, direction, ttsRate, ttsVoiceURI, onExit, onResult, distractorPool }: Props): JSX.Element {
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  // ARIA APG Radio Pattern: roving tabindex — 현재 포커스 인덱스. 화살표 키로 이동.
  // picked이 정해지면 picked의 인덱스로 고정(체크된 항목에 포커스 유지).
  const [focusIdx, setFocusIdx] = useState(0);
  const choiceRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // 카드 노출 시각 — select 시점에 RT 계산. cursor 전환마다 갱신.
  const shownAtRef = useRef<number>(performance.now());
  // SentenceBuilder와 동일한 deferred-grade 패턴 —
  // select() 즉시 onResult 를 호출하면 부모 store mutation 으로 prompts 가 reshuffle 되어
  // current.id 가 바뀌고, useEffect([cursor]) 가 다시 돌면서 picked 가 초기화되어
  // 정답 패널이 사라지는 회귀를 막는다. 결과는 ref 에 보관 후 next()/exit() 에서 flush.
  const pendingResultRef = useRef<{ id: string; correct: boolean; rtMs?: number; signalLen?: number } | null>(null);

  const current = prompts[cursor];
  const pool = distractorPool && distractorPool.length >= 4 ? distractorPool : prompts;
  const choices = useMemo(
    () => (current ? buildChoices(current, pool, direction) : []),
    [current, pool, direction],
  );

  // 카드 전환·방향 전환 시 선택 초기화 + RT 타이머 리셋 + 포커스 인덱스 리셋
  useEffect(() => {
    setPicked(null);
    setFocusIdx(0);
    shownAtRef.current = performance.now();
  }, [cursor, direction]);
  useEffect(() => () => { ttsStop(); }, []);

  // ARIA APG Radio Pattern: focusIdx 변경 시 해당 라디오 버튼에 포커스 이동.
  // 라디오그룹은 roving tabindex 패턴이라 항상 하나만 tabbable이며, 그 항목이 visual focus도 보유.
  useEffect(() => {
    const btn = choiceRefs.current[focusIdx];
    // 라디오그룹 안에 이미 포커스가 있을 때만 따라 이동(외부 요소에 포커스를 빼앗지 않도록).
    if (btn && document.activeElement && choiceRefs.current.includes(document.activeElement as HTMLButtonElement)) {
      btn.focus();
    }
  }, [focusIdx]);

  const play = useCallback(() => {
    if (!current || !ttsSupported()) return;
    unlock();
    ttsStop();
    speak(current.vocab.word, { rate: ttsRate, voiceURI: ttsVoiceURI ?? undefined });
  }, [current, ttsRate, ttsVoiceURI]);

  const select = (opt: string, idx?: number): void => {
    if (picked != null || !current) return;
    setPicked(opt);
    if (typeof idx === 'number') setFocusIdx(idx);
    const ok = opt === answerText(current.vocab, direction);
    setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
    const rtMs = Math.max(0, performance.now() - shownAtRef.current);
    // 신호 길이: 단어 자체의 문자 수 — 한국어 뜻 길이는 임계값 비례화에 부적합
    // (예: "축복" 2자 vs "축복하다(동사)" 가 임계값 차이를 만들면 안 된다).
    // 단어를 보고 뜻을 회상하든 뜻을 보고 단어를 회상하든, 회상 대상은 항상 단어이므로
    // 단어 길이로 통일한다.
    const signalLen = current.vocab.word.length;
    pendingResultRef.current = { id: current.vocab.id, correct: ok, rtMs, signalLen };
  };

  // ARIA APG Radio Pattern keydown 처리:
  //   - Arrow keys: 라디오그룹 내 포커스 순환 이동
  //   - Home/End: 처음/마지막 옵션으로 이동
  //   - Space/Enter: 선택 (button 기본 동작이라 별도 처리 불필요)
  //   - 숫자키 1-4: 직접 선택 (한 번에 답 가능)
  //   - Enter (답변 후): 다음 문제로 이동
  const onChoiceKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number): void => {
    const n = choices.length;
    if (n === 0) return;
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

  const flushPendingResult = (): void => {
    const pending = pendingResultRef.current;
    pendingResultRef.current = null;
    if (pending) onResult?.(pending.id, pending.correct, pending.rtMs, pending.signalLen);
  };
  const next = (): void => { flushPendingResult(); setCursor((c) => c + 1); };
  const restart = (): void => { pendingResultRef.current = null; setCursor(0); setScore({ correct: 0, wrong: 0 }); setPicked(null); };
  const exit = (): void => { ttsStop(); flushPendingResult(); onExit(); };

  // 전역 단축키: 입력 필드 아님 + 모달 아님일 때만 동작.
  //   - 1-4: 해당 보기 선택 (한 손으로 연속 풀이 가능)
  //   - Enter: 답변 직후라면 다음 문제로 이동
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // 입력 중일 때는 단축키 무시 (textarea, input, contentEditable)
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Enter' && picked != null) {
        e.preventDefault();
        next();
        return;
      }
      if (picked != null) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
        e.preventDefault();
        const opt = choices[n - 1];
        if (opt != null) select(opt, n - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, picked]);

  if (prompts.length === 0) {
    return (
      <div className="rounded-2xl border border-divider bg-surface p-6 text-center space-y-3">
        <p className="text-fg font-semibold">출제할 단어가 없습니다.</p>
        <p className="text-sm text-muted">레슨 범위를 넓혀 단어가 4개 이상 포함되도록 선택해 주세요.</p>
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

  const expected = answerText(current.vocab, direction);
  const answered = picked != null;
  const ok = answered && picked === expected;
  const total = score.correct + score.wrong;
  const acc = total === 0 ? 0 : Math.round((score.correct / total) * 100);
  const labels = ['A', 'B', 'C', 'D'];

  return (
    <div className="rounded-2xl border border-primary bg-primary-soft p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-primary inline-flex items-center gap-2">
          <ListChecks size={14} aria-hidden /> 4지선다 ({cursor + 1}/{prompts.length})
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

      <div className="rounded-xl bg-surface border border-divider px-4 py-3 text-center">
        <p className="text-[10px] text-muted uppercase tracking-wider">
          단어 · {current.lessonTitleKo} · {direction === 'zh2ko' ? '中→韓' : '韓→中'}
        </p>
        {direction === 'zh2ko' ? (
          <>
            <p className="mt-2 text-4xl font-bold text-fg" lang="zh-CN">{questionText(current.vocab, direction)}</p>
            <button
              type="button"
              onClick={play}
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary font-semibold"
              aria-label="발음 듣기"
            >
              <Volume2 size={12} aria-hidden /> 듣기
            </button>
          </>
        ) : (
          <p className="mt-2 text-2xl font-semibold text-fg">{questionText(current.vocab, direction)}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="보기 선택">
        {choices.map((opt, i) => {
          const isExpected = opt === expected;
          const isPicked = picked === opt;
          // ko2zh: 보기가 중국어 — 스크린리더 발음을 위해 lang="zh-CN"
          const optIsZh = direction === 'ko2zh';
          // roving tabindex: 선택 전엔 focusIdx에 한 명만 tabbable.
          // 답변 후엔 라디오그룹을 키보드 트랩에서 빼주기 위해 정답에 tabbable 한 명 유지.
          const tabbable = answered ? isExpected : focusIdx === i;
          return (
            <button
              key={`${opt}-${i}`}
              ref={(el) => { choiceRefs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={isPicked}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => select(opt, i)}
              onKeyDown={(e) => onChoiceKeyDown(e, i)}
              disabled={answered}
              aria-label={`보기 ${i + 1}: ${opt}`}
              className={cn(
                'rounded-xl border px-4 py-3 text-left text-base font-medium transition',
                !answered && 'bg-surface border-divider text-fg hover:border-primary cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary',
                answered && isExpected && 'bg-success/15 border-success text-fg',
                answered && isPicked && !isExpected && 'bg-accent/15 border-accent text-fg line-through',
                answered && !isExpected && !isPicked && 'bg-surface border-divider text-muted opacity-60',
              )}
            >
              <span className="mr-2 inline-block w-5 text-center text-xs text-muted font-bold" aria-hidden>{labels[i] ?? '·'}</span>
              <span lang={optIsZh ? 'zh-CN' : undefined}>{opt}</span>
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="rounded-xl bg-surface border border-divider px-4 py-3 space-y-2">
          {ok ? (
            <p className="text-success font-semibold inline-flex items-center gap-1">
              <Check size={16} aria-hidden /> 정답!
            </p>
          ) : (
            <p className="text-accent font-semibold inline-flex items-center gap-1">
              <X size={16} aria-hidden /> 오답
            </p>
          )}
          <div className="space-y-1 text-sm">
            <p className="text-fg">
              <b className="text-2xl" lang="zh-CN">{current.vocab.word}</b>
              {' · '}
              <span className="text-pinyin font-pinyin">{current.vocab.pinyin}</span>
            </p>
            <p className="text-fg">{current.vocab.meaning}</p>
            {current.vocab.hanjaNote && <p className="text-xs text-muted">{current.vocab.hanjaNote}</p>}
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
