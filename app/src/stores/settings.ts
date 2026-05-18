/**
 * App-wide settings: theme, font size, visibility toggles, TTS prefs.
 * Persisted to IndexedDB via idb-keyval — survives reload + offline.
 */
import { create } from 'zustand';
import { dbGet, dbSet } from '@/lib/db';

export type Theme = 'light' | 'dark' | 'system';
export type FontSize = 'md' | 'lg' | 'xl';

export type SettingsState = {
  theme: Theme;
  fontSize: FontSize;
  showHanzi: boolean;
  showPinyin: boolean;
  showKorean: boolean;
  ttsRate: number; // 0.6 – 1.4
  ttsVoiceURI: string | null;
  hydrated: boolean;

  setTheme: (t: Theme) => void;
  setFontSize: (s: FontSize) => void;
  toggleHanzi: () => void;
  togglePinyin: () => void;
  toggleKorean: () => void;
  setTTSRate: (n: number) => void;
  setTTSVoiceURI: (uri: string | null) => void;
  hydrate: () => Promise<void>;
};

const DB_KEY = 'settings:v1';

const DEFAULTS = {
  theme: 'system' as Theme,
  fontSize: 'md' as FontSize,
  showHanzi: true,
  showPinyin: true,
  showKorean: true,
  ttsRate: 0.95,
  ttsVoiceURI: null as string | null,
};

type Persisted = Omit<SettingsState, 'hydrated' | 'setTheme' | 'setFontSize' | 'toggleHanzi' | 'togglePinyin' | 'toggleKorean' | 'setTTSRate' | 'setTTSVoiceURI' | 'hydrate'>;

async function persist(s: Persisted): Promise<void> {
  await dbSet(DB_KEY, {
    theme: s.theme,
    fontSize: s.fontSize,
    showHanzi: s.showHanzi,
    showPinyin: s.showPinyin,
    showKorean: s.showKorean,
    ttsRate: s.ttsRate,
    ttsVoiceURI: s.ttsVoiceURI,
  });
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  setTheme: (t) => { set({ theme: t }); void persist({ ...get(), theme: t }); applyTheme(t); applyFontSize(get().fontSize); },
  setFontSize: (s) => { set({ fontSize: s }); void persist({ ...get(), fontSize: s }); applyFontSize(s); },
  toggleHanzi: () => { const v = !get().showHanzi; set({ showHanzi: v }); void persist({ ...get(), showHanzi: v }); },
  togglePinyin: () => { const v = !get().showPinyin; set({ showPinyin: v }); void persist({ ...get(), showPinyin: v }); },
  toggleKorean: () => { const v = !get().showKorean; set({ showKorean: v }); void persist({ ...get(), showKorean: v }); },
  setTTSRate: (n) => { set({ ttsRate: n }); void persist({ ...get(), ttsRate: n }); },
  setTTSVoiceURI: (uri) => { set({ ttsVoiceURI: uri }); void persist({ ...get(), ttsVoiceURI: uri }); },

  hydrate: async () => {
    const saved = await dbGet<Persisted>(DB_KEY);
    if (saved) {
      set({ ...saved, hydrated: true });
      applyTheme(saved.theme);
      applyFontSize(saved.fontSize);
    } else {
      set({ hydrated: true });
      applyTheme(get().theme);
      applyFontSize(get().fontSize);
    }
  },
}));

// DOM side-effects — kept here so any setter applies the class.
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
}

export function applyFontSize(size: FontSize): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('fontsize-lg', 'fontsize-xl');
  if (size === 'lg') root.classList.add('fontsize-lg');
  else if (size === 'xl') root.classList.add('fontsize-xl');
}

// React to system theme changes when `theme === 'system'`.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const t = useSettings.getState().theme;
    if (t === 'system') applyTheme(t);
  });
}
