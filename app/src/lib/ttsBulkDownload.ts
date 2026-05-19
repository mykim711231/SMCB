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

  const next = (): string | null => {
    if (opts.signal?.aborted) {
      aborted = true;
      return null;
    }
    if (index >= files.length) return null;
    return files[index++];
  };

  const fetchOnce = async (file: string): Promise<boolean> => {
    // no-store로 두면 SW가 가로채 캐시한 응답을 그대로 사용한다.
    // body는 읽지 않는다 (메모리 압박 회피) — 응답 객체만 받아도
    // SW의 CacheFirst가 캐시에 저장하기에 충분.
    const res = await fetch(`${TTS_BASE_URL}${file}`, {
      method: 'GET',
      signal: opts.signal,
    });
    return res.ok || res.type === 'opaque' || res.status === 206;
  };

  async function worker(): Promise<void> {
    for (;;) {
      const file = next();
      if (!file) return;
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
      if (!ok && !opts.signal?.aborted) {
        await new Promise<void>((r) => setTimeout(r, RETRY_BACKOFF_MS));
        if (!opts.signal?.aborted) {
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

  return { done, failed, total, aborted };
}
