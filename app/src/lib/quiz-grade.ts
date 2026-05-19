/**
 * 퀴즈 응답을 SRS 4단계 grade로 추정.
 *
 * 배경 — Flashcards는 사용자가 again/hard/good/easy를 직접 누른다.
 * 퀴즈(MCQ/문장 조립/대조쌍)는 정/오답이 자동 채점되므로 boolean 신호만 존재한다.
 * 이를 그대로 SM-2에 흘려보내면 hard/easy 경로가 영원히 호출되지 않아 ease factor 자기조정이
 * 무의미해진다. 응답 시간(RT)을 보조 신호로 사용해 4단계로 분기한다.
 *
 * Leitner는 4단계 분기의 의미가 작고(box ±1/±2 차이뿐) 정확도 신호가 더 중요하므로
 * 기존 boolean → good/again 매핑을 유지한다. SM-2일 때만 RT 기반 추정을 적용.
 *
 * RT 임계값은 신호 길이(글자 수)에 비례 — 짧은 단어 "爱"와 긴 예문 "我们感谢神的恩典"을
 * 같은 절대 임계값으로 비교하면 후자는 항상 '느림'으로 분류된다.
 *
 * 정직성 주의 — 이는 휴리스틱이지 사용자가 선언한 난이도가 아니다. 신호가 약한 만큼
 * 폭은 보수적으로(easy 컷오프는 빡빡하게, hard 컷오프는 너그럽게) 잡는다.
 */
import type { SRSAlgorithm, SRSGrade } from '@/stores/srs';

/** 글자 수 기반 RT 임계값(ms). 너무 짧은 신호도 최소 보장. */
const FAST_PER_CHAR_MS = 600;
const SLOW_PER_CHAR_MS = 1800;
const FAST_MIN_MS = 1500;
const SLOW_MIN_MS = 6000;

export type EstimateInput = {
  correct: boolean;
  rtMs?: number;
  /** 신호 길이(보통 표시되는 문자열의 문자 수). 0 또는 미정이면 길이 보정 없이 최소값만 적용. */
  signalLen?: number;
  algorithm: SRSAlgorithm;
};

/**
 * RT + correct → 4단계 SRSGrade 추정.
 * - Leitner: correct → good, wrong → again (기존 동작 유지)
 * - SM-2: wrong → again
 *         correct + RT < fast → easy
 *         correct + RT > slow → hard
 *         그 외 correct → good
 *   RT 없으면 correct → good (보수적 fallback)
 */
export function estimateGrade({ correct, rtMs, signalLen = 0, algorithm }: EstimateInput): SRSGrade {
  if (!correct) return 'again';
  if (algorithm !== 'sm2') return 'good';
  if (typeof rtMs !== 'number' || rtMs <= 0) return 'good';

  const fast = Math.max(FAST_MIN_MS, signalLen * FAST_PER_CHAR_MS);
  const slow = Math.max(SLOW_MIN_MS, signalLen * SLOW_PER_CHAR_MS);

  if (rtMs < fast) return 'easy';
  if (rtMs > slow) return 'hard';
  return 'good';
}
