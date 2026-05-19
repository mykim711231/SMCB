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
 */
import ttsManifest from '@/data/zh-tts-manifest.json';

const TTS_MANIFEST = ttsManifest as Record<string, string>;
const TTS_BASE_URL = `${import.meta.env.BASE_URL}tts/`;

const CONCURRENCY = 6;

export type BulkProgress = { done: number; failed: number; total: number };

export type BulkOptions = {
  onProgress?: (p: BulkProgress) => void;
  signal?: AbortSignal;
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

export async function bulkDownloadAll(opts: BulkOptions = {}): Promise<BulkResult> {
  const files = Array.from(new Set(Object.values(TTS_MANIFEST)));
  const total = files.length;
  let done = 0;
  let failed = 0;
  let aborted = false;
  let index = 0;

  const next = (): string | null => {
    if (opts.signal?.aborted) {
      aborted = true;
      return null;
    }
    if (index >= files.length) return null;
    return files[index++];
  };

  async function worker(): Promise<void> {
    for (;;) {
      const file = next();
      if (!file) return;
      try {
        // no-store로 두면 SW가 가로채 캐시한 응답을 그대로 사용한다.
        // body는 읽지 않는다 (메모리 압박 회피) — 응답 객체만 받아도
        // SW의 CacheFirst가 캐시에 저장하기에 충분.
        const res = await fetch(`${TTS_BASE_URL}${file}`, {
          method: 'GET',
          signal: opts.signal,
        });
        if (res.ok || res.type === 'opaque' || res.status === 206) {
          done++;
        } else {
          failed++;
        }
      } catch {
        if (opts.signal?.aborted) {
          aborted = true;
          return;
        }
        failed++;
      }
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
