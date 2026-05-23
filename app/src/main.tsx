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
// SW 진행률
//   injectManifest 모드의 sw.ts 가 precache fetch 한 건마다
//   { type:'sw-precache-progress', phase, pct } 를 postMessage 한다.
//   여기서는 메시지를 받아 useUpdateStore 의 phase/pct 를 갱신하기만 한다.
//   (generateSW 시절의 0→70% 임의 시뮬레이션은 제거.)
// ---------------------------------------------------------------------------

let installTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

// precache 가 이 시간 안에 끝나지 않으면 실패로 간주한다.
// fetch 가 끊긴 네트워크에서 무한 대기하는 경우의 안전망.
const INSTALL_TIMEOUT_MS = 60_000;

function clearInstallTimeout(): void {
  if (installTimeoutTimer) {
    clearTimeout(installTimeoutTimer);
    installTimeoutTimer = null;
  }
}

/** precache 실패/타임아웃 → 에러 UI 표시 */
function failInstall(): void {
  clearInstallTimeout();
  useUpdateStore.getState().setError();
}

type SwProgressMsg = {
  type: 'sw-precache-progress';
  phase: 'downloading' | 'installing' | 'installed' | 'error';
  pct: number;
  completed: number;
  total: number;
};

/** 설치 중인 SW 를 감시. 타임아웃/redundant 안전망만 담당하고,
 *  진행 표시는 SW 의 postMessage 가 전담한다. */
function watchInstall(worker: ServiceWorker): void {
  // 진행 표시 초기화 — 첫 메시지 도착 전 토스트가 즉시 보이도록.
  useUpdateStore.getState().setPhase('downloading', 0);
  clearInstallTimeout();
  installTimeoutTimer = setTimeout(failInstall, INSTALL_TIMEOUT_MS);
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' || worker.state === 'activated') {
      clearInstallTimeout();
    } else if (worker.state === 'redundant') {
      failInstall();
    }
  });
}

/** 에러 UI 의 "다시 시도" — registration.update() 로 precache 재시도. */
function retryInstall(): void {
  const reg = swRegistration;
  if (!reg) {
    useUpdateStore.getState().dismiss();
    return;
  }
  useUpdateStore.getState().setPhase('downloading', 0);
  reg.update()
    .then(() => {
      if (reg.installing) {
        watchInstall(reg.installing);
      } else {
        // 새로 받을 게 없음 — 이전 실패가 일시적이었던 것으로 보고 토스트를 닫는다.
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
// 대신 onNeedRefresh 로 사용자 확인을 거친 후 업데이트한다.
// ---------------------------------------------------------------------------

type SwHandle = ((reloadPage?: boolean) => Promise<void>) & { updateSWA: (reloadPage?: boolean) => Promise<void> };

const _raw = registerSW({
  onRegisteredSW(_swUrl: string, r?: ServiceWorkerRegistration) {
    if (!r) return;
    swRegistration = r;

    // 이미 대기 중인 SW 가 있다면 바로 ready 표시
    if (r.waiting) {
      useUpdateStore.getState().setUpdateFn(() => sw.updateSWA(true));
      return;
    }

    // 새로 설치 중인 SW 가 있다면 감시 시작 (타임아웃/redundant 처리)
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
    clearInstallTimeout();
    useUpdateStore.getState().setUpdateFn(() => sw.updateSWA(true));
  },

  onOfflineReady() {
    // 네트워크 없어도 앱 동작 가능 — 사용자에게 별도 안내 불필요.
  },
});

const sw = _raw as SwHandle;

// 에러 UI 의 "다시 시도" 버튼이 호출할 함수 등록
useUpdateStore.getState().setRetryFn(retryInstall);

// SW 가 postMessage 로 보내는 precache 진행률 수신
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as SwProgressMsg | null;
    if (!data || data.type !== 'sw-precache-progress') return;

    if (data.phase === 'error') {
      failInstall();
      return;
    }

    // installed 단계는 onNeedRefresh / onOfflineReady 가 후속 처리.
    // 여기서는 진행 바를 100% 까지 채워두기만 한다.
    const phase = data.phase === 'installed' ? 'installing' : data.phase;
    useUpdateStore.getState().setPhase(phase, data.pct);
  });

  // SW 교체 완료 시 진행률 UI 정리
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    useUpdateStore.getState().dismiss();
  });

  // iOS standalone PWA 에서 SW 가 종료되지 않고 살아있는 문제 대응:
  // 사용자가 앱으로 돌아올 때마다 등록을 갱신하여 대기 중인 SW 를 발견한다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.ready.then((reg) => {
        reg.update().catch(() => { /* 네트워크 없음 */ });
      });
    }
  });
}

// updateSWA(true) — 직접 SKIP_WAITING + 3초 하드 타임아웃으로 강제 reload.
//
// 이전엔 vite-pwa 의 updateSWA(true) 가 controllerchange 를 기다린 후 reload 했는데,
// iOS standalone PWA / Windows 데스크톱 등 일부 환경에서 controllerchange 가
// 안 와 멈추는 사례 다수 보고. 10초 fallback 도 어떤 환경에선 동작하지 않아
// 더 적극적인 흐름으로 교체:
//   1. waiting SW 에 직접 SKIP_WAITING postMessage (vite-pwa 와 독립)
//   2. controllerchange OR 3초 타임아웃 — 둘 중 먼저인 신호로 reload
//   3. vite-pwa updateSWA(false) 도 백그라운드 호출 (혹시 모를 추가 처리)
//   4. reload 는 location.reload 대신 location.replace 사용 — beforeunload
//      등에 가로채일 가능성이 더 낮다.
const UPDATE_HARD_RELOAD_MS = 3_000;
const origUpdate = sw.updateSWA;

function forceReload(): void {
  // replace 가 일부 환경(SW 가 redirect 가로채기 등)에서 막히면 reload 로 폴백
  try {
    window.location.replace(window.location.href);
  } catch {
    window.location.reload();
  }
}

sw.updateSWA = async (_reloadPage?: boolean): Promise<void> => {
  useUpdateStore.getState().setPhase('updating', 100);

  // 1. waiting SW 에 직접 SKIP_WAITING. swRegistration.waiting 이 비어있어도
  //    onRegisteredSW/onNeedRefresh 시점의 registration 을 보유하므로 OK.
  try {
    swRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  } catch { /* postMessage 실패 무시 — origUpdate 가 다시 시도 */ }

  // 2. vite-pwa 의 updateSWA 도 보조로 호출. reloadPage=false 로 두어
  //    중복 reload 경합을 피한다(reload 는 우리가 담당).
  try {
    void (origUpdate as ((r?: boolean) => Promise<void>) | undefined)
      ?.call(sw, false)
      ?.catch(() => undefined);
  } catch { /* ignore */ }

  // 3. controllerchange 또는 하드 타임아웃 — 먼저인 신호로 reload
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true });
    }
    window.setTimeout(finish, UPDATE_HARD_RELOAD_MS);
  });

  forceReload();
};

// 사용자 탭 강제 reload (UpdateToast 의 'updating' 클릭이 호출)
useUpdateStore.getState().setForceReloadFn(forceReload);
