import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string };

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
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: '새문안교회 중국어 성경반(중급)',
        short_name: 'SMCB 中文',
        description: '새문안교회 중국어 성경반(중급) 학습 PWA',
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
        navigateFallback: `${base}index.html`,
        // Minimal precache: app shell only. Lesson volumes, appendices,
        // and the search index are emitted as JS chunks but EXCLUDED from
        // precache and cached lazily on first access (device storage diet).
        globPatterns: ['**/*.{css,html,svg,webmanifest}', 'assets/index-*.js', 'assets/react-*.js', 'assets/state-*.js', 'assets/tts-*.js', 'assets/Home-*.js', 'assets/loaders-*.js', 'assets/workbox-*.js', 'assets/TTSButton-*.js', 'assets/SectionHeader-*.js', 'assets/check-*.js', 'assets/x-*.js'],
        globIgnores: [
          '**/lessons-vol*.js',
          '**/appendices*.js',
          '**/search-index*.js',
          '**/search-*.js',
          '**/Lesson-*.js',
          '**/Search-*.js',
          '**/Flashcards-*.js',
          '**/Settings-*.js',
          '**/About-*.js',
          '**/Toc-*.js',
          '**/Appendix-*.js',
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
            // Route-level chunks (Lesson/Search/Flashcards pages) — fetch lazily.
            urlPattern: /\/assets\/(Lesson|Search|Flashcards|Settings|About|Toc|Appendix|search)-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'route-chunks',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
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
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 365 },
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
