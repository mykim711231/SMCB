/**
 * Web Speech API wrapper for Mandarin TTS.
 *
 * Quirks handled:
 *  - iOS Safari requires the first speak() to occur inside a user gesture
 *    (`unlock()`); subsequent calls then work without gesture.
 *  - voices may load asynchronously (Chrome fires `voiceschanged` later).
 *  - Some Android engines do not support `pause/resume` reliably — we
 *    expose stop() as the primary interrupt.
 *  - Long utterances on iOS sometimes cut off around the 200-char mark;
 *    callers should pass per-verse text rather than full paragraphs.
 *
 * 사전녹음 우선 경로:
 *  - zh-tts-manifest.json은 zh 원문 → 파일명 매핑이다.
 *  - 매니페스트 hit이면 /SMCB/tts/<file>을 <audio>로 재생한다.
 *    단말 음성팩 없음/iOS PWA 17.4↓/엔진 합성 품질 편차를 모두 우회.
 *  - 매니페스트 miss 또는 audio 재생 실패면 Web Speech로 fallback.
 *  - 빈 매니페스트({})로도 호환 동작: 호출은 즉시 Web Speech 경로로 빠짐.
 *  - 매니페스트 콘텐츠는 빌드/배포 외부에서 채운다 (Piper/Edge TTS/Azure 등).
 */
import ttsManifest from '@/data/zh-tts-manifest.json';

export type TTSStatus = 'idle' | 'speaking' | 'paused' | 'unsupported';

const ZH_LANGS = ['zh-CN', 'zh-Hans-CN', 'zh', 'cmn-Hans-CN'];

/**
 * 본토 중국어(zh-CN)·싱가포르(zh-SG)·간체(zh-Hans) 변종 식별 정규식.
 *
 * 사용처 (single source of truth):
 *  - pickMandarinVoice() 최종 fallback — zh-TW/zh-HK 변종으로 silent quality fail 방지
 *  - DeviceVoiceMissingBanner — only-zh-tw 분기 (본토 음성 미설치 경고)
 *
 * 본 교재는 보통화(普通话/zh-CN) 기준이라 zh-TW(번체/대만)·zh-HK(광동어) 음성으로
 * 재생하면 한자음·일부 어휘가 mismatch — 사용자는 "소리는 나는데 발음이 이상"하다고만
 * 느껴 무엇이 잘못됐는지 모르는 silent quality fail이 발생한다.
 */
export const ZH_CN_LIKE_RE = /^zh(-|_)?(cn|sg|hans)/i;

const TTS_MANIFEST = ttsManifest as Record<string, string>;
const TTS_BASE_URL = `${import.meta.env.BASE_URL}tts/`;

let unlocked = false;
let cachedZhVoice: SpeechSynthesisVoice | null = null;
let currentAudio: HTMLAudioElement | null = null;

// Cancellation epoch — speak()/stop() 시 매번 증가한다.
// 비동기 분기(awaitVoices, audio.onerror 재시도 등)에서 자신이 시작된
// epoch와 현재 epoch를 비교하여, stop()이 이후에 호출됐거나 다른 speak()로
// 대체됐다면 emit/fallback을 건너뛴다.
// 해결되는 race:
//   - 빠른 탭에서 첫 utterance의 fallback이 두 번째 utterance를 중첩 trigger
//   - awaitVoices 도착 시점에 사용자가 stop() — 그래도 language-unavailable이 발화
//   - userMode 변경 시 (settings.setUserMode → stop() 호출) 직전 speech가 살아남음
let speakEpoch = 0;

// Chrome/Edge 보이스 비동기 로드 워밍업.
//  - 일부 Chromium 엔진은 `voiceschanged` 리스너가 한 번이라도 붙어 있어야
//    실제로 이벤트를 발화한다. 모듈 로드 시 더미 리스너를 등록해 보장한다.
//  - 동시에 getVoices()를 한 번 호출해 내부 voice 테이블 초기화를 nudge.
//  - 이렇게 해도 첫 호출에서 빈 배열을 받는 케이스가 남으므로 speakSynth는
//    별도로 awaitVoices()로 재시도한다.
//
// F6 + F7 외부 구독 모델:
//  - 사용자가 OS 설정에서 음성팩을 설치하고 돌아오면 voiceschanged가 발화한다.
//  - F7: 그 즉시 cachedZhVoice를 무효화한다. 과거 캐시된 voice가 unmount된 변형
//    (예: 임시 voice가 stale)인 경우 다음 speak()에서 stale voice로 발화해 실패.
//  - F6: TTSButton 등 외부 진단 가드(5분 cooldown)도 동시에 reset 가능하도록
//    subscribeVoicesChanged()를 제공. resetTtsErrorGuard를 직접 import하는 역방향
//    의존을 피하기 위해 pub-sub 형태로 노출.
const voicesChangedListeners = new Set<() => void>();
export function subscribeVoicesChanged(fn: () => void): () => void {
  voicesChangedListeners.add(fn);
  return (): void => { voicesChangedListeners.delete(fn); };
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      // F7: voiceschanged 시 cachedZhVoice를 무효화. 새로 설치된 음성으로
      // pickMandarinVoice가 갱신된 결과를 사용하도록 강제.
      cachedZhVoice = null;
      // F6: 구독자(예: TTSButton의 ttsErrorShown 가드)에게 알림 — 사용자가
      // 음성팩을 설치하고 돌아온 경우 진단 다이얼로그가 다시 표시될 수 있도록.
      for (const fn of voicesChangedListeners) {
        try { fn(); } catch { /* ignore */ }
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * 음성 출력 가능 여부.
 * 사전녹음 매니페스트가 비어있지 않으면 Web Speech 미지원 환경에서도
 * <audio> 재생으로 음성을 들려줄 수 있다 — 그 경우도 true.
 */
export function isSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if ('speechSynthesis' in window) return true;
  return Object.keys(TTS_MANIFEST).length > 0;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * iOS 버전을 user agent에서 추출합니다.
 * iPadOS 13+는 macOS UA로 위장하므로 iPad는 정확히 못 잡을 수 있습니다.
 */
export function getIOSVersion(): { major: number; minor: number } | null {
  if (!isIOS()) return null;
  const m = navigator.userAgent.match(/OS (\d+)[_.](\d+)(?:[_.](\d+))?/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (!isSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function pickMandarinVoice(preferredURI?: string): SpeechSynthesisVoice | null {
  if (!isSupported()) return null;
  const voices = getVoices();
  if (voices.length === 0) return null;
  if (preferredURI) {
    const found = voices.find((v) => v.voiceURI === preferredURI);
    if (found) return found;
  }
  // Prefer zh-CN; fall back to zh-CN/SG/Hans 변종까지만.
  // zh-TW/zh-HK는 한자음·어휘 mismatch — silent quality fail을 피하기 위해
  // 명시적으로 본토 변종으로 좁힌다. (F3: pickMandarinVoice 최종 fallback narrow)
  for (const lang of ZH_LANGS) {
    const v = voices.find((vc) => vc.lang === lang);
    if (v) return v;
  }
  const anyCnLike = voices.find((v) => ZH_CN_LIKE_RE.test(v.lang));
  return anyCnLike ?? null;
}

/** Wait for voices to be available (Chrome async load). */
export function awaitVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSupported()) return resolve([]);
    const synth = window.speechSynthesis;
    const existing = synth.getVoices();
    if (existing.length > 0) return resolve(existing);
    let done = false;
    const onChange = (): void => {
      if (done) return;
      done = true;
      synth.removeEventListener('voiceschanged', onChange);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', onChange);
    setTimeout(() => {
      if (done) return;
      done = true;
      synth.removeEventListener('voiceschanged', onChange);
      resolve(synth.getVoices());
    }, timeoutMs);
  });
}

/**
 * iOS unlock: must be invoked from a click/touch handler.
 * Speaks a silent (empty-ish) utterance to satisfy the gesture requirement.
 */
export function unlock(): void {
  if (!isSupported() || unlocked) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.rate = 1;
    window.speechSynthesis.speak(u);
    unlocked = true;
  } catch {
    /* ignore */
  }
}

/**
 * 음성 재생 방식.
 *  - 'device'   : 기기 자체 TTS만 사용 — 매니페스트 lookup 우회.
 *  - 'recorded' : 미리 녹음된 mp3 우선 — manifest miss는 단말기 TTS로 fallback.
 *  - undefined  : voiceModeProvider 값을 사용. provider 미등록/null 반환이면 'recorded'.
 */
export type VoiceMode = 'device' | 'recorded';

/**
 * 사용자 설정(userMode)을 tts 모듈에 늦은 바인딩으로 주입한다.
 *  - 직접 useSettings를 import하면 settings.ts ↔ tts.ts 순환 의존이 발생한다
 *    (settings.ts가 stopTTS를 import하므로).
 *  - 호출자가 opts.voiceMode를 빠뜨려도 speak()/prefetchAudio()가 정책을 강제 enforce
 *    할 수 있도록, settings 모듈이 hydrate/setUserMode 흐름에서 이 provider를 등록한다.
 *  - 미등록 상태(테스트/SSR 등)에서는 기존 default('recorded')로 동작.
 */
let voiceModeProvider: (() => VoiceMode | null) | null = null;
export function setVoiceModeProvider(fn: (() => VoiceMode | null) | null): void {
  voiceModeProvider = fn;
}
function resolveVoiceMode(explicit: VoiceMode | undefined): VoiceMode {
  if (explicit) return explicit;
  try {
    const v = voiceModeProvider?.();
    if (v === 'device' || v === 'recorded') return v;
  } catch {
    /* ignore — fall through to default */
  }
  return 'recorded';
}

export type SpeakOptions = {
  rate?: number; // 0.5 – 1.5 typical
  pitch?: number;
  voiceURI?: string;
  voiceMode?: VoiceMode;
  onEnd?: () => void;
  onError?: (e: SpeechSynthesisErrorEvent) => void;
};

/**
 * 매니페스트 키 정규화.
 *
 * 매니페스트는 build-content가 원문을 그대로 키로 저장하지만 화면에 표시되는
 * 텍스트는 lessons-vol*.json/검색 입력/사용자 편집 경로를 거치면서 다음과 같은
 * 비가시 문자가 섞일 수 있다. 이걸 정규화하지 않으면 사람 눈에 똑같이 보이는
 * 문자열이 매니페스트 miss로 빠져 SpeechSynth fallback 경로(음질·정책 mismatch)로
 * 떨어진다 — silent quality fail.
 *
 * 정규화 대상:
 *  - NBSP(U+00A0) → 일반 공백 — Word/카피 페이스트에서 흔히 섞임
 *  - Zero-width(U+200B~200F, U+FEFF) → 제거 — 에디터/번역 도구가 삽입
 *  - 전각 공백(U+3000) → 일반 공백 — IME 입력
 *  - 다양한 따옴표/대시 → ASCII 동치로 통일 — "smart quotes" 자동 변환
 *  - 양끝 공백 trim
 *
 * 본 함수는 lookup 시점에 1회 실행. 매니페스트 자체는 빌드 단계에서 같은 규칙으로
 * 정규화돼 있다는 전제 — 사람 손으로 채운 매니페스트가 unicode 변종을 포함하면
 * 캐스케이드 miss가 날 수 있다는 점만 주의.
 */
function normalizeManifestKey(text: string): string {
  return text
    .replace(/[​-‏﻿]/g, '') // zero-width / BOM
    .replace(/[ 　]/g, ' ')        // NBSP, ideographic space
    .replace(/[‘’]/g, "'")        // smart single quotes → '
    .replace(/[“”]/g, '"')        // smart double quotes → "
    .replace(/[–—]/g, '-')        // en/em dash → -
    .trim();
}

/**
 * 사전녹음 매니페스트에서 zh 텍스트를 찾는다.
 * 키는 build-content가 채우는 원문(정규화 후).
 *  1차 정규화 키로 직접 hit.
 *  2차 fallback: 원문 trim만 — 빌드 매니페스트가 unicode 변종을 그대로 가진
 *  레거시 케이스 호환. (production 매니페스트는 정규화돼 있어야 정상)
 */
function lookupPrerecorded(text: string): string | null {
  if (!text) return null;
  const normalized = normalizeManifestKey(text);
  if (!normalized) return null;
  const direct = TTS_MANIFEST[normalized];
  if (direct) return `${TTS_BASE_URL}${direct}`;
  // 레거시 호환 — 매니페스트가 unicode 변종을 그대로 저장한 경우만 트리거.
  const raw = text.trim();
  if (raw !== normalized) {
    const legacy = TTS_MANIFEST[raw];
    if (legacy) return `${TTS_BASE_URL}${legacy}`;
  }
  return null;
}

function stopAudio(): void {
  if (!currentAudio) return;
  try {
    currentAudio.pause();
    currentAudio.src = '';
  } catch {
    /* ignore */
  }
  currentAudio = null;
}

/**
 * 사전녹음 mp3/opus 재생. 실패 시 fallback()을 호출 (보통 Web Speech).
 *
 * 첫 클릭 안정화: cold network/디코드 지연으로 1차 play()가 실패할 때
 * 1회만 짧게 재시도한다 (audio.load() + play 재호출). 두 번째 클릭은
 * 캐시/디코드가 끝나 있으므로 항상 1차에 성공. 재시도까지 실패하면 fallback.
 */
function playPrerecorded(url: string, opts: SpeakOptions, epoch: number, fallback: () => void): void {
  stopAudio();
  const a = new Audio();
  a.preload = 'auto';
  a.src = url;
  a.playbackRate = opts.rate ?? 1;
  a.onended = (): void => {
    if (currentAudio === a) currentAudio = null;
    if (epoch !== speakEpoch) return;
    opts.onEnd?.();
  };
  let retried = false;
  const giveUp = (): void => {
    if (currentAudio === a) currentAudio = null;
    if (epoch !== speakEpoch) return; // stop()/새 speak() 이후라면 폴백 차단
    fallback();
  };
  const retry = (): void => {
    if (retried) {
      giveUp();
      return;
    }
    retried = true;
    setTimeout(() => {
      if (epoch !== speakEpoch) return;
      try {
        a.load();
        const p2 = a.play();
        if (p2 && typeof p2.catch === 'function') p2.catch(giveUp);
      } catch {
        giveUp();
      }
    }, 80);
  };
  // 파일 누락(404)·디코드 실패는 audio.onerror로 들어온다 → 1회 retry 후 폴백.
  a.onerror = retry;
  currentAudio = a;
  // 주의: unlocked 플래그는 SpeechSynthesis용 (iOS gesture). mp3 path에서는
  // 의미가 없고, 오히려 device 모드 첫 SpeechSynthesis 호출에서 unlock()을
  // skip하게 만들어 첫 음성이 묵음이 되는 회귀를 일으킨다. 여기서 세팅 금지.
  const p = a.play();
  if (p && typeof p.catch === 'function') {
    p.catch(retry);
  }
}

/**
 * 사전녹음 mp3 prefetch — 텍스트가 매니페스트에 있으면 audio 버퍼 다운로드만 시작.
 * 사용자 제스처 직전(mousedown/touchstart)에 호출하면 첫 클릭 재생 안정성 향상.
 * device 모드는 mp3를 쓰지 않으므로 no-op.
 *
 * 절약:
 *   - Data Saver(`connection.saveData=true`) 환경에서는 사용자가 실제 클릭하지
 *     않은 시점의 prefetch는 비용 부담. 이 경우 skip하고 click 시 정상 경로로만 받는다.
 *   - 동일 URL에 대한 prefetch는 메모리 Map(URL → 등록 시각)으로 중복 방지.
 *
 * R4: 과거 Set은 한 번 add되면 영구 유지돼 다음 문제가 있었다.
 *   - 일시적 네트워크 오류로 prefetch가 실제로 실패했어도 Set에 남아 재시도
 *     되지 않는다 → 재방문 시 사용자가 cold network 지연을 또 겪는다.
 *   - 메모리: 매니페스트 2,500+ 항목을 모두 한 세션에서 hover하면 Set이 비대해진다.
 *   따라서 TTL(30s) 기반 Map으로 교체. 30초가 지난 항목은 만료 처리되어 재prefetch가
 *   허용된다. audio.onerror 시에는 즉시 제거해 다음 hover에서 재시도.
 *
 * R13: bulkDownloadAll이 사용하는 in-flight 공유 — getPrefetchedUrls() export로
 *   bulk가 이미 prefetch된 URL을 skip(done으로 카운트)할 수 있게 한다.
 */
const PREFETCH_TTL_MS = 30_000;
const prefetched = new Map<string, number>();

function prefetchFresh(url: string, now: number): boolean {
  const at = prefetched.get(url);
  if (at === undefined) return false;
  if (now - at > PREFETCH_TTL_MS) {
    prefetched.delete(url);
    return false;
  }
  return true;
}

/**
 * R13용 — 현재 시점에 prefetch 캐시가 살아있는 URL 집합.
 * bulkDownloadAll이 중복 fetch를 피하기 위해 참조. 만료된 항목은 자동 제거된다.
 */
export function getPrefetchedUrls(): Set<string> {
  const now = Date.now();
  const live = new Set<string>();
  for (const [url, at] of prefetched) {
    if (now - at <= PREFETCH_TTL_MS) live.add(url);
    else prefetched.delete(url);
  }
  return live;
}

export function prefetchAudio(text: string, voiceMode?: VoiceMode): void {
  // 호출자가 voiceMode를 명시하지 않으면 사용자 설정(userMode)을 enforce.
  // device 모드에서는 mp3 prefetch를 절대 시작하지 않는다 — 데이터/스토리지 절약.
  if (resolveVoiceMode(voiceMode) === 'device') return;
  const url = lookupPrerecorded(text);
  if (!url) return;
  const now = Date.now();
  if (prefetchFresh(url, now)) return;
  // 데이터 절약 모드: prefetch 비활성
  try {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (c?.saveData) return;
  } catch {
    /* ignore */
  }
  prefetched.set(url, now);
  try {
    const a = new Audio();
    a.preload = 'auto';
    // R4: 일시적 네트워크/디코드 실패는 prefetched에서 제거해
    // 다음 hover에서 재시도가 가능하도록 한다.
    a.onerror = (): void => { prefetched.delete(url); };
    a.src = url;
    // 재생하지 않음. 브라우저 HTTP cache + 디코드 버퍼만 채운다.
  } catch {
    prefetched.delete(url);
  }
}

/**
 * Speaks `text` in Mandarin. Cancels any in-flight utterance first
 * so rapid tapping behaves predictably.
 *
 * voiceMode에 따라 경로 분기:
 *   - 'device'   : 매니페스트 우회 → 기기 TTS만 사용. mp3 다운 안 받는 모드.
 *   - 'recorded' : 사전녹음 mp3 hit → 재생. miss는 기기 TTS로 fallback.
 *   - undefined  : 'recorded'와 동일.
 *
 * iOS notes:
 *  - cancel() right before speak() can race on iOS — we only cancel if
 *    something is already queued.
 *  - if no zh voice is installed, iOS fires onerror with
 *    'language-unavailable'; surface it so callers can guide the user.
 */
export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!text) return;
  const epoch = ++speakEpoch;
  // 호출자가 voiceMode를 빠뜨려도 정책 일관성 유지를 위해 source에서 resolve.
  // 과거 7개 call site(Flashcards x2, Hanzi, MinimalPairsGame, SentenceBuilder,
  // McqGame, MarathonPlayer, Help)가 voiceMode를 전달하지 않아 device 모드 사용자도
  // mp3 매니페스트 hit 시 녹음 파일이 재생되는 정책 위반이 있었다 — 이제는 차단된다.
  const mode = resolveVoiceMode(opts.voiceMode);
  if (mode === 'device') {
    speakSynth(text, opts, epoch);
    return;
  }
  const url = lookupPrerecorded(text);
  if (url) {
    // 사전녹음 경로 — Web Speech 미지원 환경도 동작한다.
    // 사용자 모드가 'recorded' + 오프라인일 때는 mp3 실패 시 SpeechSynth로
    // fallback하지 않는다. 이유:
    //   - 사용자는 "녹음 음성으로 듣겠다"고 선택했다 (provider가 resolve한 값 포함).
    //   - 오프라인에서 mp3가 실패한 건 캐시 miss/네트워크 단절일 가능성.
    //   - 이 시점에 단말 TTS로 슬쩍 바꾸면 정책 위반 + 발음/음질 mismatch가 발생하고
    //     사용자는 무엇이 잘못됐는지 모른다(silent policy fail). 본 교재는 본토 발음
    //     기준이라 단말 zh-TW 음성으로 떨어지는 경우 특히 문제.
    //   - 대신 'network' 에러를 onError로 통지 → 호출자(TTSButton)가 안내를 띄운다.
    //   - device 모드는 애초에 mp3 경로로 오지 않으므로 무관.
    //   - 온라인일 때는 종전과 동일하게 synth fallback — 단순 디코드/cold-start 실패
    //     커버.
    const strictRecorded = mode === 'recorded' && !navigatorOnline();
    const fallback = strictRecorded
      ? (): void => {
          if (epoch !== speakEpoch) return;
          const e = { error: 'network' } as unknown as SpeechSynthesisErrorEvent;
          opts.onError?.(e);
        }
      : (): void => speakSynth(text, opts, epoch);
    playPrerecorded(url, opts, epoch, fallback);
    return;
  }
  speakSynth(text, opts, epoch);
}

function navigatorOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function speakSynth(text: string, opts: SpeakOptions, epoch: number): void {
  if (!isSupported() || !text) return;
  stopAudio();
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) {
    try {
      synth.cancel();
    } catch {
      /* ignore */
    }
  }
  const voice = pickMandarinVoice(opts.voiceURI);
  // Chrome/Edge cold-start 회피:
  //   getVoices()는 `voiceschanged` 이벤트가 발화되기 전까지 빈 배열을 반환한다.
  //   페이지 로드 직후 첫 클릭이면 voice가 null이지만 음성팩은 설치돼 있을 수 있다.
  //   이 시점에 곧장 language-unavailable로 에러내면 false-positive 다이얼로그를
  //   띄우게 되므로, awaitVoices()로 한 번 더 기다린 뒤 재선택하여 폴백한다.
  if (!voice) {
    void awaitVoices().then((voices) => {
      // stop() 또는 새 speak() 이후에 도착한 voiceschanged면 무시.
      // (모드 전환 직후 false-positive language-unavailable 발화 방지)
      if (epoch !== speakEpoch) return;
      const retryVoice =
        voices.length === 0
          ? null
          : pickMandarinVoice(opts.voiceURI);
      if (!retryVoice) {
        // 실제로 zh 음성이 없는 환경 — 가이드(음성팩 설치 안내)를 띄울 수 있도록
        // language-unavailable로 통지. Windows SAPI5처럼 ko voice가 한자를
        // 한국어 한자음으로 발음하는 폴백은 막아야 하므로 다른 음성으로의 임의
        // 대체는 하지 않는다.
        if (opts.onError) {
          const e = { error: 'language-unavailable' } as unknown as SpeechSynthesisErrorEvent;
          opts.onError(e);
        }
        return;
      }
      emitUtterance(text, opts, retryVoice, epoch);
    });
    return;
  }
  emitUtterance(text, opts, voice, epoch);
}

function emitUtterance(
  text: string,
  opts: SpeakOptions,
  voice: SpeechSynthesisVoice,
  epoch: number,
): void {
  if (!isSupported()) return;
  if (epoch !== speakEpoch) return; // 동기 경로에서는 거의 만나지 않지만 안전망
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  cachedZhVoice = voice;
  u.rate = opts.rate ?? 1;
  u.pitch = opts.pitch ?? 1;

  // iOS PWA silent-fail 워치독 (critical):
  //   iOS 17.4 미만, iOS 26.0~26.1 회귀 구간에서 standalone PWA가 synth.speak()
  //   호출 후 onstart/onend/onerror 어느 것도 발화하지 않는 버그가 보고되어 있다.
  //   결과적으로 호출자(TTSButton)의 speaking 상태가 stuck되고, 사용자는 묵음
  //   화면을 보고 앱이 망가졌다고 판단하게 된다.
  //   → onstart가 일정 시간 안에 안 오면 인공 timeout 에러를 발화시켜
  //     호출자가 안전하게 복구할 수 있도록 한다.
  //   - 타임아웃: 4000ms 고정. (F4: text.length * 250ms 스케일링 제거)
  //     200자 텍스트에서 50초까지 늘어나 사실상 stuck과 구분이 안 되던 문제 해결.
  //     onstart는 cold-start 1.5초 + iOS PWA 추가 지연 1.5초로도 4초면 충분.
  //     워치독은 onstart까지의 타임아웃이지 utterance 완료까지의 타임아웃이 아니므로
  //     긴 절도 영향 없음 — onstart가 한 번 오면 즉시 해제된다.
  //   - epoch 체크로 stop()/새 speak() 이후의 stale 발화 방지.
  let started = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const clearWatchdog = (): void => {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };
  const watchdogMs = 4000;

  u.onstart = (): void => {
    started = true;
    clearWatchdog();
  };
  u.onend = (): void => {
    clearWatchdog();
    if (epoch !== speakEpoch) return;
    opts.onEnd?.();
  };
  u.onerror = (e): void => {
    clearWatchdog();
    if (epoch !== speakEpoch) return;
    opts.onError?.(e);
  };

  synth.speak(u);
  unlocked = true;

  watchdog = setTimeout(() => {
    watchdog = null;
    if (started) return; // 정상 환경 — onstart가 이미 도착
    if (epoch !== speakEpoch) return; // stop()/새 speak() 이후
    // 무한 stuck 회피: utterance를 강제 cancel하고 합성 실패로 통지.
    // 'synthesis-unavailable'은 ttsErrorReason에 매핑되어 있어 안내 가능.
    //
    // F5: watchdog 발화 후 뒤늦게 도착하는 onstart/onend/onerror는 무시해야 한다.
    //   - 사용자 perspective에서 이미 실패로 통지(onError 'synthesis-unavailable')된
    //     이후 onstart가 발화하면 호출자(TTSButton)가 speaking 상태로 다시 들어가
    //     UI가 모순된다.
    //   - epoch 체크가 일부 보호하지만, 동일 epoch 내에서 onstart가 watchdog
    //     직후에 도착하는 race는 epoch만으론 못 막는다. 핸들러를 null로 직접 끊는다.
    //
    // F9: synth.cancel() 호출 직후의 60ms 마진.
    //   - 일부 엔진(특히 Chrome Android/Edge Win)에서 cancel()이 즉시 동기 반환하지만
    //     내부 큐 정리는 비동기로 일어난다. 이 사이에 onError를 발화하면 호출자가
    //     즉시 다음 speak()를 호출하는데, 그 speak()가 cancel 잔여 정리에 의해 다시
    //     취소되는 chain race가 발생한다.
    //   - 60ms는 실측 기반(40~50ms 정도면 안전, 마진 20%).
    u.onstart = null;
    u.onend = null;
    u.onerror = null;
    try {
      synth.cancel();
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      if (epoch !== speakEpoch) return;
      const synthetic = {
        error: 'synthesis-unavailable',
        utterance: u,
      } as unknown as SpeechSynthesisErrorEvent;
      opts.onError?.(synthetic);
    }, 60);
  }, watchdogMs);
}

export type TTSDiagnostic =
  | 'ok'
  | 'unsupported'
  | 'no-zh-voice'
  | 'ios-pwa-warning';

/**
 * Returns a hint about likely TTS issues on this device, for the UI to
 * show actionable guidance.
 * 사전녹음 매니페스트가 충분히 채워져 있다면 단말 음성팩/iOS PWA 제약은
 * 사실상 우회되므로 'ok'로 분류한다.
 */
export function diagnose(): TTSDiagnostic {
  if (!isSupported()) return 'unsupported';
  if (Object.keys(TTS_MANIFEST).length > 0) return 'ok';
  const zhCount = getVoices().filter((v) =>
    v.lang.toLowerCase().startsWith('zh'),
  ).length;
  if (zhCount === 0) return 'no-zh-voice';
  if (isIOS() && isStandalonePWA()) return 'ios-pwa-warning';
  return 'ok';
}

export function stop(): void {
  // epoch 증가로 모든 in-flight 비동기 분기(awaitVoices, audio.onerror retry,
  // SpeechSynthesisUtterance onend/onerror)를 무효화한다.
  speakEpoch++;
  stopAudio();
  if (!isSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export function getCachedVoice(): SpeechSynthesisVoice | null {
  return cachedZhVoice;
}
