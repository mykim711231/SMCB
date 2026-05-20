/**
 * SRS for flashcards — Leitner 5-box + optional SM-2.
 *
 * Card id scheme (v3 — 콘텐츠 해시 기반):
 *   v:{vocabId}                       단어 카드           e.g. v:vol1_01_v1
 *   e:{vocabId}                       예문 카드           e.g. e:vol1_01_v1
 *   b:{lessonId}:h{hash}              성경 구절 카드      e.g. b:vol1_01:h1a2b3c4d
 *   d:{lessonId}:{dd|dg}:h{hash}      회화 라인 카드      e.g. d:vol1_01:dd:h1a2b3c4d
 *     - dd = dialogDaily(응용회화), dg = dialogGospel(전도회화)
 *   s:{lessonId}:h{hash}              실전 시나리오 카드  e.g. s:vol1_01:h1a2b3c4d
 *   키 생성기는 lib/flashcard-items.ts (verseCardId/dialogCardId/scenarioCardId).
 *
 * v1 호환: 접두어 없는 키(`vol1_01_v1`)는 hydrate 시 'v:' 접두어를 붙여 자동 마이그레이션.
 * v2 → v3: 인덱스 기반 b:/d:/s: 키는 buildIdMigrationPairs + migrateIds 로 1회
 *   rename. migrateIds 는 멱등 — 콘텐츠 로드 직후 호출하면 안전하게 반복 가능.
 *
 * Leitner box → 다음 복습 간격 (일):
 *   1 → 1, 2 → 3, 3 → 7, 4 → 14, 5 → 30
 * 4단계 채점 매핑 (Leitner):
 *   again → box 1 / hard → 그대로 / good → +1 / easy → +2
 *
 * SM-2 (4단계):
 *   again: reps=0, interval=1, ease -= 0.2
 *   hard : interval *= 1.2, ease -= 0.15
 *   good : reps==0→1, reps==1→6, else interval*=ease
 *   easy : interval *= ease * 1.3, ease += 0.15
 *   ease는 [1.3, 2.8]로 clamp.
 *
 * `newCardsByDate`: 새 카드(아직 한 번도 채점 안 된 카드)를 날짜별로 몇 장
 * 풀었는지 누적. Flashcards '복습 대상' 덱이 settings.fcDailyGoal(하루 새
 * 카드 한도)을 적용할 때 newCardsToday()로 오늘 소진량을 읽는다. 한도는
 * 새 카드에만 걸리고 복습 카드(이미 한 번 이상 채점된 카드)는 제한 없음.
 */
import { create } from 'zustand';
import { dbGet, dbSet } from '@/lib/db';

export type SRSBox = 1 | 2 | 3 | 4 | 5;
export type CardKind = 'vocab' | 'example' | 'verse' | 'dialog' | 'scenario';
export type SRSGrade = 'again' | 'hard' | 'good' | 'easy';
export type SRSAlgorithm = 'leitner' | 'sm2';

export type SRSCard = {
  id: string;
  box: SRSBox;
  ease: number;
  intervalDays: number;
  reps: number;
  due: string; // ISO
  correctCount: number;
  wrongCount: number;
  lastReviewedAt?: string;
};

export type DailyStat = { reviewed: number; correct: number };

export type SRSState = {
  cards: Record<string, SRSCard>;
  newCardsByDate: Record<string, number>;
  reviewsByDate: Record<string, DailyStat>;
  hydrated: boolean;

  ensure: (ids: string[]) => void;
  migrateIds: (pairs: Array<[string, string]>) => void;
  grade: (id: string, grade: SRSGrade, algorithm: SRSAlgorithm) => void;
  dueIds: (now?: Date) => string[];
  reset: (id: string) => void;
  resetAll: () => void;
  newCardsToday: () => number;
  reviewsToday: () => DailyStat;
  hydrate: () => Promise<void>;
};

const DB_KEY = 'srs:v2';
const DB_KEY_LEGACY = 'srs:v1';

const BOX_DAYS: Record<SRSBox, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function todayStr(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function cardKind(id: string): CardKind {
  if (id.startsWith('e:')) return 'example';
  if (id.startsWith('b:')) return 'verse';
  if (id.startsWith('d:')) return 'dialog';
  if (id.startsWith('s:')) return 'scenario';
  return 'vocab';
}

export function isNewCard(c: SRSCard | undefined): boolean {
  if (!c) return true;
  return !c.lastReviewedAt && c.correctCount === 0 && c.wrongCount === 0;
}

function normalizeId(id: string): string {
  if (
    id.startsWith('v:') ||
    id.startsWith('e:') ||
    id.startsWith('b:') ||
    id.startsWith('d:') ||
    id.startsWith('s:')
  ) return id;
  return `v:${id}`;
}

function newCard(id: string, now = new Date()): SRSCard {
  return {
    id,
    box: 1,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    reps: 0,
    due: now.toISOString(),
    correctCount: 0,
    wrongCount: 0,
  };
}

function applyLeitner(card: SRSCard, g: SRSGrade): { box: SRSBox; intervalDays: number; reps: number } {
  let box: SRSBox = card.box;
  let reps = card.reps;
  if (g === 'again') {
    box = 1;
    reps = 0;
  } else if (g === 'hard') {
    // keep box
  } else if (g === 'good') {
    box = Math.min(5, card.box + 1) as SRSBox;
    reps = card.reps + 1;
  } else {
    box = Math.min(5, card.box + 2) as SRSBox;
    reps = card.reps + 1;
  }
  return { box, intervalDays: BOX_DAYS[box], reps };
}

function applySM2(card: SRSCard, g: SRSGrade): { box: SRSBox; intervalDays: number; reps: number; ease: number } {
  let ease = card.ease;
  let reps = card.reps;
  let interval = card.intervalDays;

  if (g === 'again') {
    reps = 0;
    interval = 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
  } else if (g === 'hard') {
    interval = Math.max(1, Math.round((card.intervalDays || 1) * 1.2));
    ease = Math.max(MIN_EASE, ease - 0.15);
  } else if (g === 'good') {
    reps = card.reps + 1;
    if (card.reps === 0) interval = 1;
    else if (card.reps === 1) interval = 6;
    else interval = Math.max(1, Math.round((card.intervalDays || 1) * ease));
  } else {
    reps = card.reps + 1;
    if (card.reps === 0) interval = 4;
    else interval = Math.max(1, Math.round((card.intervalDays || 1) * ease * 1.3));
    ease = Math.min(MAX_EASE, ease + 0.15);
  }

  // Map interval (days) to a Leitner-like box for the per-card badge display.
  let box: SRSBox = 1;
  if (interval >= 30) box = 5;
  else if (interval >= 14) box = 4;
  else if (interval >= 7) box = 3;
  else if (interval >= 3) box = 2;
  return { box, intervalDays: interval, reps, ease };
}

async function persist(state: {
  cards: SRSState['cards'];
  newCardsByDate: SRSState['newCardsByDate'];
  reviewsByDate: SRSState['reviewsByDate'];
}): Promise<void> {
  await dbSet(DB_KEY, state);
}

export const useSRS = create<SRSState>((set, get) => ({
  cards: {},
  newCardsByDate: {},
  reviewsByDate: {},
  hydrated: false,

  ensure: (ids) => {
    const cur = get().cards;
    let mutated = false;
    const next = { ...cur };
    for (const rawId of ids) {
      const id = normalizeId(rawId);
      if (!next[id]) {
        next[id] = newCard(id);
        mutated = true;
      }
    }
    if (mutated) {
      set({ cards: next });
      void persist({ cards: next, newCardsByDate: get().newCardsByDate, reviewsByDate: get().reviewsByDate });
    }
  },

  /**
   * v2(인덱스) → v3(해시) 카드 ID rename. 각 쌍 [oldId, newId] 에 대해
   * oldId 카드를 newId 로 옮기고 oldId 는 제거한다.
   *  - newId 가 비어 있거나 아직 새 카드면 oldId 의 학습 기록으로 덮어쓴다.
   *  - newId 에 이미 실제 기록이 있으면(다른 경로에서 먼저 채점됨) 보존한다.
   * 멱등 — oldId 가 제거되므로 재호출해도 no-op. 콘텐츠 로드 후 매번 호출 가능.
   */
  migrateIds: (pairs) => {
    const cur = get().cards;
    const next = { ...cur };
    let mutated = false;
    for (const [oldId, newId] of pairs) {
      if (oldId === newId) continue;
      const old = next[oldId];
      if (!old) continue;
      const existing = next[newId];
      if (!existing || (isNewCard(existing) && !isNewCard(old))) {
        next[newId] = { ...old, id: newId };
      }
      delete next[oldId];
      mutated = true;
    }
    if (mutated) {
      set({ cards: next });
      void persist({ cards: next, newCardsByDate: get().newCardsByDate, reviewsByDate: get().reviewsByDate });
    }
  },

  grade: (rawId, g, algorithm) => {
    const id = normalizeId(rawId);
    const cur = get().cards[id] ?? newCard(id);
    const wasNew = isNewCard(get().cards[id]);
    const now = new Date();

    const upd =
      algorithm === 'sm2' ? applySM2(cur, g) : { ...applyLeitner(cur, g), ease: cur.ease };

    const correct = g !== 'again';
    const updated: SRSCard = {
      ...cur,
      box: upd.box,
      intervalDays: upd.intervalDays,
      reps: upd.reps,
      ease: upd.ease,
      due: addDays(now, upd.intervalDays).toISOString(),
      correctCount: cur.correctCount + (correct ? 1 : 0),
      wrongCount: cur.wrongCount + (correct ? 0 : 1),
      lastReviewedAt: now.toISOString(),
    };

    const nextCards = { ...get().cards, [id]: updated };
    const k = todayStr(now);
    const nextDates = { ...get().newCardsByDate };
    if (wasNew) nextDates[k] = (nextDates[k] ?? 0) + 1;
    const nextReviews = { ...get().reviewsByDate };
    const today = nextReviews[k] ?? { reviewed: 0, correct: 0 };
    nextReviews[k] = {
      reviewed: today.reviewed + 1,
      correct: today.correct + (correct ? 1 : 0),
    };
    set({ cards: nextCards, newCardsByDate: nextDates, reviewsByDate: nextReviews });
    void persist({ cards: nextCards, newCardsByDate: nextDates, reviewsByDate: nextReviews });
  },

  dueIds: (now = new Date()) => {
    const ms = now.getTime();
    return Object.values(get().cards)
      .filter((c) => new Date(c.due).getTime() <= ms)
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((c) => c.id);
  },

  reset: (rawId) => {
    const id = normalizeId(rawId);
    const next = { ...get().cards };
    delete next[id];
    set({ cards: next });
    void persist({ cards: next, newCardsByDate: get().newCardsByDate, reviewsByDate: get().reviewsByDate });
  },

  resetAll: () => {
    set({ cards: {}, newCardsByDate: {}, reviewsByDate: {} });
    void persist({ cards: {}, newCardsByDate: {}, reviewsByDate: {} });
  },

  newCardsToday: () => {
    return get().newCardsByDate[todayStr()] ?? 0;
  },

  reviewsToday: () => {
    return get().reviewsByDate[todayStr()] ?? { reviewed: 0, correct: 0 };
  },

  hydrate: async () => {
    const v2 = await dbGet<{
      cards: SRSState['cards'];
      newCardsByDate?: SRSState['newCardsByDate'];
      reviewsByDate?: SRSState['reviewsByDate'];
    }>(DB_KEY);
    if (v2 && v2.cards) {
      set({
        cards: v2.cards,
        newCardsByDate: v2.newCardsByDate ?? {},
        reviewsByDate: v2.reviewsByDate ?? {},
        hydrated: true,
      });
      return;
    }
    // v1 → v2 migration: prefix bare vocab ids with 'v:' and fill SM-2 defaults.
    const v1 = await dbGet<Record<string, Partial<SRSCard>>>(DB_KEY_LEGACY);
    if (v1) {
      const migrated: SRSState['cards'] = {};
      for (const [rawId, c] of Object.entries(v1)) {
        const id = normalizeId(rawId);
        const base = newCard(id);
        migrated[id] = {
          ...base,
          ...c,
          id,
          ease: c.ease ?? DEFAULT_EASE,
          intervalDays: c.intervalDays ?? (c.box ? BOX_DAYS[c.box as SRSBox] : 0),
          reps: c.reps ?? (c.correctCount ?? 0),
        };
      }
      set({ cards: migrated, newCardsByDate: {}, reviewsByDate: {}, hydrated: true });
      void persist({ cards: migrated, newCardsByDate: {}, reviewsByDate: {} });
      return;
    }
    set({ cards: {}, newCardsByDate: {}, reviewsByDate: {}, hydrated: true });
  },
}));

export { BOX_DAYS };
