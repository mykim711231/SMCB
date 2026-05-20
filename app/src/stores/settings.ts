/**
 * App-wide settings: theme, font size, visibility toggles, TTS prefs, flashcards.
 * Persisted to IndexedDB via idb-keyval — survives reload + offline.
 *
 * 키 버전: settings:v2 (v1에서 자동 마이그레이션, 신규 플래시카드 필드 기본값 채움)
 */
import { create } from 'zustand';
import { dbGet, dbSet } from '@/lib/db';
import { stop as stopTTS, setVoiceModeProvider } from '@/lib/tts';
import type { SRSAlgorithm } from '@/stores/srs';

export type Theme = 'light' | 'dark' | 'system';
export type FontSize = 'md' | 'lg' | 'xl';

export type FlashcardDirection = 'zh2ko' | 'ko2zh' | 'mixed';
export type FlashcardGrades = 2 | 4;
export type FlashcardCardTypes = {
  vocab: boolean;
  example: boolean;
  verse: boolean;
  dialog: boolean;
  scenario: boolean;
};

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
  /** Per-character pinyin ruby (Naver/Pagoda style). Requires both hanzi+pinyin on. */
  rubyPinyin: boolean;
  // TTS
  ttsRate: number;
  ttsVoiceURI: string | null;
  // 플래시카드
  fcAlgorithm: SRSAlgorithm;
  fcGrades: FlashcardGrades;
  fcDirection: FlashcardDirection;
  fcAutoplay: boolean;
  fcCardTypes: FlashcardCardTypes;
  /**
   * 최소 대조쌍 듣기 게임에서 발음표(lesson.pronunciation) 단음절도 풀에 포함할지.
   * default false — 기본은 vocab만. 발음 변별을 더 폭넓게 연습하고 싶을 때 켠다.
   * pron 항목은 SRS 카드가 없어 그레이딩되지 않고 게임 풀에만 들어간다.
   */
  fcPronInPairs: boolean;
  /**
   * 부록1(中文基督教词汇表)의 80+ 기독교 용어를 Flashcards/Quiz 학습 풀에 포함할지.
   * default false — 65과의 본 vocab만 우선. 켜면 부록 vocab도 SRS 카드(lessonId="appendix1")로
   * 동일하게 그레이딩되어 통상 학습 흐름에 합류한다.
   */
  fcAppendixVocab: boolean;
  // 마라톤 모드 (Learn/?mode=marathon)
  /** 마라톤 재생 대상 영역. 권/과 순서로 모아 zh를 순차 재생한다. */
  marathonAreas: { body: boolean; vocab: boolean; example: boolean; bible: boolean; dialog: boolean; scenario: boolean };
  /** 마라톤 화면에서 한자/병음/한국어 표시 여부. TTS는 항상 zh로 재생. */
  marathonShow: { zh: boolean; pinyin: boolean; ko: boolean };
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
  toggleRubyPinyin: () => void;
  setTTSRate: (n: number) => void;
  setTTSVoiceURI: (uri: string | null) => void;
  setFcAlgorithm: (a: SRSAlgorithm) => void;
  setFcGrades: (g: FlashcardGrades) => void;
  setFcDirection: (d: FlashcardDirection) => void;
  setFcAutoplay: (b: boolean) => void;
  setFcCardTypes: (t: FlashcardCardTypes) => void;
  setFcPronInPairs: (b: boolean) => void;
  setFcAppendixVocab: (b: boolean) => void;
  setMarathonAreas: (a: SettingsState['marathonAreas']) => void;
  setMarathonShow: (s: SettingsState['marathonShow']) => void;
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
  rubyPinyin: true,
  ttsRate: 0.95,
  ttsVoiceURI: null as string | null,
  fcAlgorithm: 'leitner' as SRSAlgorithm,
  fcGrades: 2 as FlashcardGrades,
  fcDirection: 'zh2ko' as FlashcardDirection,
  fcAutoplay: false,
  fcCardTypes: { vocab: true, example: true, verse: true, dialog: true, scenario: true } as FlashcardCardTypes,
  fcPronInPairs: true,
  fcAppendixVocab: true,
  marathonAreas: { body: true, vocab: true, example: true, bible: true, dialog: true, scenario: true },
  marathonShow: { zh: true, pinyin: true, ko: true },
  userMode: null as UserMode,
  ttsBulkStatus: 'idle' as TTSBulkStatus,
  ttsBulkProgress: { done: 0, total: 0 } as { done: number; total: number },
};

type Persisted = Omit<
  SettingsState,
  | 'hydrated'
  | 'setTheme' | 'setFontSize'
  | 'toggleHanzi' | 'togglePinyin' | 'toggleKorean' | 'toggleRubyPinyin'
  | 'setTTSRate' | 'setTTSVoiceURI'
  | 'setFcAlgorithm' | 'setFcGrades' | 'setFcDirection' | 'setFcAutoplay'
  | 'setFcCardTypes'
  | 'setFcPronInPairs' | 'setFcAppendixVocab'
  | 'setMarathonAreas' | 'setMarathonShow'
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
    rubyPinyin: s.rubyPinyin,
    ttsRate: s.ttsRate,
    ttsVoiceURI: s.ttsVoiceURI,
    fcAlgorithm: s.fcAlgorithm,
    fcGrades: s.fcGrades,
    fcDirection: s.fcDirection,
    fcAutoplay: s.fcAutoplay,
    fcCardTypes: s.fcCardTypes,
    fcPronInPairs: s.fcPronInPairs,
    fcAppendixVocab: s.fcAppendixVocab,
    marathonAreas: s.marathonAreas,
    marathonShow: s.marathonShow,
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

// 다운로드 중 앱이 종료/탭이 닫혔다면 다음 hydrate 시 'downloading'이 남아 있다.
// 이 상태는 UX상 영원히 "받는 중"으로 보이는 stale 상태이므로 'skipped'로 정규화.
// 진행률은 그대로 보존(부분 완료 표시).
function normalizeBulkStatus<T extends { ttsBulkStatus: unknown }>(s: T): T {
  const v = s.ttsBulkStatus as string | undefined;
  if (v === 'downloading') return { ...s, ttsBulkStatus: 'skipped' };
  return s;
}

/**
 * R8: 부팅 시 SW의 tts-audio 캐시가 실제로 채워져 있는지 비동기로 검증한다.
 *
 * 시나리오:
 *   - ttsBulkStatus === 'done'으로 IDB에 기록돼 있지만, 사용자가 브라우저
 *     데이터 청소 / Workbox 캐시 만료(R7에서 10년으로 늘렸으나 SW 교체
 *     시 generateSW의 cacheId 변경으로 cache invalidation 가능) / OS 캐시
 *     wipe 로 SW 캐시가 비었거나 크게 줄어든 상태가 될 수 있다.
 *   - 이 상태로 두면 RecordedAudioMissingBanner가 'done'을 신뢰해 노출되지
 *     않고, 사용자는 오프라인에서 묵음을 만나게 된다.
 *
 * 방식:
 *   - hydrate 종료 후 fire-and-forget으로 caches.keys()를 훑어
 *     'tts-audio'를 포함하는 캐시의 entry 수를 센다.
 *   - ttsBulkProgress.total의 80% 미만이면 'partial'로 다운그레이드한다.
 *     (소량 evict는 LRU 정상 동작이므로 80%면 충분히 보수적인 임계값.)
 *   - PWA 미지원 환경(caches 없음)/SW 미활성화 시에는 검증 자체를 skip — 기록은 그대로.
 */
async function validateBulkCache(state: SettingsState): Promise<void> {
  if (state.ttsBulkStatus !== 'done') return;
  if (typeof caches === 'undefined') return;
  const total = state.ttsBulkProgress?.total ?? 0;
  if (total === 0) return; // 기록은 done인데 total=0 → 검증할 게 없으므로 패스.
  try {
    const names = await caches.keys();
    const ttsCacheName = names.find((n) => n.includes('tts-audio'));
    if (!ttsCacheName) {
      // 'done'으로 기록됐는데 SW가 캐시를 만들지 못한 경우 — partial로.
      useSettings.setState({ ttsBulkStatus: 'partial' });
      void persist({ ...useSettings.getState() });
      return;
    }
    const cache = await caches.open(ttsCacheName);
    const keys = await cache.keys();
    if (keys.length < Math.floor(total * 0.8)) {
      useSettings.setState({
        ttsBulkStatus: 'partial',
        ttsBulkProgress: { done: keys.length, total },
      });
      void persist({ ...useSettings.getState() });
    }
  } catch {
    /* ignore — 검증은 best-effort */
  }
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
  toggleRubyPinyin: () => { const v = !get().rubyPinyin; set({ rubyPinyin: v }); void persist({ ...get(), rubyPinyin: v }); },
  setTTSRate: (n) => { set({ ttsRate: n }); void persist({ ...get(), ttsRate: n }); },
  setTTSVoiceURI: (uri) => { set({ ttsVoiceURI: uri }); void persist({ ...get(), ttsVoiceURI: uri }); },

  setFcAlgorithm: (a) => { set({ fcAlgorithm: a }); void persist({ ...get(), fcAlgorithm: a }); },
  setFcGrades: (g) => { set({ fcGrades: g }); void persist({ ...get(), fcGrades: g }); },
  setFcDirection: (d) => { set({ fcDirection: d }); void persist({ ...get(), fcDirection: d }); },
  setFcAutoplay: (b) => { set({ fcAutoplay: b }); void persist({ ...get(), fcAutoplay: b }); },
  setFcCardTypes: (t) => {
    // 모든 종류가 꺼지면 학습 불가 → vocab을 강제로 켜는 안전 가드.
    const anyOn = t.vocab || t.example || t.verse || t.dialog || t.scenario;
    const safe: FlashcardCardTypes = anyOn
      ? t
      : { vocab: true, example: false, verse: false, dialog: false, scenario: false };
    set({ fcCardTypes: safe });
    void persist({ ...get(), fcCardTypes: safe });
  },
  setFcPronInPairs: (b) => { set({ fcPronInPairs: b }); void persist({ ...get(), fcPronInPairs: b }); },
  setFcAppendixVocab: (b) => { set({ fcAppendixVocab: b }); void persist({ ...get(), fcAppendixVocab: b }); },
  setMarathonAreas: (a) => {
    // 모든 영역이 꺼지면 풀이 비어 진행이 막힘 → 본문을 강제로 켜는 안전 가드.
    const anyOn = a.body || a.vocab || a.example || a.bible || a.dialog || a.scenario;
    const safe = anyOn ? a : { ...a, body: true };
    set({ marathonAreas: safe });
    void persist({ ...get(), marathonAreas: safe });
  },
  setMarathonShow: (s2) => { set({ marathonShow: s2 }); void persist({ ...get(), marathonShow: s2 }); },
  setUserMode: (m) => {
    // 모드 전환 시 진행 중인 음성/오디오를 즉시 종료한다.
    //   - 직전 utterance가 살아남아 새 모드와 다른 경로에서 끝나면
    //     onEnd/onError가 잘못된 모드 컨텍스트에서 발화한다.
    //   - tts.stop()은 epoch를 증가시켜 in-flight 비동기도 무효화한다.
    if (get().userMode !== m) {
      try { stopTTS(); } catch { /* ignore */ }
    }
    set({ userMode: m });
    void persist({ ...get(), userMode: m });
  },
  setTTSBulkStatus: (s) => { set({ ttsBulkStatus: s }); void persist({ ...get(), ttsBulkStatus: s }); },
  setTTSBulkProgress: (p) => {
    // 진행률은 매 청크마다 갱신되므로 persist는 1초당 1회로 throttle.
    set({ ttsBulkProgress: p });
    schedulePersistProgress(get);
  },

  hydrate: async () => {
    const v2 = await dbGet<Partial<Persisted>>(DB_KEY);
    if (v2) {
      const merged = normalizeBulkStatus(migrateUserMode({ ...DEFAULTS, ...v2 }));
      set({ ...merged, hydrated: true });
      applyTheme(merged.theme);
      applyFontSize(merged.fontSize);
      void persist({ ...get(), ...merged } as SettingsState);
      void validateBulkCache(get());
      return;
    }
    const v1 = await dbGet<Partial<Persisted>>(DB_KEY_LEGACY);
    if (v1) {
      const merged = normalizeBulkStatus(migrateUserMode({ ...DEFAULTS, ...v1 }));
      set({ ...merged, hydrated: true });
      applyTheme(merged.theme);
      applyFontSize(merged.fontSize);
      void persist({ ...get(), ...merged } as SettingsState);
      void validateBulkCache(get());
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

// tts 모듈에 사용자 모드 공급자 등록.
//   - 호출자(Flashcards/Hanzi/Mcq/SentenceBuilder/MinimalPairs/Marathon/Help 등)가
//     opts.voiceMode를 빠뜨려도 speak()/prefetchAudio()가 현재 userMode로 fall back.
//   - userMode === null (아직 미선택)이면 null을 돌려보내 tts.ts의 default('recorded')로
//     동작 — OnboardingCard 노출 중 임시 재생이 발생해도 mp3 우선 안전 경로.
setVoiceModeProvider(() => {
  const m = useSettings.getState().userMode;
  return m === 'device' || m === 'recorded' ? m : null;
});

// React to system theme changes when `theme === 'system'`.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const t = useSettings.getState().theme;
    if (t === 'system') applyTheme(t);
  });
}
