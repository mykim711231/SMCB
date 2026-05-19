/**
 * Starred vocab and bible-quote items (per lesson, per item index).
 * Composite key format: `${lessonId}::${kind}::${index}`.
 */
import { create } from 'zustand';
import { dbGet, dbSet } from '@/lib/db';

export type FavoriteKind =
  | 'vocab'
  | 'vocabExample'
  | 'bible'
  | 'dialogDaily'
  | 'dialogGospel'
  | 'scenario';

export type FavoritesState = {
  items: Record<string, true>;
  hydrated: boolean;
  toggle: (key: string) => void;
  has: (key: string) => boolean;
  list: () => string[];
  hydrate: () => Promise<void>;
};

const DB_KEY = 'favorites:v1';

export function favKey(lessonId: string, kind: FavoriteKind, indexOrId: string | number): string {
  return `${lessonId}::${kind}::${indexOrId}`;
}

async function persist(items: Record<string, true>): Promise<void> {
  await dbSet(DB_KEY, items);
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  items: {},
  hydrated: false,

  toggle: (key) => {
    const next = { ...get().items };
    if (next[key]) delete next[key];
    else next[key] = true;
    set({ items: next });
    void persist(next);
  },

  has: (key) => Boolean(get().items[key]),

  list: () => Object.keys(get().items),

  hydrate: async () => {
    const saved = await dbGet<Record<string, true>>(DB_KEY);
    set({ items: saved ?? {}, hydrated: true });
  },
}));
