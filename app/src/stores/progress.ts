/**
 * Per-lesson read progress.
 * `read` = user marked the lesson complete (Toc checkmark + Home counter).
 * `lastVisited` = ISO date for "Continue where you left off" CTA.
 */
import { create } from 'zustand';
import { dbGet, dbSet } from '@/lib/db';

export type LessonProgress = {
  read: boolean;
  lastVisited?: string; // ISO
};

export type ProgressState = {
  byId: Record<string, LessonProgress>;
  lastLessonId: string | null;
  hydrated: boolean;

  markRead: (id: string, read: boolean) => void;
  visit: (id: string) => void;
  hydrate: () => Promise<void>;
};

const DB_KEY = 'progress:v1';

async function persist(state: { byId: ProgressState['byId']; lastLessonId: string | null }): Promise<void> {
  await dbSet(DB_KEY, state);
}

export const useProgress = create<ProgressState>((set, get) => ({
  byId: {},
  lastLessonId: null,
  hydrated: false,

  markRead: (id, read) => {
    const next = { ...get().byId, [id]: { ...(get().byId[id] ?? {}), read } };
    set({ byId: next });
    void persist({ byId: next, lastLessonId: get().lastLessonId });
  },

  visit: (id) => {
    const next = {
      ...get().byId,
      [id]: { ...(get().byId[id] ?? { read: false }), lastVisited: new Date().toISOString() },
    };
    set({ byId: next, lastLessonId: id });
    void persist({ byId: next, lastLessonId: id });
  },

  hydrate: async () => {
    const saved = await dbGet<{ byId: ProgressState['byId']; lastLessonId: string | null }>(DB_KEY);
    if (saved) set({ byId: saved.byId ?? {}, lastLessonId: saved.lastLessonId ?? null, hydrated: true });
    else set({ hydrated: true });
  },
}));

export function progressPercent(byId: Record<string, LessonProgress>, totalLessons: number): number {
  if (totalLessons === 0) return 0;
  const done = Object.values(byId).filter((p) => p.read).length;
  return Math.round((done / totalLessons) * 100);
}
