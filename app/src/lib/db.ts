/**
 * Thin wrapper around idb-keyval — single keyval store, namespaced keys.
 * All app persistence (settings, progress, favorites, SRS) lives here.
 */
import { get, set, del, keys, createStore } from 'idb-keyval';

const store = createStore('smcb-db', 'kv');

export async function dbGet<T>(key: string): Promise<T | undefined> {
  return get<T>(key, store);
}

export async function dbSet<T>(key: string, value: T): Promise<void> {
  return set(key, value, store);
}

export async function dbDel(key: string): Promise<void> {
  return del(key, store);
}

export async function dbKeys(): Promise<string[]> {
  return (await keys(store)).map(String);
}

/** Clear app-only keys (does not touch SW caches). */
export async function dbClearAll(): Promise<void> {
  const ks = await dbKeys();
  await Promise.all(ks.map((k) => del(k, store)));
}

/** 진행상황 백업 파일 포맷. version 은 호환성 확인용. */
export type DbBackup = {
  app: 'smcb';
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
};

/** 모든 앱 키(설정/진도/즐겨찾기/SRS)를 JSON 백업 객체로 추출. */
export async function dbExportAll(): Promise<DbBackup> {
  const ks = await dbKeys();
  const entries = await Promise.all(
    ks.map(async (k) => [k, await dbGet<unknown>(k)] as const),
  );
  return {
    app: 'smcb',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: Object.fromEntries(entries),
  };
}

/**
 * 백업 객체를 IndexedDB 로 복원. 기존 키는 덮어쓰며, 백업에 없는 키는
 * 보존한다. 복원 후에는 호출자가 페이지를 새로고침해 스토어를 다시
 * 하이드레이트해야 한다.
 */
export async function dbImportAll(backup: DbBackup): Promise<number> {
  if (!backup || backup.app !== 'smcb' || typeof backup.data !== 'object') {
    throw new Error('SMCB 백업 파일이 아닙니다.');
  }
  const entries = Object.entries(backup.data);
  await Promise.all(entries.map(([k, v]) => set(k, v, store)));
  return entries.length;
}
