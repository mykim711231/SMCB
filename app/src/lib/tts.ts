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

/**
 * 음성 재생 방식.
 *  - 'device'   : 기기 자체 TTS만 사용 — 매니페스트 lookup 우회.
 *  - 'recorded' : 미리 녹음된 mp3 우선 — manifest miss는 단말기 TTS로 fallback.
 *  - undefined  : 'recorded'와 동일하게 처리 (기본값).
 */
export type VoiceMode = 'device' | 'recorded';

export type SpeakOptions = {
  rate?: number; // 0.5 – 1.5 typical
  pitch?: number;
  voiceURI?: string;
  voiceMode?: VoiceMode;
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
 *
 * 첫 클릭 안정화: cold network/디코드 지연으로 1차 play()가 실패할 때
 * 1회만 짧게 재시도한다 (audio.load() + play 재호출). 두 번째 클릭은
 * 캐시/디코드가 끝나 있으므로 항상 1차에 성공. 재시도까지 실패하면 fallback.
 */
function playPrerecorded(url: string, opts: SpeakOptions, fallback: () => void): void {
  stopAudio();
  const a = new Audio();
  a.preload = 'auto';
  a.src = url;
  a.playbackRate = opts.rate ?? 1;
  a.onended = (): void => {
    if (currentAudio === a) currentAudio = null;
    opts.onEnd?.();
  };
  let retried = false;
  const giveUp = (): void => {
    if (currentAudio === a) currentAudio = null;
    fallback();
  };
  const retry = (): void => {
    if (retried) {
      giveUp();
      return;
    }
    retried = true;
    setTimeout(() => {
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
  unlocked = true;
  const p = a.play();
  if (p && typeof p.catch === 'function') {
    p.catch(retry);
  }
}

/**
 * 사전녹음 mp3 prefetch — 텍스트가 매니페스트에 있으면 audio 버퍼 다운로드만 시작.
 * 사용자 제스처 직전(mousedown/touchstart)에 호출하면 첫 클릭 재생 안정성 향상.
 * device 모드는 mp3를 쓰지 않으므로 no-op.
 */
export function prefetchAudio(text: string, voiceMode?: VoiceMode): void {
  if (voiceMode === 'device') return;
  const url = lookupPrerecorded(text);
  if (!url) return;
  try {
    const a = new Audio();
    a.preload = 'auto';
    a.src = url;
    // 재생하지 않음. 브라우저 HTTP cache + 디코드 버퍼만 채운다.
  } catch {
    /* ignore */
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
  if (opts.voiceMode === 'device') {
    speakSynth(text, opts);
    return;
  }
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
  const voice = pickMandarinVoice(opts.voiceURI);
  // zh voice가 없으면 합성 시도 자체를 차단한다.
  // Windows SAPI5처럼 ko voice가 한자를 한국어 한자음으로 발음하는 폴백을 막기 위함.
  // 호출자가 가이드(음성팩 설치 안내)를 띄울 수 있도록 onError를 'language-unavailable'로 통지.
  if (!voice) {
    if (opts.onError) {
      const e = { error: 'language-unavailable' } as unknown as SpeechSynthesisErrorEvent;
      opts.onError(e);
    }
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  cachedZhVoice = voice;
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
