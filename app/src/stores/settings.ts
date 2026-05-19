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

/**
 * 음성 재생 방식.
 *  - null     : 아직 선택하지 않음 (Home 상단 OnboardingCard 노출)
 *  - device   : 기기 음성 — 단말기 TTS만 사용 (매니페스트 mp3 우회)
 *               데이터 사용량이 적고 기기 음성팩이 잘 설치된 환경에 적합.
 *  - recorded : 녹음 음성 — 미리 녹음된 mp3 우선 (manifest miss는 단말기 TTS로 fallback)
 *               오프라인 안정성·음질 일관성을 우선할 때. 첫 진입 시 일괄 다운로드 권유.
 *
 * 라벨링 결정: "일반/어르신" 같은 사용자 분류 대신 기능 자체로 표기한다 —
 * 어떤 분이든 어색함 없이 선택할 수 있도록. 모드는 글자크기/속도/autoplay에
 * 영향 없음.
 */
export type UserMode = 'device' | 'recorded' | null;

/**
 * mp3 일괄 다운로드 상태.
 *  - idle : 시작 전
 *  - downloading : 진행 중 (ttsBulkProgress 참조)
 *  - done : 전부 캐시 성공
 *  - partial : 일부 실패 (네트워크 끊김 등) — 재시도 가능
 *  - skipped : "나중에" 선택 (Home 카드 닫힘, Settings에서 재시작 가능)
 */
export type TTSBulkStatus = 'idle' | 'downloading' | 'done' | 'partial' | 'skipped';

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
  // 사용 방식 + 음성 일괄 다운로드
  userMode: UserMode;
  ttsBulkStatus: TTSBulkStatus;
  ttsBulkProgress: { done: number; total: number };
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
  setUserMode: (m: UserMode) => void;
  setTTSBulkStatus: (s: TTSBulkStatus) => void;
  setTTSBulkProgress: (p: { done: number; total: number }) => void;
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
  userMode: null as UserMode,
  ttsBulkStatus: 'idle' as TTSBulkStatus,
  ttsBulkProgress: { done: 0, total: 0 } as { done: number; total: number },
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
  | 'setUserMode' | 'setTTSBulkStatus' | 'setTTSBulkProgress'
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
    userMode: s.userMode,
    ttsBulkStatus: s.ttsBulkStatus,
    ttsBulkProgress: s.ttsBulkProgress,
  };
}

async function persist(s: SettingsState): Promise<void> {
  await dbSet(DB_KEY, pickPersisted(s));
}

// 구버전 userMode 값('general'/'senior') → 신버전('device'/'recorded') 매핑.
// 라벨 변경(어르신 → 녹음 음성)으로 enum이 바뀌었지만 IDB에 남은 옛 값이
// 타입 가드를 통과하지 못해 UI가 깨지지 않도록 hydrate에서 한 번 정규화한다.
function migrateUserMode<T extends { userMode: unknown }>(s: T): T {
  const v = s.userMode as string | null | undefined;
  if (v === 'general') return { ...s, userMode: 'device' };
  if (v === 'senior') return { ...s, userMode: 'recorded' };
  if (v === 'device' || v === 'recorded' || v === null) return s;
  return { ...s, userMode: null };
}

// 진행률(setTTSBulkProgress)은 2,534건 동안 매번 fire 되므로
// IDB write를 1초 throttle한다. 마지막 값은 setTTSBulkStatus(done|partial) 시
// 함께 persist되므로 누락 없음.
let progressPersistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersistProgress(get: () => SettingsState): void {
  if (progressPersistTimer) return;
  progressPersistTimer = setTimeout(() => {
    progressPersistTimer = null;
    void persist(get());
  }, 1000);
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
  setUserMode: (m) => { set({ userMode: m }); void persist({ ...get(), userMode: m }); },
  setTTSBulkStatus: (s) => { set({ ttsBulkStatus: s }); void persist({ ...get(), ttsBulkStatus: s }); },
  setTTSBulkProgress: (p) => {
    // 진행률은 매 청크마다 갱신되므로 persist는 1초당 1회로 throttle.
    set({ ttsBulkProgress: p });
    schedulePersistProgress(get);
  },

  hydrate: async () => {
    const v2 = await dbGet<Partial<Persisted>>(DB_KEY);
    if (v2) {
      const merged = migrateUserMode({ ...DEFAULTS, ...v2 });
      set({ ...merged, hydrated: true });
      applyTheme(merged.theme);
      applyFontSize(merged.fontSize);
      void persist({ ...get(), ...merged } as SettingsState);
      return;
    }
    const v1 = await dbGet<Partial<Persisted>>(DB_KEY_LEGACY);
    if (v1) {
      const merged = migrateUserMode({ ...DEFAULTS, ...v1 });
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
