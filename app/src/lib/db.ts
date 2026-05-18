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
