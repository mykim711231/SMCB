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

/** Delete only content caches (keep app shell). */
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
