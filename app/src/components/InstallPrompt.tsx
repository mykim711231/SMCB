import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Share, Plus, X, ChevronDown, Download, Lightbulb, Monitor, Smartphone, HelpCircle } from 'lucide-react';
import AppleLogo from '@/components/AppleLogo';
import AndroidLogo from '@/components/AndroidLogo';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type OS = 'android' | 'ios' | 'windows' | 'mac' | 'other';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari 전용 플래그
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  return 'other';
}

function isIOSSafari(): boolean {
  if (detectOS() !== 'ios') return false;
  const ua = navigator.userAgent;
  // Chrome on iOS (CriOS), Firefox on iOS (FxiOS), Edge on iOS (EdgiOS) 제외
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function isMacSafari(): boolean {
  if (detectOS() !== 'mac') return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
}

function isSamsungInternet(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /SamsungBrowser/i.test(navigator.userAgent);
}

type InstallPromptProps = {
  defaultExpanded?: boolean;
};

export default function InstallPrompt({ defaultExpanded = false }: InstallPromptProps = {}): JSX.Element | null {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [iosModal, setIosModal] = useState(false);
  const [macModal, setMacModal] = useState(false);
  const [samsungModal, setSamsungModal] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [os, setOs] = useState<OS>('other');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOs(detectOS());
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    // beforeinstallprompt는 Chrome·Edge에서 Android·Windows·Mac·Linux 공통으로 발화한다.
    // 이전엔 "Android에 설치" 라벨에 묶여 있어 Windows 사용자에게 표시조차 안 됐음.
    const onBeforeInstall = (e: Event): void => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = (): void => {
      setDeferredPrompt(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const promptAvailable = deferredPrompt !== null;
  const iosAvailable = isIOSSafari();
  const macSafari = isMacSafari();

  const handlePromptInstall = async (): Promise<void> => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
      setInstalled(true);
    }
  };

  // OS별 1차 버튼 라벨/아이콘. 같은 deferredPrompt를 호출하지만 라벨은 OS에 맞춤.
  const primary: { label: string; icon: JSX.Element } =
    os === 'ios'
      ? { label: 'iPhone에 설치', icon: <AppleLogo size={14} /> }
      : os === 'android'
        ? { label: 'Android에 설치', icon: <AndroidLogo size={16} /> }
        : os === 'windows'
          ? { label: 'Windows에 설치', icon: <Monitor size={16} /> }
          : os === 'mac'
            ? { label: 'Mac에 설치', icon: <AppleLogo size={14} /> }
            : { label: '이 기기에 설치', icon: <Download size={16} /> };

  // iOS는 deferredPrompt가 없으므로 모달, macOS Safari도 동일.
  // 그 외는 deferredPrompt 호출(없으면 비활성).
  const primaryDisabled =
    os === 'ios'
      ? !iosAvailable
      : os === 'mac' && macSafari
        ? false
        : !promptAvailable;

  const samsungAvailable = isSamsungInternet();

  const onPrimaryClick = (): void => {
    if (os === 'ios') {
      setIosModal(true);
      return;
    }
    if (os === 'mac' && macSafari && !promptAvailable) {
      setMacModal(true);
      return;
    }
    // 삼성 인터넷 — 자동 설치 프롬프트가 없으면 수동 가이드 모달
    if (samsungAvailable && !promptAvailable) {
      setSamsungModal(true);
      return;
    }
    void handlePromptInstall();
  };

  return (
    <>
      <section className="rounded-2xl border border-primary/30 bg-primary-soft overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="install-body"
          className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold text-fg inline-flex items-center gap-1.5 flex-wrap">
              <Smartphone size={14} aria-hidden />
              <Monitor size={14} aria-hidden />
              휴대폰 · PC에 앱으로 설치
            </span>
            <span className="block text-xs text-muted mt-0.5">
              {expanded
                ? '접기'
                : os === 'windows'
                  ? '이 Windows PC에 설치할 수 있어요 — 탭하여 보기'
                  : os === 'mac'
                    ? '이 Mac에 설치할 수 있어요 — 탭하여 보기'
                    : os === 'android'
                      ? '이 Android에 설치할 수 있어요 — 탭하여 보기'
                      : os === 'ios'
                        ? '이 iPhone에 설치할 수 있어요 — 탭하여 보기'
                        : 'Windows · Mac · Android · iPhone 모두 가능 — 탭하여 보기'}
            </span>
          </span>
          <ChevronDown
            size={20}
            aria-hidden
            className={`flex-none text-muted transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>
        {expanded && (
          <div id="install-body" className="px-4 sm:px-5 pb-4 sm:pb-5">
            <p className="text-xs text-muted mb-3">
              한 번 설치하면 인터넷 없이도 사용할 수 있어요.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onPrimaryClick}
                disabled={primaryDisabled}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {primary.icon}
                {primary.label}
              </button>
              <Link
                to="/help"
                className="inline-flex items-center gap-1.5 rounded-full bg-white text-primary text-sm font-semibold px-4 py-2 border border-primary"
              >
                <HelpCircle size={14} aria-hidden />
                다른 기기 설치법
              </Link>
            </div>
            {primaryDisabled && os !== 'other' && (
              <p className="text-xs text-muted mt-3">
                {os === 'ios'
                  ? 'iPhone은 Safari로 이 페이지를 열어야 설치할 수 있습니다.'
                  : os === 'mac'
                    ? 'Mac은 Chrome·Edge 또는 Safari 17 이상에서 설치 가능합니다.'
                    : samsungAvailable
                      ? '삼성 인터넷: 주소창 + 아이콘 → "홈 화면"을 선택하거나, 아래 버튼을 눌러 상세 안내를 확인하세요.'
                      : '브라우저 메뉴(⋮)에서 "앱 설치" 또는 "홈 화면에 추가"를 사용해 보세요.'}
              </p>
            )}
            {/* 삼성 인터넷 수동 설치 가이드 버튼 */}
            {samsungAvailable && !promptAvailable && (
              <button
                type="button"
                onClick={() => setSamsungModal(true)}
                className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-primary-soft text-primary text-xs font-semibold px-3 py-1.5 border border-primary/30"
              >
                <Lightbulb size={12} aria-hidden />
                삼성 인터넷 설치 방법 보기
              </button>
            )}
            {os === 'other' && (
              <p className="text-xs text-muted mt-3">
                브라우저에서 설치 옵션을 제공하지 않습니다. <Link to="/help" className="text-primary underline">도움말</Link>에서 OS별 안내를 확인하세요.
              </p>
            )}
          </div>
        )}
      </section>
      {iosModal && <IOSInstallModal onClose={() => setIosModal(false)} />}
      {macModal && <MacInstallModal onClose={() => setMacModal(false)} />}
      {samsungModal && <SamsungInstallModal onClose={() => setSamsungModal(false)} />}
    </>
  );
}

function IOSInstallModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-install-title"
      onClick={onClose}
    >
      <div
        className="bg-bg rounded-2xl max-w-md w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 id="ios-install-title" className="text-lg font-bold text-fg inline-flex items-center gap-2">
            <AppleLogo size={18} />
            iPhone에 설치하기
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted hover:text-fg p-1"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <p className="text-sm text-muted mb-4">
          iOS는 Safari에서만 PWA 설치가 가능합니다. 아래 3단계를 따라주세요.
        </p>
        <ol className="space-y-3 text-sm text-fg">
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
              1
            </span>
            <span>
              화면 <b>아래 가운데</b>의{' '}
              <Share size={14} className="inline align-text-bottom" aria-hidden />{' '}
              <b>공유 버튼</b>을 누르세요.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
              2
            </span>
            <span>
              메뉴를 아래로 스크롤해서{' '}
              <Plus size={14} className="inline align-text-bottom" aria-hidden />{' '}
              <b>"홈 화면에 추가"</b>를 선택하세요.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
              3
            </span>
            <span>
              우측 상단 <b>"추가"</b> 버튼을 누르면 홈 화면에 앱 아이콘이
              생성됩니다.
            </span>
          </li>
        </ol>
        <p className="text-xs text-muted mt-4 pt-3 border-t border-divider inline-flex items-start gap-1.5">
          <Lightbulb size={14} aria-hidden className="flex-none mt-0.5" />
          <span>Chrome·다른 브라우저로 보고 계시면 Safari에서 이 페이지를 다시 열어주세요.</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 rounded-full bg-primary text-white text-sm font-semibold py-2.5"
        >
          확인
        </button>
      </div>
    </div>
  );
}

function MacInstallModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mac-install-title"
      onClick={onClose}
    >
      <div
        className="bg-bg rounded-2xl max-w-md w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 id="mac-install-title" className="text-lg font-bold text-fg inline-flex items-center gap-2">
            <AppleLogo size={18} />
            Mac에 설치하기
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted hover:text-fg p-1"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <p className="text-sm text-muted mb-4">
          Safari 17 이상은 메뉴에서 직접 Dock에 추가할 수 있습니다.
        </p>
        <ol className="space-y-3 text-sm text-fg">
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">1</span>
            <span>메뉴바의 <b>파일</b> 메뉴를 엽니다.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">2</span>
            <span><b>"Dock에 추가"</b>를 선택합니다.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">3</span>
            <span>이름을 확인하고 <b>"추가"</b>를 누르면 Dock·Launchpad에서 실행할 수 있습니다.</span>
          </li>
        </ol>
        <p className="text-xs text-muted mt-4 pt-3 border-t border-divider inline-flex items-start gap-1.5">
          <Lightbulb size={14} aria-hidden className="flex-none mt-0.5" />
          <span>Chrome·Edge를 쓰는 경우 주소창 오른쪽의 <b>설치 아이콘</b>을 클릭하세요.</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 rounded-full bg-primary text-white text-sm font-semibold py-2.5"
        >
          확인
        </button>
      </div>
    </div>
  );
}

function SamsungInstallModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="samsung-install-title"
      onClick={onClose}
    >
      <div
        className="bg-bg rounded-2xl max-w-md w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 id="samsung-install-title" className="text-lg font-bold text-fg inline-flex items-center gap-2">
            <Smartphone size={18} />
            삼성 인터넷에 설치하기
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted hover:text-fg p-1"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <p className="text-sm text-muted mb-4">
          삼성 인터넷은 두 가지 방법으로 설치할 수 있습니다. 자동 설치 창이 뜨지 않으면 아래 방법을 따라주세요.
        </p>

        <p className="text-sm font-bold text-fg mb-2">방법 1 — 주소창 + 아이콘</p>
        <ol className="space-y-3 text-sm text-fg mb-4">
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">1</span>
            <span>주소창 오른쪽에 <b>+ 아이콘</b>이 보이면 누르세요.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">2</span>
            <span>나오는 메뉴에서 <b>"홈 화면"</b>을 선택하세요.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">3</span>
            <span>이름을 확인하고 <b>"추가"</b>를 누르면 홈 화면에 앱 아이콘이 생성됩니다.</span>
          </li>
        </ol>

        <p className="text-sm font-bold text-fg mb-2">방법 2 — ⋮ 메뉴에서 추가</p>
        <ol className="space-y-3 text-sm text-fg">
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">1</span>
            <span>화면 오른쪽 아래 <b>⋮ (더보기)</b> 메뉴를 누르세요.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">2</span>
            <span><b>"현재 페이지 추가"</b> → <b>"홈 화면"</b>을 선택하세요.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">3</span>
            <span>이름을 확인하고 <b>"추가"</b>를 누르면 완료됩니다.</span>
          </li>
        </ol>

        <p className="text-xs text-muted mt-4 pt-3 border-t border-divider inline-flex items-start gap-1.5">
          <Lightbulb size={14} aria-hidden className="flex-none mt-0.5" />
          <span>+ 아이콘이 보이지 않으면 방법 2(⋮ 메뉴)로 설치하세요. 설치 후에는 인터넷 없이도 사용할 수 있습니다.</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 rounded-full bg-primary text-white text-sm font-semibold py-2.5"
        >
          확인
        </button>
      </div>
    </div>
  );
}
