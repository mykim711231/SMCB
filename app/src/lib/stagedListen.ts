/**
 * 단계 듣기 (/learn?mode=staged) — 영역별 단계 계획.
 *
 * 같은 문장을 그냥 여러 번 듣는 대신, 단계마다 목적(떠올리기 → 이해 → 성조 →
 * 따라 말하기 → 글자 없이 → 확인)을 두고 화면 도움을 단계적으로 줄인다.
 * 자료 성격이 달라 영역별로 계획을 나눈다.
 *
 *   - 단어          : 소리-뜻 연결·성조. 짧아서 4단계면 충분.
 *   - 예문·회화·시나리오 : 실제로 말할 문장. 따라 말하기 중심 7단계.
 *   - 성경 구절      : 외워 말하기. 먼저 뜻을 이해한 뒤 글자를 걷어 내는 5단계.
 *   - 본문          : 길고 문어체. 따라 말하기보다 듣고 이해하기 4단계.
 *   - 4글자 이하 문장(회화 짧은 응답 등)은 단어 계획을 쓴다.
 */
import type { CardSource } from './flashcard-items';
import { speakTextOf } from './flashcard-items';

/** 화면 표시: 소리만 / 전체(한자·병음·뜻) / 한자+병음 / 한자만 */
export type StageShow = 'none' | 'all' | 'hzpy' | 'hz';
/** 재생 후 대기: 짧게 / 떠올릴 시간 / 따라 말할 시간(문장 길이 비례) */
export type StageWait = 'short' | 'recall' | 'shadow';

export type Stage = {
  label: string;
  show: StageShow;
  /** 느린 속도(설정 속도 x SLOW_FACTOR) */
  slow?: boolean;
  wait: StageWait;
  /** 대기 후 전체 문장을 잠깐 보여 주는 정답 확인 단계 */
  reveal?: boolean;
};

export type StagePlan = {
  key: 'word' | 'sentence' | 'verse' | 'body';
  name: string;
  goal: string;
  stages: Stage[];
  /** 나눠 듣기: stages[0, splitAt) 을 전체 목록으로 한 바퀴, 나머지를 다시 한 바퀴 */
  splitAt: number;
  /** '다시 듣기' 표시 문장을 목록 끝에서 다시 들을 때 시작 단계 */
  retryFrom: number;
};

export const SLOW_FACTOR = 0.8;
export const WAIT_SHORT_MS = 800;
export const WAIT_RECALL_MS = 2000;
export const REVEAL_MS = 2500;
export const CARD_GAP_MS = 1000;

/** 따라 말할 시간 — 재생 시간의 1.2배 + 여유, 1.5~15초 */
export function shadowWaitMs(speakMs: number): number {
  return Math.min(15000, Math.max(1500, Math.round(speakMs * 1.2) + 300));
}

export const PLAN_WORD: StagePlan = {
  key: 'word',
  name: '단어',
  goal: '소리와 뜻을 잇고 성조를 익혀요',
  stages: [
    { label: '떠올리기', show: 'none', wait: 'recall' },
    { label: '확인', show: 'all', slow: true, wait: 'short' },
    { label: '따라 말하기', show: 'hzpy', wait: 'shadow' },
    { label: '글자 없이', show: 'none', wait: 'shadow', reveal: true },
  ],
  splitAt: 2,
  retryFrom: 2,
};

export const PLAN_SENTENCE: StagePlan = {
  key: 'sentence',
  name: '예문 · 회화 · 시나리오',
  goal: '실제로 말할 수 있게 따라 말하기를 반복해요',
  stages: [
    { label: '들어보기', show: 'none', wait: 'short' },
    { label: '이해', show: 'all', slow: true, wait: 'short' },
    { label: '성조', show: 'hzpy', slow: true, wait: 'shadow' },
    { label: '따라 말하기', show: 'hzpy', wait: 'shadow' },
    { label: '한자만', show: 'hz', wait: 'shadow' },
    { label: '글자 없이', show: 'none', wait: 'shadow' },
    { label: '확인', show: 'none', wait: 'shadow', reveal: true },
  ],
  splitAt: 3,
  retryFrom: 3,
};

export const PLAN_VERSE: StagePlan = {
  key: 'verse',
  name: '성경 구절',
  goal: '뜻을 이해한 뒤 글자를 걷어 내며 외워 말해요',
  stages: [
    { label: '이해', show: 'all', slow: true, wait: 'short' },
    { label: '성조', show: 'hzpy', slow: true, wait: 'shadow' },
    { label: '따라 말하기', show: 'hzpy', wait: 'shadow' },
    { label: '한자만', show: 'hz', wait: 'shadow' },
    { label: '외워 말하기', show: 'none', wait: 'shadow', reveal: true },
  ],
  splitAt: 2,
  retryFrom: 2,
};

export const PLAN_BODY: StagePlan = {
  key: 'body',
  name: '본문',
  goal: '길고 문어체라 따라 말하기보다 듣고 이해하기에 집중해요',
  stages: [
    { label: '들어보기', show: 'none', wait: 'short' },
    { label: '이해', show: 'all', wait: 'short' },
    { label: '글자 보며 듣기', show: 'hz', wait: 'short' },
    { label: '글자 없이', show: 'none', wait: 'short', reveal: true },
  ],
  splitAt: 2,
  retryFrom: 2,
};

/** 화면 안내용 — 영역 키 → 계획 */
export const AREA_PLAN: Record<'body' | 'vocab' | 'example' | 'bible' | 'dialog' | 'scenario', StagePlan> = {
  body: PLAN_BODY,
  vocab: PLAN_WORD,
  example: PLAN_SENTENCE,
  bible: PLAN_VERSE,
  dialog: PLAN_SENTENCE,
  scenario: PLAN_SENTENCE,
};

const HAN_RE = /[㐀-鿿]/g;

export function planOf(card: CardSource): StagePlan {
  if (card.kind === 'vocab') return PLAN_WORD;
  if (card.kind === 'verse') return PLAN_VERSE;
  if (card.kind === 'body') return PLAN_BODY;
  const han = (speakTextOf(card).match(HAN_RE) ?? []).length;
  if (han > 0 && han <= 4) return PLAN_WORD;
  return PLAN_SENTENCE;
}

/** 재생 순서 한 칸: 카드 index + 계획 안의 단계 index */
export type Step = { ci: number; si: number; retry?: boolean };

export function buildQueue(cards: CardSource[], split: boolean): Step[] {
  if (!split) {
    return cards.flatMap((c, ci) => planOf(c).stages.map((_, si) => ({ ci, si })));
  }
  const first: Step[] = [];
  const second: Step[] = [];
  cards.forEach((c, ci) => {
    const p = planOf(c);
    p.stages.forEach((_, si) => (si < p.splitAt ? first : second).push({ ci, si }));
  });
  return [...first, ...second];
}

export function buildRetry(cards: CardSource[], marked: Iterable<number>): Step[] {
  const out: Step[] = [];
  for (const ci of [...marked].sort((a, b) => a - b)) {
    const c = cards[ci];
    if (!c) continue;
    const p = planOf(c);
    for (let si = p.retryFrom; si < p.stages.length; si++) out.push({ ci, si, retry: true });
  }
  return out;
}
