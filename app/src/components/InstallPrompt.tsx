import { useEffect, useState } from 'react';
import { Share, Plus, X, ChevronDown, Download, Lightbulb } from 'lucide-react';
import AppleLogo from '@/components/AppleLogo';
import AndroidLogo from '@/components/AndroidLogo';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari 전용 플래그
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as Window & { MSStream?: unknown }).MSStream
  );
}

function isIOSSafari(): boolean {
  if (!isIOS()) return false;
  const ua = navigator.userAgent;
  // Chrome on iOS (CriOS), Firefox on iOS (FxiOS), Edge on iOS (EdgiOS) 제외
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

type InstallPromptProps = {
  defaultExpanded?: boolean;
};

export default function InstallPrompt({ defaultExpanded = false }: InstallPromptProps = {}): JSX.Element | null {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
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

  const androidAvailable = deferredPrompt !== null;
  const iosAvailable = isIOSSafari();

  const handleAndroidInstall = async (): Promise<void> => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
      setInstalled(true);
    }
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
            <span className="block text-sm font-bold text-fg inline-flex items-center gap-1.5">
              <Download size={14} aria-hidden /> 홈 화면에 앱으로 설치
            </span>
            <span className="block text-xs text-muted mt-0.5">
              {expanded ? '접기' : '탭하여 설치 방법 보기'}
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
                onClick={handleAndroidInstall}
                disabled={!androidAvailable}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AndroidLogo size={16} />
                Android에 설치
              </button>
              <button
                type="button"
                onClick={() => setShowIOSModal(true)}
                disabled={!iosAvailable}
                className="inline-flex items-center gap-1.5 rounded-full bg-white text-primary text-sm font-semibold px-4 py-2 border border-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AppleLogo size={14} />
                iPhone에 설치
              </button>
            </div>
            {!androidAvailable && !iosAvailable && (
              <p className="text-xs text-muted mt-3">
                모바일에서 이 페이지를 열면 설치 버튼이 활성화됩니다.
              </p>
            )}
            {!androidAvailable && iosAvailable && (
              <p className="text-xs text-muted mt-3">
                Android는 Chrome 메뉴 → "앱 설치"로도 가능합니다.
              </p>
            )}
            {androidAvailable && !iosAvailable && (
              <p className="text-xs text-muted mt-3">
                iPhone은 Safari로 이 페이지를 열어주세요.
              </p>
            )}
          </div>
        )}
      </section>
      {showIOSModal && <IOSInstallModal onClose={() => setShowIOSModal(false)} />}
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
