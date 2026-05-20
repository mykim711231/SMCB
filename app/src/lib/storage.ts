/**
 * navigator.storage.estimate() + cache management helpers.
 * Powers the Settings → Storage panel.
 */

export type StorageInfo = {
  usageBytes: number;
  quotaBytes: number;
  usageMB: number;
  quotaMB: number;
  percent: number;
  supported: boolean;
};

/**
 * 영구 저장소(persistent storage) 승격을 요청한다.
 *
 * 기본(best-effort) 저장소는 iOS Safari 에서 7일 미사용 시, 또는 디스크
 * 부족 시 브라우저가 학습 진도·즐겨찾기·SRS 기록을 통째로 삭제할 수 있다.
 * persist() 가 승인되면 사용자가 명시적으로 지울 때까지 보존된다.
 *
 * 멱등 — 이미 영구 저장소면 재요청하지 않는다. boot 시 1회 호출.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) {
    return false;
  }
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
    return { usageBytes: 0, quotaBytes: 0, usageMB: 0, quotaMB: 0, percent: 0, supported: false };
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return {
    usageBytes: usage,
    quotaBytes: quota,
    usageMB: +(usage / 1024 / 1024).toFixed(2),
    quotaMB: +(quota / 1024 / 1024).toFixed(1),
    percent: quota > 0 ? +((usage / quota) * 100).toFixed(2) : 0,
    supported: true,
  };
}

/** Delete every Cache API store the SW created — frees offline disk usage. */
export async function clearAllCaches(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const names = await caches.keys();
  await Promise.all(names.map((n) => caches.delete(n)));
  return names.length;
}

/**
 * Delete only content caches (keep app shell).
 *
 * 명시적으로 보존하는 항목 (NEVER 포함시키지 말 것):
 *  - `tts-audio`        : 사전 녹음 mp3 (20~40MB). 사용자가 명시적으로
 *                         "녹음 음성"을 선택하고 다운로드까지 받은 자산.
 *                         이걸 지우면 오프라인에서 음성이 안 나오는 회귀.
 *  - app shell (precache) : 앱 자체. 지우면 다음 로드에서 깨짐.
 *
 * 포함 대상은 본문/검색 데이터처럼 onlineFirst로 복구 가능한 콘텐츠만.
 */
export async function clearContentCaches(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const names = await caches.keys();
  const targets = names.filter((n) =>
    n.includes('lessons-content') ||
    n.includes('appendices-content') ||
    n.includes('search-index'),
  );
  await Promise.all(targets.map((n) => caches.delete(n)));
  return targets.length;
}

/**
 * 사전 녹음 mp3 캐시만 삭제. 용량 부족한 단말기에서 사용자가
 * 명시적으로 정리하고 싶을 때만 호출 — 호출 후 오프라인 음성 재생이
 * 불가해진다. 호출자(Settings UI)는 ttsBulkStatus를 'idle'로 되돌려
 * "지금 받기" 버튼을 다시 노출해야 한다.
 */
export async function clearTTSAudioCache(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const names = await caches.keys();
  const targets = names.filter((n) => n.includes('tts-audio'));
  await Promise.all(targets.map((n) => caches.delete(n)));
  return targets.length;
}
