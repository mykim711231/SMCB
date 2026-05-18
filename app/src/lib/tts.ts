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
 */

export type TTSStatus = 'idle' | 'speaking' | 'paused' | 'unsupported';

const ZH_LANGS = ['zh-CN', 'zh-Hans-CN', 'zh', 'cmn-Hans-CN'];

let unlocked = false;
let cachedZhVoice: SpeechSynthesisVoice | null = null;

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
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
 * Speaks `text` in Mandarin. Cancels any in-flight utterance first
 * so rapid tapping behaves predictably.
 *
 * iOS notes:
 *  - cancel() right before speak() can race on iOS — we only cancel if
 *    something is already queued.
 *  - if no zh voice is installed, iOS fires onerror with
 *    'language-unavailable'; surface it so callers can guide the user.
 */
export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!isSupported() || !text) return;
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
 */
export function diagnose(): TTSDiagnostic {
  if (!isSupported()) return 'unsupported';
  const zhCount = getVoices().filter((v) =>
    v.lang.toLowerCase().startsWith('zh'),
  ).length;
  if (zhCount === 0) return 'no-zh-voice';
  if (isIOS() && isStandalonePWA()) return 'ios-pwa-warning';
  return 'ok';
}

export function stop(): void {
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
