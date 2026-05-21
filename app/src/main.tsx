import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { useSettings } from './stores/settings';
import { useProgress } from './stores/progress';
import { useFavorites } from './stores/favorites';
import { useSRS } from './stores/srs';
import { useUpdateStore } from './stores/useUpdateStore';
import { requestPersistentStorage } from './lib/storage';
import './styles/tokens.css';
import './styles/index.css';

// Hydrate IndexedDB stores before first paint of routed content.
void useSettings.getState().hydrate();
void useProgress.getState().hydrate();
void useFavorites.getState().hydrate();
void useSRS.getState().hydrate();

// 학습 기록이 브라우저 자동 정리(iOS 7일 미사용 등)로 사라지지 않도록
// 영구 저장소 승격을 요청한다. 멱등이므로 매 부팅 호출해도 무방.
void requestPersistentStorage();

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);

// ---------------------------------------------------------------------------
// SW 진행률 헬퍼
// Service Worker spec에는 다운로드 %가 없으므로, SW 생명주기 이벤트 기반으로
// 추정 진행률을 보여준다. Workbox precache(install event)가 가장 오래 걸린다.
// ---------------------------------------------------------------------------

let swProgressTimer: ReturnType<typeof setInterval> | null = null;

function clearSwProgress(): void {
  if (swProgressTimer) {
    clearInterval(swProgressTimer);
    swProgressTimer = null;
  }
}

/** installing 단계 진입 → 0%→70% 시뮬레이션 (durationMs 내에 선형 증가) */
function startInstallingProgress(durationMs = 4000): void {
  clearSwProgress();
  const steps = Math.max(1, Math.round(durationMs / 100));
  const inc = 70 / steps;
  let current = 0;
  useUpdateStore.getState().setPhase('downloading', 0);
  swProgressTimer = setInterval(() => {
    current = Math.min(70, current + inc);
    const pct = Math.round(current);
    useUpdateStore.getState().setPhase(pct < 40 ? 'downloading' : 'installing', pct);
    if (current >= 70) clearSwProgress();
  }, 100);
}

// ---------------------------------------------------------------------------
// Service Worker 등록 — 진행률 표시 + 사용자 확인 후 업데이트 (§10.2)
//
// immediate:true 시 skipWaiting 후 즉시 reload → precache 미완료 상태에서
// 페이지가 새로고침되어 흰 화면(white screen)이 발생할 수 있다.
// 대신 onNeedRefresh로 사용자 확인을 거친 후 업데이트한다.
// ---------------------------------------------------------------------------

type SwHandle = ((reloadPage?: boolean) => Promise<void>) & { updateSWA: (reloadPage?: boolean) => Promise<void> };

const _raw = registerSW({
  onRegisteredSW(_swUrl: string, r?: ServiceWorkerRegistration) {
    if (!r) return;
    // 이미 대기 중인 SW가 있다면 바로 ready 표시
    if (r.waiting) {
      useUpdateStore.getState().setUpdateFn(() => sw.updateSWA(true));
      return;
    }

    // 새로 설치된 SW가 있다면 진행률 시작
    if (r.installing) {
      startInstallingProgress();
      r.installing.addEventListener('statechange', () => {
        const ir = r.installing;
        if (!ir) return;
        if (ir.state === 'installed') {
          clearSwProgress();
          // onNeedRefresh가 곧 호출됨 → setUpdateFn으로 토스트 표시
        }
      });
      return;
    }

    // 첫 등록: 수동으로 업데이트 체크 (vite-plugin-pwa 기본 interval 보조)
    r.update().then((newReg) => {
      if (newReg?.installing) {
        startInstallingProgress();
        newReg.installing.addEventListener('statechange', () => {
          const ni = newReg.installing;
          if (!ni) return;
          if (ni.state === 'installed') clearSwProgress();
        });
      }
    }).catch(() => { /* 네트워크 없음 — 무시 */ });
  },

  onNeedRefresh() {
    clearSwProgress();
    useUpdateStore.getState().setUpdateFn(() => sw.updateSWA(true));
  },

  onOfflineReady() {
    // 네트워크 없어도 앱 동작 가능 — 사용자에게 별도 안내 불필요.
  },
});

const sw = _raw as SwHandle;

// SW 교체 완료 시 진행률 UI 정리
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    useUpdateStore.getState().dismiss();
  });
}

// updateSWA(true) 호출 시 표시할 업데이트 중 상태를 위해
// updateFn이 호출되기 직전에 'updating' phase로 전환
const origUpdate = sw.updateSWA;
sw.updateSWA = async (reloadPage?: boolean): Promise<void> => {
  useUpdateStore.getState().setPhase('updating', 100);
  await origUpdate.call(sw, reloadPage);
};
