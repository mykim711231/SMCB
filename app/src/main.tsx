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
let installTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

// precache(install 이벤트)가 이 시간 안에 끝나지 않으면 실패로 간주한다.
// Workbox precache의 fetch가 끊긴 네트워크에서 무한 대기하는 경우의 안전망.
const INSTALL_TIMEOUT_MS = 60_000;

function clearSwProgress(): void {
  if (swProgressTimer) {
    clearInterval(swProgressTimer);
    swProgressTimer = null;
  }
}

function clearInstallTimeout(): void {
  if (installTimeoutTimer) {
    clearTimeout(installTimeoutTimer);
    installTimeoutTimer = null;
  }
}

/** precache 실패/타임아웃 → 진행률 정리 후 에러 UI 표시 */
function failInstall(): void {
  clearSwProgress();
  clearInstallTimeout();
  useUpdateStore.getState().setError();
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

/**
 * 설치 중인 SW를 감시한다. 진행 바가 70%에서 멈춘 채 방치되지 않도록
 * 성공·실패·무응답을 모두 종결 처리한다.
 *   - state 'installed' → precache 성공. 진행률 정리 (onNeedRefresh가 곧 ready 표시)
 *   - state 'redundant' → install 이벤트(precache fetch)가 실패해 SW가 폐기됨 → 에러 UI
 *   - 타임아웃          → fetch 무한 대기 등으로 끝내 응답 없음 → 에러 UI
 */
function watchInstall(worker: ServiceWorker): void {
  startInstallingProgress();
  clearInstallTimeout();
  installTimeoutTimer = setTimeout(failInstall, INSTALL_TIMEOUT_MS);
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') {
      clearSwProgress();
      clearInstallTimeout();
    } else if (worker.state === 'redundant') {
      failInstall();
    }
  });
}

/** 에러 UI의 "다시 시도" — registration.update()로 precache를 재시도한다. */
function retryInstall(): void {
  const reg = swRegistration;
  if (!reg) {
    useUpdateStore.getState().dismiss();
    return;
  }
  startInstallingProgress();
  reg.update()
    .then(() => {
      if (reg.installing) {
        watchInstall(reg.installing);
      } else {
        // 새로 받을 게 없음 — 이전 실패가 일시적이었던 것으로 보고 토스트를 닫는다.
        clearSwProgress();
        useUpdateStore.getState().dismiss();
      }
    })
    .catch(failInstall);
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
    swRegistration = r;

    // 이미 대기 중인 SW가 있다면 바로 ready 표시
    if (r.waiting) {
      useUpdateStore.getState().setUpdateFn(() => sw.updateSWA(true));
      return;
    }

    // 새로 설치 중인 SW가 있다면 감시 시작 (성공/실패/타임아웃 종결)
    if (r.installing) {
      watchInstall(r.installing);
      return;
    }

    // 첫 등록: 수동으로 업데이트 체크 (vite-plugin-pwa 기본 interval 보조)
    r.update().then(() => {
      if (r.installing) watchInstall(r.installing);
    }).catch(() => { /* 네트워크 없음 — 무시 */ });
  },

  onNeedRefresh() {
    clearSwProgress();
    clearInstallTimeout();
    useUpdateStore.getState().setUpdateFn(() => sw.updateSWA(true));
  },

  onOfflineReady() {
    // 네트워크 없어도 앱 동작 가능 — 사용자에게 별도 안내 불필요.
  },
});

const sw = _raw as SwHandle;

// 에러 UI의 "다시 시도" 버튼이 호출할 함수 등록
useUpdateStore.getState().setRetryFn(retryInstall);

// SW 교체 완료 시 진행률 UI 정리
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    useUpdateStore.getState().dismiss();
  });

  // iOS standalone PWA에서 SW가 종료되지 않고 살아있는 문제 대응:
  // 사용자가 앱으로 돌아올 때마다 등록을 갱신하여 대기 중인 SW를 발견한다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.ready.then((reg) => {
        reg.update().catch(() => { /* 네트워크 없음 */ });
      });
    }
  });
}

// updateSWA(true) 호출 시 'updating' phase로 전환한 후
// vite-plugin-pwa 원본 updateSWA에 위임한다. (SKIP_WAITING + reload)
// 별도 postMessage/controllerchange 대기는 원본과 중복되어
// Android 검정 화면 등 경합을 유발하므로 제거.
const origUpdate = sw.updateSWA;
sw.updateSWA = async (reloadPage?: boolean): Promise<void> => {
  useUpdateStore.getState().setPhase('updating', 100);
  await origUpdate.call(sw, reloadPage);
};
