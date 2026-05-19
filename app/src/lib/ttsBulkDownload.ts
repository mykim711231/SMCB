/**
 * 사전녹음 zh mp3 일괄 다운로드.
 *
 * 매니페스트의 모든 mp3를 fetch만 한다 — 응답 body를 읽지 않고 버려도
 * vite-plugin-pwa의 tts-audio CacheFirst 룰이 SW에서 가로채 캐시한다.
 * 따라서 이 함수는 "워밍업" 트리거다: 첫 청취 시 cold network 지연을 없앤다.
 *
 * 동시성:
 *  - 6 worker 병렬 fetch — 모바일 회선에서도 안전. 더 높이면 일부 통신사에서
 *    소켓 제한·throttling 걸림.
 *  - 실패는 skip (네트워크 단발성 오류 다수). 카운트는 done에 포함하지 않음.
 *
 * 취소:
 *  - signal로 중간 중단. 카드 닫기 / 다른 페이지 이동 시 호출자가 abort.
 *
 * 네트워크 사용량 보호 (R5):
 *  - 약 20~40MB를 한 번에 받는 작업이므로, 셀룰러 또는 Low Data Mode가
 *    감지되면 사용자에게 확인을 받는다. Wi-Fi 사용자에게는 무음으로 진행.
 *  - iOS Safari는 NetworkInformation API가 없어 connection이 undefined.
 *    이 경우 보수적으로 한 번 확인을 받는다 (셀룰러일 가능성을 배제할 수 없음).
 *
 * 재시도 (R11):
 *  - 첫 fetch 실패 시 800ms 백오프 후 한 번 재시도. 모바일 회선의
 *    단발성 패킷 손실이 가장 흔한 실패 원인이라 재시도 1회로 대부분 회복.
 *  - 재시도도 실패하면 failed에 카운트. abort된 경우는 재시도하지 않는다.
 */
import ttsManifest from '@/data/zh-tts-manifest.json';
import { getPrefetchedUrls } from '@/lib/tts';

const TTS_MANIFEST = ttsManifest as Record<string, string>;
const TTS_BASE_URL = `${import.meta.env.BASE_URL}tts/`;

const CONCURRENCY = 6;
const RETRY_BACKOFF_MS = 800;

export type BulkProgress = { done: number; failed: number; total: number };

export type BulkOptions = {
  onProgress?: (p: BulkProgress) => void;
  signal?: AbortSignal;
  /**
   * 셀룰러/Low Data Mode 또는 connection 정보가 불명확한 환경(iOS Safari)에서
   * 호출되는 확인 콜백. resolve(true)면 진행, resolve(false)면 즉시 중단.
   * 미제공 시 window.confirm로 fallback. 테스트에서는 () => Promise.resolve(true)
   * 같은 stub을 주입한다.
   */
  requireExpensiveConfirm?: () => Promise<boolean>;
};

export type BulkResult = {
  done: number;
  failed: number;
  total: number;
  aborted: boolean;
};

export function getManifestSize(): number {
  return Object.keys(TTS_MANIFEST).length;
}

type NetCondition = 'wifi' | 'cellular' | 'save-data' | 'unknown';

/**
 * 회선 상태 판정.
 *  - Chrome/Android: navigator.connection.type === 'cellular' 또는 effectiveType === '2g'/'3g'
 *  - saveData(브라우저 Low Data Mode)도 셀룰러처럼 취급
 *  - iOS Safari: connection 미지원 — 'unknown' 반환해 한 번 확인
 */
function detectNetworkCondition(): NetCondition {
  if (typeof navigator === 'undefined') return 'unknown';
  // NetworkInformation 타입은 표준화가 부분적이라 any-cast로 접근.
  const conn = (navigator as unknown as { connection?: { type?: string; effectiveType?: string; saveData?: boolean } }).connection;
  if (!conn) return 'unknown';
  if (conn.saveData === true) return 'save-data';
  if (conn.type === 'cellular') return 'cellular';
  if (conn.type === 'wifi' || conn.type === 'ethernet') return 'wifi';
  // type이 unknown으로 채워지는 브라우저 — effectiveType으로 보조 판정.
  if (conn.effectiveType === '2g' || conn.effectiveType === '3g') return 'cellular';
  if (conn.effectiveType === '4g') return 'wifi';
  return 'unknown';
}

function defaultExpensiveConfirm(condition: NetCondition): boolean {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  const msg = condition === 'cellular'
    ? '현재 셀룰러(모바일 데이터)에 연결되어 있어요. 사전녹음 음성을 한 번에 받으면 약 20~40MB가 사용됩니다. 계속하시겠어요?'
    : condition === 'save-data'
      ? '데이터 절약 모드(Low Data)가 켜져 있어요. 한 번에 약 20~40MB를 받게 되는데 계속하시겠어요?'
      : '현재 회선이 Wi-Fi인지 확인할 수 없어요. 사전녹음 음성을 한 번에 받으면 약 20~40MB가 사용됩니다. 계속하시겠어요?';
  return window.confirm(msg);
}

export async function bulkDownloadAll(opts: BulkOptions = {}): Promise<BulkResult> {
  const files = Array.from(new Set(Object.values(TTS_MANIFEST)));
  const total = files.length;
  let done = 0;
  let failed = 0;
  let aborted = false;
  let index = 0;

  // R5: 비용이 큰 회선에서는 사전 확인. Wi-Fi에서는 무음 진행.
  const condition = detectNetworkCondition();
  if (condition !== 'wifi') {
    const confirmFn = opts.requireExpensiveConfirm
      ?? ((): Promise<boolean> => Promise.resolve(defaultExpensiveConfirm(condition)));
    const ok = await confirmFn();
    if (!ok) {
      return { done: 0, failed: 0, total, aborted: true };
    }
  }

  // 사용자가 확인하는 사이 abort된 경우 즉시 반환.
  if (opts.signal?.aborted) {
    return { done: 0, failed: 0, total, aborted: true };
  }

  // R13: prefetch가 이미 살아있는 URL은 bulk가 다시 fetch하지 않는다.
  //   - 같은 mp3에 대해 prefetch와 bulk가 동시에 progress하면 SW dedup 보장이
  //     없는 일부 브라우저에서 2회 upstream fetch가 일어난다.
  //   - prefetchAudio는 hover/탭 기반이라 사용자 의도가 명확하고 캐시도 채워졌다고
  //     판단할 수 있으므로 done으로 카운트해 안전하게 skip.
  //   - prefetch 만료(30s)된 URL은 자동으로 제외 — 이 set은 호출 시점 snapshot.
  const prefetchedUrlSet = getPrefetchedUrls();

  // R12: captive portal 감지 — 호텔/카페 Wi-Fi가 모든 요청을 portal HTML로
  // 가로채면, fetch는 200 OK처럼 보이지만 응답은 mp3가 아닌 HTML이라
  // CacheFirst가 잘못된 응답을 캐시한다. 결과: 다음부터 SW cache hit이지만
  // audio 디코드는 실패.
  //
  // 동작:
  //   - 첫 fetch에서 content-type을 검사. text/html 또는 audio/ 미시작이면
  //     captive portal로 판정해 즉시 중단 + 사용자 안내.
  //   - 이미 받은 잘못된 응답은 호출자(OnboardingCard/Settings)가 status를
  //     'partial'로 두면 다음 부팅 R8 검증에서 일부만 캐시된 것처럼 보일 뿐
  //     audio decode 실패는 발생. 사용자가 captive portal 통과 후 재시도해야 함.
  //   - opaque 응답(0)은 검사 못 함 — pass through.
  let captivePortalAborted = false;

  const next = (): string | null => {
    if (opts.signal?.aborted || captivePortalAborted) {
      aborted = true;
      return null;
    }
    if (index >= files.length) return null;
    return files[index++];
  };

  const fetchOnce = async (file: string): Promise<boolean> => {
    // no-store로 두면 SW가 가로채 캐시한 응답을 그대로 사용한다.
    // body는 명시적으로 cancel해 메모리 압박 회피 (R10) — Workbox SW는 별도
    // 자체 fetch로 response를 가로채 캐시에 저장하므로 호출자 측 body cancel은
    // 캐시 적재에 영향 없다.
    const res = await fetch(`${TTS_BASE_URL}${file}`, {
      method: 'GET',
      signal: opts.signal,
    });
    const success = res.ok || res.type === 'opaque' || res.status === 206;
    // R12: captive portal 판정 — content-type이 audio/* 또는 응답 타입이
    // opaque/206이 아니면서 text/html이면 portal HTML. 첫 응답에서 한 번만
    // 검증한다(이후는 동일 origin이라 같은 결과 — 검증 자체가 비용).
    if (success && res.type !== 'opaque' && res.status !== 206) {
      const ct = (res.headers.get('content-type') ?? '').toLowerCase();
      if (ct && !ct.startsWith('audio/') && !ct.includes('octet-stream')) {
        captivePortalAborted = true;
        try { void res.body?.cancel().catch(() => { /* ignore */ }); } catch { /* ignore */ }
        return false;
      }
    }
    try {
      // ReadableStream.cancel은 throw 안전성이 브라우저별로 미세하게 다르다.
      // catch 없이 두면 일부 환경에서 unhandled rejection 경고가 떨어진다.
      void res.body?.cancel().catch(() => { /* ignore */ });
    } catch {
      /* ignore */
    }
    return success;
  };

  // R14: abort signal에 반응하는 백오프. 800ms setTimeout 동안 abort되면
  // 그 사이 사용자 액션(카드 닫기/페이지 이동)에 즉시 응답할 수 없었다.
  // signal listener와 timeout race로 변환해 abort 시 micro-task 내 종료.
  const abortableBackoff = (ms: number): Promise<void> => {
    if (opts.signal?.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        opts.signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(t);
        opts.signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      opts.signal?.addEventListener('abort', onAbort, { once: true });
    });
  };

  async function worker(): Promise<void> {
    for (;;) {
      // R14: worker 진입 시점에 abort 확인 — next()도 검사하지만, retry
      // 백오프 직후 또는 captive portal 직후 빠르게 빠져나가도록 명시.
      if (opts.signal?.aborted) {
        aborted = true;
        return;
      }
      const file = next();
      if (!file) return;
      const fullUrl = `${TTS_BASE_URL}${file}`;
      // R13: prefetch가 살아있는 URL은 fetch 생략 — done으로 카운트.
      if (prefetchedUrlSet.has(fullUrl)) {
        done++;
        opts.onProgress?.({ done, failed, total });
        continue;
      }
      let ok = false;
      try {
        ok = await fetchOnce(file);
      } catch {
        if (opts.signal?.aborted) {
          aborted = true;
          return;
        }
        // R11: 1회 재시도 — 모바일 회선 단발성 실패가 가장 흔하다.
        ok = false;
      }
      // captive portal로 판정된 경우 즉시 종료 (재시도 의미 없음).
      if (captivePortalAborted) {
        failed++;
        opts.onProgress?.({ done, failed, total });
        return;
      }
      if (!ok && !opts.signal?.aborted) {
        // R14: setTimeout 대신 abort signal-aware 백오프.
        await abortableBackoff(RETRY_BACKOFF_MS);
        if (!opts.signal?.aborted && !captivePortalAborted) {
          try {
            ok = await fetchOnce(file);
          } catch {
            if (opts.signal?.aborted) {
              aborted = true;
              return;
            }
            ok = false;
          }
        }
      }
      if (ok) done++;
      else failed++;
      opts.onProgress?.({ done, failed, total });
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, total); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return { done, failed, total, aborted: aborted || captivePortalAborted };
}
