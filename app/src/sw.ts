/// <reference lib="webworker" />
/**
 * 새문안교회 중국어 성경반(중급) — Service Worker (injectManifest 모드)
 *
 * generateSW 모드와의 차이:
 *   - precache 진행률을 fetch 한 건씩 페이지에 postMessage 로 보고한다.
 *     (Service Worker spec 에는 다운로드 % 이벤트가 없어, generateSW 모드에서는
 *      0→70% 임의 시뮬레이션만 가능했다.)
 *   - precache 실패 시 install 자체를 reject 해 SW 를 redundant 로 만든다 →
 *     페이지의 statechange 리스너가 즉시 에러 UI 로 전환.
 *
 * 캐시 정책은 기존 generateSW 의 runtimeCaching 5건과 1:1 동등하다.
 */

import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { RangeRequestsPlugin } from 'workbox-range-requests';

// vite-plugin-pwa(injectManifest) 가 빌드 시 self.__WB_MANIFEST 를
// 실제 자산 목록(아래 타입의 배열)으로 치환한다.
type PrecacheEntry = { url: string; revision: string | null };

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};
// vite define 에서 주입.
declare const __TTS_CACHE_MAX_ENTRIES__: number;

// ────────────────────────────────────────────────────────────────────────────
// 캐시 이름
// ────────────────────────────────────────────────────────────────────────────

/** App shell + route 청크 precache. SW 코드가 바뀌면 새 install 이 일어나며
 *  새 manifest 로 다시 채워지므로 버전 접미사는 두지 않는다. */
const PRECACHE = 'app-precache-v1';
const RUNTIME_CACHE_NAMES = [
  'lessons-content',
  'appendices-content',
  'search-index',
  'route-chunks',
  'tts-audio',
];
const KEEP_CACHES = new Set<string>([PRECACHE, ...RUNTIME_CACHE_NAMES]);

// ────────────────────────────────────────────────────────────────────────────
// Precache 매니페스트 정규화
//   __WB_MANIFEST 의 url 은 base 에 대한 상대 경로(예: "index.html",
//   "assets/index-abc.js"). 브라우저가 요청하는 URL.pathname 은 절대 경로
//   (예: "/SMCB/index.html"). 매칭하려면 절대 경로로 통일해야 한다.
//   캐시 키는 revision 을 쿼리로 붙여 동일 URL 의 신/구 버전을 구분 가능하게 함.
// ────────────────────────────────────────────────────────────────────────────

/** registration.scope = "https://host/SMCB/" → pathname "/SMCB/" */
const BASE_PATH = new URL(self.registration.scope).pathname;

/** 절대 pathname → 캐시 키(요청 URL) */
const PRECACHE_MAP = new Map<string, string>();

for (const raw of self.__WB_MANIFEST ?? []) {
  const entry: PrecacheEntry =
    typeof raw === 'string' ? { url: raw, revision: null } : raw;

  // url 이 이미 절대(`/...`) 또는 풀(http://) 인 경우는 그대로, 아니면 base 부여.
  let absPath: string;
  if (entry.url.startsWith('http://') || entry.url.startsWith('https://')) {
    absPath = new URL(entry.url).pathname;
  } else if (entry.url.startsWith('/')) {
    absPath = entry.url;
  } else {
    absPath = BASE_PATH + entry.url;
  }
  const cacheKey = entry.revision
    ? `${absPath}?__rev=${encodeURIComponent(entry.revision)}`
    : absPath;
  PRECACHE_MAP.set(absPath, cacheKey);
}

// ────────────────────────────────────────────────────────────────────────────
// 진행률 보고
//   페이지(main.tsx)가 onMessage 로 받아 useUpdateStore 의 phase/pct 를 갱신.
//   includeUncontrolled:true — 첫 install 단계에선 SW 가 클라이언트를 아직
//   claim 하지 않아 controlled 클라이언트가 0개일 수 있다.
// ────────────────────────────────────────────────────────────────────────────

type ProgressPhase = 'downloading' | 'installing' | 'installed' | 'error';

async function postProgress(
  phase: ProgressPhase,
  completed: number,
  total: number,
): Promise<void> {
  const pct = total === 0 ? 100 : Math.min(100, Math.round((completed / total) * 100));
  const clients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: 'window',
  });
  for (const client of clients) {
    client.postMessage({
      type: 'sw-precache-progress',
      phase,
      pct,
      completed,
      total,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// install — fetch 동시성 4 로 precache 수행, 한 건 끝날 때마다 진행률 보고.
//   - 전체 실패(모든 항목 fetch 실패) → install reject → SW redundant → 에러 UI
//   - 일부 실패 → 경고는 남기되 install 은 통과(앱 shell 만이라도 동작)
// ────────────────────────────────────────────────────────────────────────────

const FETCH_CONCURRENCY = 4;

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAll());
});

async function precacheAll(): Promise<void> {
  const entries = Array.from(PRECACHE_MAP.entries()); // [absPath, cacheKey][]
  const total = entries.length;
  let completed = 0;
  let failed = 0;

  await postProgress('downloading', 0, total);
  if (total === 0) {
    await postProgress('installed', 0, 0);
    return;
  }

  const cache = await caches.open(PRECACHE);
  const queue = [...entries];

  async function runWorker(): Promise<void> {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const [absPath, cacheKey] = next;
      try {
        // cache:'reload' — HTTP 캐시를 우회하고 네트워크에서 받아 최신 보장.
        //   precache 의 목적은 "현 SW 빌드 시점의 자산을 캡처" 이므로
        //   브라우저 HTTP 캐시의 오래된 응답을 받으면 안 된다.
        const res = await fetch(absPath, { cache: 'reload' });
        if (res.ok || res.type === 'opaque') {
          // cacheKey 로 저장 — fetch 핸들러도 같은 키로 lookup.
          await cache.put(cacheKey, res.clone());
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      completed++;
      // 0~85% downloading, 85~100% installing(캐시 쓰기 + 마무리)
      const phase: ProgressPhase = completed / total < 0.85 ? 'downloading' : 'installing';
      await postProgress(phase, completed, total);
    }
  }

  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, total) }, () => runWorker());
  await Promise.all(workers);

  if (failed === total) {
    // 전부 실패 — install 자체를 실패시켜 SW 를 redundant 상태로 보낸다.
    // 페이지 statechange 리스너가 곧 에러 UI 로 전환.
    await postProgress('error', completed, total);
    throw new Error(`precache failed: 0/${total} entries cached`);
  }
  await postProgress('installed', completed, total);
}

// ────────────────────────────────────────────────────────────────────────────
// activate — 오래된 캐시 정리 + clientsClaim
//   1) 우리가 관리하지 않는 캐시(workbox-precache-v2 등 과거 generateSW 잔재 포함) 삭제
//   2) PRECACHE 내부의 stale 엔트리(이번 manifest 에 없는 URL) 삭제
//   3) clients.claim() — 첫 install 시 즉시 페이지 제어
// ────────────────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(activate());
});

async function activate(): Promise<void> {
  // 1. 모르는 캐시 일괄 삭제
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => !KEEP_CACHES.has(name))
      .map((name) => caches.delete(name)),
  );

  // 2. PRECACHE 내부 stale 엔트리 정리
  const cache = await caches.open(PRECACHE);
  const keepCacheKeys = new Set<string>(PRECACHE_MAP.values());
  const cachedRequests = await cache.keys();
  await Promise.all(
    cachedRequests
      .filter((req) => {
        const u = new URL(req.url);
        return !keepCacheKeys.has(u.pathname + u.search);
      })
      .map((req) => cache.delete(req)),
  );

  // 3. 첫 install 시 즉시 페이지 제어 (generateSW 시절 clientsClaim:true 동등)
  await self.clients.claim();
}

// ────────────────────────────────────────────────────────────────────────────
// message — 페이지의 SKIP_WAITING 요청 처리 (vite-plugin-pwa updateSWA 가 사용)
// ────────────────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | null | undefined;
  if (data && data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// ────────────────────────────────────────────────────────────────────────────
// fetch — precache 우선, navigation fallback, 나머지는 workbox-routing 위임
// ────────────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // (a) SPA navigation — 항상 캐시된 index.html 을 우선 제공
  //     generateSW 의 navigateFallback 와 동등하되, 네트워크 우선이 아닌
  //     캐시 우선으로 한다(앱 shell 은 SW 가 다음 업데이트로 갱신).
  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(req));
    return;
  }

  // (b) precache 히트
  const cacheKey = PRECACHE_MAP.get(url.pathname);
  if (cacheKey) {
    event.respondWith(handlePrecache(cacheKey, req));
    return;
  }

  // (c) 나머지(런타임 캐시 대상)는 아래 registerRoute 가 처리.
});

async function handleNavigation(req: Request): Promise<Response> {
  const indexAbsPath = `${BASE_PATH}index.html`;
  const indexKey = PRECACHE_MAP.get(indexAbsPath);
  if (indexKey) {
    const cache = await caches.open(PRECACHE);
    const cached = await cache.match(indexKey);
    if (cached) return cached;
  }
  try {
    return await fetch(req);
  } catch {
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>오프라인</title><p>오프라인 상태입니다.',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function handlePrecache(cacheKey: string, req: Request): Promise<Response> {
  const cache = await caches.open(PRECACHE);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  // 캐시 miss(이론상 발생하면 안 됨) — 네트워크 fallback.
  return fetch(req);
}

// ────────────────────────────────────────────────────────────────────────────
// 런타임 캐시 — 기존 generateSW workbox.runtimeCaching 5건과 1:1 이전
// ────────────────────────────────────────────────────────────────────────────

// lessons-vol{1,2,3} 데이터 청크
registerRoute(
  ({ url }) => /\/assets\/lessons-vol\d+-.*\.js$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'lessons-content',
    plugins: [
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 90 }),
    ],
  }),
);

// 부록 데이터 청크
registerRoute(
  ({ url }) => /\/assets\/appendices-.*\.js$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'appendices-content',
    plugins: [
      new ExpirationPlugin({ maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 90 }),
    ],
  }),
);

// 전문 검색 인덱스
registerRoute(
  ({ url }) => /\/assets\/search-index-.*\.js$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'search-index',
    plugins: [
      new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 }),
    ],
  }),
);

// Route 청크 안전망 — precache 에 못 들어간 동적 import 자산.
//   precache 와 패턴이 겹쳐도 위 fetch 핸들러가 precache 히트는 가로채므로
//   여기까지 내려오는 건 precache 에 없는 청크에 한정된다.
registerRoute(
  ({ url }) =>
    /\/assets\/(?!lessons-vol|appendices-|search-index-)[a-zA-Z]+-.*\.js$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'route-chunks',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 90 }),
    ],
  }),
);

// 사전녹음 zh TTS mp3 — Workbox range-requests 권장 패턴
// (https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video)
//
// 동작 원리:
//   1. 첫 요청: 200 Full response 를 받아 캐시에 저장
//   2. 후속 Range 요청: 캐시된 200 을 RangeRequestsPlugin 이 Range 헤더에
//      맞춰 슬라이스해서 206 으로 응답
//   3. opaque(0): 일부 CDN cross-origin 응답 대응
//
// 주의: 206 자체는 캐시하지 않는다. 206 을 캐시하면 부분만 저장돼
//       이후 전체 재생이 깨진다 (Workbox 공식 권고).
//
// matchOptions.ignoreVary: 모바일 브라우저가 Accept-Encoding 등 Vary 헤더를
//       가변적으로 보내는 경우의 cache miss 회피.
registerRoute(
  ({ url }) => url.pathname.includes('/tts/') && url.pathname.endsWith('.mp3'),
  new CacheFirst({
    cacheName: 'tts-audio',
    matchOptions: { ignoreVary: true },
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: __TTS_CACHE_MAX_ENTRIES__,
        // R7: maxAgeSeconds = 10년. mp3 파일은 사실상 immutable 이라
        // 1년 만료는 불필요한 cold-fetch 를 일으킨다.
        maxAgeSeconds: 60 * 60 * 24 * 365 * 10,
      }),
      new RangeRequestsPlugin(),
    ],
  }),
);
