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

const TTS_MANIFEST = ttsManifest as Record<string, string>;
const TTS_BASE_URL = `${import.meta.env.BASE_URL}tts/`;

let unlocked = false;
let cachedZhVoice: SpeechSynthesisVoice | null = null;
let currentAudio: HTMLAudioElement | null = null;

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
  // Prefer zh-CN; fall back to anything starting with zh
  for (const lang of ZH_LANGS) {
    const v = voices.find((vc) => vc.lang === lang);
    if (v) return v;
  }
  const anyZh = voices.find((v) => v.lang.toLowerCase().startsWith('zh'));
  return anyZh ?? null;
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

export type SpeakOptions = {
  rate?: number; // 0.5 – 1.5 typical
  pitch?: number;
  voiceURI?: string;
  onEnd?: () => void;
  onError?: (e: SpeechSynthesisErrorEvent) => void;
};

/**
 * 사전녹음 매니페스트에서 zh 텍스트를 찾는다.
 * 키는 build-content 등 외부 도구가 채우는 원문 그대로(trim).
 */
function lookupPrerecorded(text: string): string | null {
  const key = text.trim();
  if (!key) return null;
  const file = TTS_MANIFEST[key];
  return file ? `${TTS_BASE_URL}${file}` : null;
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
 */
function playPrerecorded(url: string, opts: SpeakOptions, fallback: () => void): void {
  stopAudio();
  const a = new Audio(url);
  a.playbackRate = opts.rate ?? 1;
  a.onended = (): void => {
    if (currentAudio === a) currentAudio = null;
    opts.onEnd?.();
  };
  // 파일 누락(404)·디코드 실패는 audio.onerror로 들어온다 → Web Speech로 폴백.
  // play()가 reject되는 경우(브라우저 자동재생 차단 등)도 fallback.
  a.onerror = (): void => {
    if (currentAudio === a) currentAudio = null;
    fallback();
  };
  currentAudio = a;
  unlocked = true;
  const p = a.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      if (currentAudio === a) currentAudio = null;
      fallback();
    });
  }
}

/**
 * Speaks `text` in Mandarin. Cancels any in-flight utterance first
 * so rapid tapping behaves predictably.
 *
 * 우선순위:
 *   1) 사전녹음 매니페스트 hit → <audio> 재생
 *   2) Web Speech API
 *
 * iOS notes:
 *  - cancel() right before speak() can race on iOS — we only cancel if
 *    something is already queued.
 *  - if no zh voice is installed, iOS fires onerror with
 *    'language-unavailable'; surface it so callers can guide the user.
 */
export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!text) return;
  const url = lookupPrerecorded(text);
  if (url) {
    // 사전녹음 경로 — Web Speech 미지원 환경도 동작한다.
    playPrerecorded(url, opts, () => speakSynth(text, opts));
    return;
  }
  speakSynth(text, opts);
}

function speakSynth(text: string, opts: SpeakOptions): void {
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
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickMandarinVoice(opts.voiceURI);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
    cachedZhVoice = voice;
  } else {
    u.lang = 'zh-CN';
  }
  u.rate = opts.rate ?? 1;
  u.pitch = opts.pitch ?? 1;
  if (opts.onEnd) u.onend = opts.onEnd;
  if (opts.onError) u.onerror = opts.onError;
  synth.speak(u);
  unlocked = true;
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
