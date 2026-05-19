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
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      /* nudge only — actual await happens in awaitVoices() */
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
 *   - 동일 URL에 대한 prefetch는 메모리 set으로 중복 방지(rapid hover/탭 시).
 */
const prefetched = new Set<string>();
export function prefetchAudio(text: string, voiceMode?: VoiceMode): void {
  if (voiceMode === 'device') return;
  const url = lookupPrerecorded(text);
  if (!url) return;
  if (prefetched.has(url)) return;
  // 데이터 절약 모드: prefetch 비활성
  try {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (c?.saveData) return;
  } catch {
    /* ignore */
  }
  prefetched.add(url);
  try {
    const a = new Audio();
    a.preload = 'auto';
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
  if (opts.voiceMode === 'device') {
    speakSynth(text, opts, epoch);
    return;
  }
  const url = lookupPrerecorded(text);
  if (url) {
    // 사전녹음 경로 — Web Speech 미지원 환경도 동작한다.
    playPrerecorded(url, opts, epoch, () => speakSynth(text, opts, epoch));
    return;
  }
  speakSynth(text, opts, epoch);
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
  //   - 타임아웃: 최소 2.5초, 또는 글자 길이 * 250ms 중 큰 값.
  //     긴 절(예: 200자)도 cold start 후 첫 onstart까지 보통 0.5~1.5초.
  //   - onstart가 오면 워치독 해제 (정상 환경).
  //   - epoch 체크로 stop()/새 speak() 이후의 stale 발화 방지.
  let started = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const clearWatchdog = (): void => {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };
  const watchdogMs = Math.max(2500, text.length * 250);

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
    try {
      synth.cancel();
    } catch {
      /* ignore */
    }
    const synthetic = {
      error: 'synthesis-unavailable',
      utterance: u,
    } as unknown as SpeechSynthesisErrorEvent;
    opts.onError?.(synthetic);
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
