/**
 * 잠금화면 미디어 세션 + 무음 keep-alive.
 *
 * 동기:
 *   이어듣기(Marathon)는 mp3/단말 TTS를 카드별로 끊어 재생하므로 카드 사이의
 *   "무음 구간" 동안 OS가 오디오 세션을 종료한다. 그 결과:
 *     - 잠금화면 미디어 컨트롤이 사라진다.
 *     - 스마트폰 화면이 꺼진 직후의 재생이 중단된다.
 *   라디오 앱은 끊김 없는 오디오 스트림이므로 이 문제가 없다.
 *
 * 본 모듈은 두 가지를 같이 다룬다:
 *   1) 무음 WAV를 loop로 흘려서 카드 간격 + utterance 종료 후에도 오디오
 *      세션을 살려둔다 (volume 0).
 *   2) navigator.mediaSession 메타데이터/핸들러를 등록하여 잠금화면에
 *      재생/일시정지/이전/다음 버튼이 노출되도록 한다.
 *
 * 한계:
 *   - 단말 TTS(SpeechSynthesis) 경로는 iOS에서 화면 잠금 시 표준적으로 일시
 *     중단된다 — 본 모듈로 우회 불가. 매니페스트 hit(mp3) 카드에서만 끊김 없이
 *     이어진다. miss 카드는 잠금 상태에서 묵음으로 지나갈 수 있다.
 *   - 무음 keep-alive는 사용자 제스처 안에서 처음 .play()가 호출되어야 한다
 *     (브라우저 자동재생 정책). 호출자는 click/touch 핸들러 안에서 startSession을
 *     호출해야 한다.
 */

let silentAudio: HTMLAudioElement | null = null;
let silentUrl: string | null = null;
let sessionActive = false;

/**
 * 1초짜리 무음 WAV(8000Hz · 8-bit mono)를 ObjectURL로 생성한다.
 *   - 8-bit unsigned PCM의 silence는 0x80(중간값). data 영역을 0x80으로 채운다.
 *   - 약 8KB. base64 데이터 URI보다 메모리 효율 좋고, 한 번만 생성해 재사용한다.
 *   - audio loop 속성으로 끝없이 재생되므로 1초면 충분.
 */
function ensureSilentUrl(): string {
  if (silentUrl) return silentUrl;
  const sampleRate = 8000;
  const seconds = 1;
  const numSamples = sampleRate * seconds;
  const dataSize = numSamples; // 8-bit mono = 1 byte/sample
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  // "RIFF" chunk descriptor
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // "fmt " sub-chunk
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byteRate = sampleRate * blockAlign
  view.setUint16(32, 1, true); // blockAlign
  view.setUint16(34, 8, true); // bits/sample
  // "data" sub-chunk
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataSize, true);
  // 8-bit unsigned silence = 0x80 (mid-value)
  const bytes = new Uint8Array(buffer, 44);
  bytes.fill(0x80);
  const blob = new Blob([buffer], { type: 'audio/wav' });
  silentUrl = URL.createObjectURL(blob);
  return silentUrl;
}

export type MediaSessionHandlers = {
  play?: () => void;
  pause?: () => void;
  previoustrack?: () => void;
  nexttrack?: () => void;
};

/**
 * 세션 시작 — 무음 loop 재생을 켜고 잠금화면 핸들러를 등록한다.
 * 반드시 사용자 제스처 핸들러 안에서 호출해야 첫 .play()가 정책에 막히지 않는다.
 */
export function startSession(handlers: MediaSessionHandlers): void {
  if (typeof window === 'undefined') return;
  sessionActive = true;
  if (!silentAudio) {
    silentAudio = new Audio(ensureSilentUrl());
    silentAudio.loop = true;
    // 사용자에게 들리지 않도록. preload는 silent라 의미 적지만 cold-start 회피용.
    silentAudio.volume = 0;
    silentAudio.preload = 'auto';
  }
  void silentAudio.play().catch(() => { /* 자동재생 정책 미충족 — 다음 시도에 복구 */ });

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    setAction(ms, 'play', handlers.play);
    setAction(ms, 'pause', handlers.pause);
    setAction(ms, 'previoustrack', handlers.previoustrack);
    setAction(ms, 'nexttrack', handlers.nexttrack);
    ms.playbackState = 'playing';
  }
}

function setAction(
  ms: MediaSession,
  action: MediaSessionAction,
  fn: (() => void) | undefined,
): void {
  try {
    ms.setActionHandler(action, fn ? (): void => fn() : null);
  } catch {
    /* 일부 브라우저는 특정 액션을 미지원 — 그냥 무시 */
  }
}

/**
 * playbackState만 갱신. 무음 audio는 계속 흘려두어야 잠금화면 컨트롤이 유지된다.
 * 사용자가 일시정지해도 잠금화면에서 "재생" 버튼으로 즉시 재개할 수 있도록.
 */
export function setPlaybackState(state: 'playing' | 'paused'): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = state;
}

export function setMetadata(opts: {
  title: string;
  artist?: string;
  album?: string;
}): void {
  if (typeof window === 'undefined') return;
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: opts.title,
      artist: opts.artist ?? '',
      album: opts.album ?? '',
    });
  } catch {
    /* ignore */
  }
}

/**
 * 세션 종료 — 무음 loop를 정지하고 핸들러/메타데이터를 해제한다.
 * 컴포넌트 unmount, 사용자 종료, 재생 완료 시 호출.
 */
export function endSession(): void {
  if (!sessionActive) return;
  sessionActive = false;
  if (silentAudio) {
    try {
      silentAudio.pause();
      silentAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    setAction(ms, 'play', undefined);
    setAction(ms, 'pause', undefined);
    setAction(ms, 'previoustrack', undefined);
    setAction(ms, 'nexttrack', undefined);
    ms.metadata = null;
    ms.playbackState = 'none';
  }
}

export function isSessionActive(): boolean {
  return sessionActive;
}
