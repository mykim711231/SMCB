import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string };

// 사전녹음 zh-tts mp3 캐시 용량(maxEntries) 계산.
//   maxEntries보다 캐시에 들어온 항목이 많아지면 LRU로 오래된 항목부터 evict된다.
//   매니페스트가 2,500개 → maxEntries=3000(과거)이면 안전 마진은 200개에 불과해
//   사용자가 일괄 다운로드 직후 한 곡씩 들으며 cache hit가 발생하는 도중에도
//   "첫 항목 evict → 다시 fetch → 마지막 항목 evict" 회전이 시작될 수 있다.
//   매니페스트의 unique 파일 수 + 50% 마진을 동적으로 사용한다. 매니페스트가
//   비어 있어도(빈 객체) Workbox가 0을 허용하지 않으므로 최소 200으로 가드.
//   (R6: maxEntries dynamic based on manifest)
const TTS_MANIFEST_PATH = resolve(__dirname, 'src/data/zh-tts-manifest.json');
const TTS_MANIFEST_RAW = JSON.parse(readFileSync(TTS_MANIFEST_PATH, 'utf-8')) as Record<string, string>;
const TTS_UNIQUE_FILES = new Set(Object.values(TTS_MANIFEST_RAW)).size;
const TTS_CACHE_MAX_ENTRIES = Math.max(200, Math.ceil(TTS_UNIQUE_FILES * 1.5));

// DEPLOY_TARGET=cf  → Cloudflare Pages (root path)
// (unset / anything else) → GitHub Pages (/SMCB/ subpath)
const isCloudflare = process.env.DEPLOY_TARGET === 'cf';
const base = isCloudflare ? '/' : '/SMCB/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'generateSW',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        // id/start_url/scope를 base로 고정 — 지정하지 않으면 PWA가
        // 홈 추가 당시의 경로(#/learn 등)에서 부팅돼 해당 route 청크가
        // 캐시되지 않은 경우 흰 화면이 날 수 있다. 항상 홈에서 시작한다.
        id: base,
        name: '새문안교회 중국어 성경반(중급)',
        short_name: 'SMCB 中文',
        description: '새문안교회 중국어 성경반(중급) 학습 PWA',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAFAFA',
        theme_color: '#2563EB',
        lang: 'ko',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: `${base}index.html`,
        // App shell + 모든 route/아이콘 청크를 precache 한다.
        //   과거에는 청크 이름을 수동 허용목록으로 나열했으나, route 페이지가
        //   정적 import 하는 의존 청크(아이콘 등)가 누락되어 오프라인에서
        //   lazy import가 reject → 흰 화면이 발생했다. 청크는 import 그래프
        //   전체가 캐시돼야 로드되므로 작은 JS는 전부 precache 한다.
        //   진짜 무거운 '데이터' 청크(레슨 본문 volumes·부록·검색 인덱스)만
        //   globIgnores로 제외하고 runtimeCaching으로 lazy 캐시한다.
        globPatterns: ['**/*.{css,html,svg,webmanifest}', 'assets/*.js'],
        globIgnores: [
          '**/lessons-vol*.js',
          '**/appendices*.js',
          '**/search-index*.js',
          'sw.js',
          'workbox-*.js',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/lessons-vol\d+-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lessons-content',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            urlPattern: /\/assets\/appendices-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'appendices-content',
              expiration: { maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            urlPattern: /\/assets\/search-index-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'search-index',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            // Route-level + shared chunks not in precache — fetch lazily, cache for offline.
            // Exclude lessons-vol / appendices / search-index which have their own dedicated caches.
            urlPattern: /\/assets\/(?!lessons-vol|appendices-|search-index-)[a-zA-Z]+-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'route-chunks',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            // 사전녹음 zh TTS mp3 — Workbox range-requests 권장 패턴
            // (https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video)
            //
            // 동작 원리:
            //   1. 첫 요청: 200 Full response를 받아 캐시에 저장
            //   2. 후속 Range 요청: 캐시된 200을 RangeRequestsPlugin이
            //      Range 헤더에 맞춰 슬라이스해서 206으로 응답
            //   3. opaque(0): 일부 CDN cross-origin 응답 대응
            //
            // 주의: 206 자체는 캐시하지 않는다. 206을 캐시하면 부분만 저장돼
            //       이후 전체 재생이 깨진다 (Workbox 공식 권고).
            //
            // matchOptions.ignoreVary: 모바일 브라우저가 Accept-Encoding 등
            //       Vary 헤더를 가변적으로 보내는 경우의 cache miss 회피.
            urlPattern: ({ url }: { url: URL }): boolean =>
              url.pathname.includes('/tts/') && url.pathname.endsWith('.mp3'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-audio',
              // R7: maxAgeSeconds = 10년. mp3 파일은 사실상 immutable(파일명에
              // hash가 없지만 매니페스트 자체로 버전 관리됨)이라 1년 만료는
              // 불필요한 cold-fetch를 일으킨다. 사용자가 1년 만에 한 번 들어와도
              // 다시 받지 않고 캐시 hit이 되도록 유효 기간을 사실상 영구로 설정.
              expiration: { maxEntries: TTS_CACHE_MAX_ENTRIES, maxAgeSeconds: 60 * 60 * 24 * 365 * 10 },
              cacheableResponse: { statuses: [0, 200] },
              matchOptions: { ignoreVary: true },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2017',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          state: ['zustand', 'idb-keyval'],
          search: ['minisearch'],
        },
      },
    },
  },
});
