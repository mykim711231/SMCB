/**
 * App-wide settings: theme, font size, visibility toggles, TTS prefs, flashcards.
 * Persisted to IndexedDB via idb-keyval — survives reload + offline.
 *
 * 키 버전: settings:v2 (v1에서 자동 마이그레이션, 신규 플래시카드 필드 기본값 채움)
 */
import { create } from 'zustand';
import { dbGet, dbSet } from '@/lib/db';
import type { SRSAlgorithm } from '@/stores/srs';

export type Theme = 'light' | 'dark' | 'system';
export type FontSize = 'md' | 'lg' | 'xl';

export type FlashcardDirection = 'zh2ko' | 'ko2zh' | 'mixed';
export type FlashcardGrades = 2 | 4;
export type FlashcardCardTypes = { vocab: boolean; example: boolean; verse: boolean };

export type SettingsState = {
  // 화면
  theme: Theme;
  fontSize: FontSize;
  showHanzi: boolean;
  showPinyin: boolean;
  showKorean: boolean;
  // TTS
  ttsRate: number;
  ttsVoiceURI: string | null;
  // 플래시카드
  fcAlgorithm: SRSAlgorithm;
  fcGrades: FlashcardGrades;
  fcDirection: FlashcardDirection;
  fcAutoplay: boolean;
  fcCardTypes: FlashcardCardTypes;
  fcDailyGoal: number; // 일일 학습 목표 카드 수 (0 = 비활성)
  fcAudioMarathon: boolean;
  hydrated: boolean;

  setTheme: (t: Theme) => void;
  setFontSize: (s: FontSize) => void;
  toggleHanzi: () => void;
  togglePinyin: () => void;
  toggleKorean: () => void;
  setTTSRate: (n: number) => void;
  setTTSVoiceURI: (uri: string | null) => void;
  setFcAlgorithm: (a: SRSAlgorithm) => void;
  setFcGrades: (g: FlashcardGrades) => void;
  setFcDirection: (d: FlashcardDirection) => void;
  setFcAutoplay: (b: boolean) => void;
  setFcCardTypes: (t: FlashcardCardTypes) => void;
  setFcDailyGoal: (n: number) => void;
  setFcAudioMarathon: (b: boolean) => void;
  hydrate: () => Promise<void>;
};

const DB_KEY = 'settings:v2';
const DB_KEY_LEGACY = 'settings:v1';

const DEFAULTS = {
  theme: 'system' as Theme,
  fontSize: 'md' as FontSize,
  showHanzi: true,
  showPinyin: true,
  showKorean: true,
  ttsRate: 0.95,
  ttsVoiceURI: null as string | null,
  fcAlgorithm: 'leitner' as SRSAlgorithm,
  fcGrades: 2 as FlashcardGrades,
  fcDirection: 'zh2ko' as FlashcardDirection,
  fcAutoplay: false,
  fcCardTypes: { vocab: true, example: false, verse: false } as FlashcardCardTypes,
  fcDailyGoal: 20,
  fcAudioMarathon: false,
};

type Persisted = Omit<
  SettingsState,
  | 'hydrated'
  | 'setTheme' | 'setFontSize'
  | 'toggleHanzi' | 'togglePinyin' | 'toggleKorean'
  | 'setTTSRate' | 'setTTSVoiceURI'
  | 'setFcAlgorithm' | 'setFcGrades' | 'setFcDirection' | 'setFcAutoplay'
  | 'setFcCardTypes' | 'setFcDailyGoal'
  | 'setFcAudioMarathon'
  | 'hydrate'
>;

function pickPersisted(s: SettingsState): Persisted {
  return {
    theme: s.theme,
    fontSize: s.fontSize,
    showHanzi: s.showHanzi,
    showPinyin: s.showPinyin,
    showKorean: s.showKorean,
    ttsRate: s.ttsRate,
    ttsVoiceURI: s.ttsVoiceURI,
    fcAlgorithm: s.fcAlgorithm,
    fcGrades: s.fcGrades,
    fcDirection: s.fcDirection,
    fcAutoplay: s.fcAutoplay,
    fcCardTypes: s.fcCardTypes,
    fcDailyGoal: s.fcDailyGoal,
    fcAudioMarathon: s.fcAudioMarathon,
  };
}

async function persist(s: SettingsState): Promise<void> {
  await dbSet(DB_KEY, pickPersisted(s));
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

  setFcAlgorithm: (a) => { set({ fcAlgorithm: a }); void persist({ ...get(), fcAlgorithm: a }); },
  setFcGrades: (g) => { set({ fcGrades: g }); void persist({ ...get(), fcGrades: g }); },
  setFcDirection: (d) => { set({ fcDirection: d }); void persist({ ...get(), fcDirection: d }); },
  setFcAutoplay: (b) => { set({ fcAutoplay: b }); void persist({ ...get(), fcAutoplay: b }); },
  setFcCardTypes: (t) => {
    const safe: FlashcardCardTypes = (!t.vocab && !t.example && !t.verse)
      ? { vocab: true, example: false, verse: false }
      : t;
    set({ fcCardTypes: safe });
    void persist({ ...get(), fcCardTypes: safe });
  },
  setFcDailyGoal: (n) => { const v = Math.max(0, Math.floor(n)); set({ fcDailyGoal: v }); void persist({ ...get(), fcDailyGoal: v }); },
  setFcAudioMarathon: (b) => { set({ fcAudioMarathon: b }); void persist({ ...get(), fcAudioMarathon: b }); },

  hydrate: async () => {
    const v2 = await dbGet<Partial<Persisted>>(DB_KEY);
    if (v2) {
      const merged = { ...DEFAULTS, ...v2 };
      set({ ...merged, hydrated: true });
      applyTheme(merged.theme);
      applyFontSize(merged.fontSize);
      void persist({ ...get(), ...merged } as SettingsState);
      return;
    }
    const v1 = await dbGet<Partial<Persisted>>(DB_KEY_LEGACY);
    if (v1) {
      const merged = { ...DEFAULTS, ...v1 };
      set({ ...merged, hydrated: true });
      applyTheme(merged.theme);
      applyFontSize(merged.fontSize);
      void persist({ ...get(), ...merged } as SettingsState);
      return;
    }
    set({ hydrated: true });
    applyTheme(get().theme);
    applyFontSize(get().fontSize);
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
