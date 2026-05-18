/**
 * Leitner 5-box SRS for flashcards.
 *
 *   Box 1 → 1 day, Box 2 → 3, Box 3 → 7, Box 4 → 14, Box 5 → 30
 *
 * Correct answer ⇒ promote (max 5). Wrong ⇒ demote to Box 1.
 * `due` is an ISO date string. A card is due when due <= now.
 *
 * Cards are keyed by vocab id (vol{N}_{NN}_v{M}).
 * Deck is built lazily from loadAllLessons() on the Flashcards page.
 */
import { create } from 'zustand';
import { dbGet, dbSet } from '@/lib/db';

export type SRSBox = 1 | 2 | 3 | 4 | 5;

export type SRSCard = {
  id: string;
  box: SRSBox;
  due: string; // ISO
  correctCount: number;
  wrongCount: number;
  lastReviewedAt?: string;
};

export type SRSState = {
  cards: Record<string, SRSCard>;
  hydrated: boolean;
  ensure: (ids: string[]) => void;
  grade: (id: string, correct: boolean) => void;
  dueIds: (now?: Date) => string[];
  reset: (id: string) => void;
  resetAll: () => void;
  hydrate: () => Promise<void>;
};

const DB_KEY = 'srs:v1';
const BOX_DAYS: Record<SRSBox, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function newCard(id: string, now = new Date()): SRSCard {
  return {
    id,
    box: 1,
    due: now.toISOString(), // due immediately
    correctCount: 0,
    wrongCount: 0,
  };
}

async function persist(cards: SRSState['cards']): Promise<void> {
  await dbSet(DB_KEY, cards);
}

export const useSRS = create<SRSState>((set, get) => ({
  cards: {},
  hydrated: false,

  ensure: (ids) => {
    const cur = get().cards;
    let mutated = false;
    const next = { ...cur };
    for (const id of ids) {
      if (!next[id]) {
        next[id] = newCard(id);
        mutated = true;
      }
    }
    if (mutated) {
      set({ cards: next });
      void persist(next);
    }
  },

  grade: (id, correct) => {
    const cur = get().cards[id] ?? newCard(id);
    const now = new Date();
    let box: SRSBox = cur.box;
    if (correct) box = Math.min(5, cur.box + 1) as SRSBox;
    else box = 1;
    const updated: SRSCard = {
      ...cur,
      box,
      due: addDays(now, BOX_DAYS[box]).toISOString(),
      correctCount: cur.correctCount + (correct ? 1 : 0),
      wrongCount: cur.wrongCount + (correct ? 0 : 1),
      lastReviewedAt: now.toISOString(),
    };
    const next = { ...get().cards, [id]: updated };
    set({ cards: next });
    void persist(next);
  },

  dueIds: (now = new Date()) => {
    const ms = now.getTime();
    return Object.values(get().cards)
      .filter((c) => new Date(c.due).getTime() <= ms)
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((c) => c.id);
  },

  reset: (id) => {
    const next = { ...get().cards };
    delete next[id];
    set({ cards: next });
    void persist(next);
  },

  resetAll: () => {
    set({ cards: {} });
    void persist({});
  },

  hydrate: async () => {
    const saved = await dbGet<SRSState['cards']>(DB_KEY);
    set({ cards: saved ?? {}, hydrated: true });
  },
}));

export { BOX_DAYS };
