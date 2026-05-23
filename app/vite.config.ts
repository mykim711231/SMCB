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
    // sw.ts 가 사용. vite-plugin-pwa 의 injectManifest 빌드에도 적용된다.
    __TTS_CACHE_MAX_ENTRIES__: JSON.stringify(TTS_CACHE_MAX_ENTRIES),
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // injectManifest 모드 — sw.ts 를 직접 작성한다.
      // generateSW 와 달리 precache install 단계에서 fetch 한 건씩
      // 진행률을 postMessage 로 페이지에 보고할 수 있어 실제 다운로드
      // 진행 바를 그릴 수 있다.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
      injectManifest: {
        // App shell + 모든 route/아이콘 청크를 precache 한다.
        //   과거에는 청크 이름을 수동 허용목록으로 나열했으나, route 페이지가
        //   정적 import 하는 의존 청크(아이콘 등)가 누락되어 오프라인에서
        //   lazy import가 reject → 흰 화면이 발생했다. 청크는 import 그래프
        //   전체가 캐시돼야 로드되므로 작은 JS는 전부 precache 한다.
        //   진짜 무거운 '데이터' 청크(레슨 본문 volumes·부록·검색 인덱스)만
        //   globIgnores로 제외하고 sw.ts 의 registerRoute 로 lazy 캐시한다.
        globPatterns: ['**/*.{css,html,svg,webmanifest}', 'assets/*.js'],
        globIgnores: [
          '**/lessons-vol*.js',
          '**/appendices*.js',
          '**/search-index*.js',
          'sw.js',
          'workbox-*.js',
        ],
        // workbox-precaching 의 manifest 항목 크기 제한 기본 2 MiB —
        // 우리 빌드는 모든 청크가 작지만 안전 마진 5 MiB.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
