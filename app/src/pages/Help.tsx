import { useEffect, useMemo, useState } from 'react';
import {
  Volume2,
  Smartphone,
  Apple,
  Monitor,
  HelpCircle,
  ChevronDown,
  Play,
  CheckCircle2,
  AlertTriangle,
  Mail,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  awaitVoices,
  isSupported as ttsSupported,
  isIOS,
  isStandalonePWA,
  getIOSVersion,
  speak,
} from '@/lib/tts';
import SectionHeader from '@/components/SectionHeader';
import { cn } from '@/lib/cn';

type Platform = 'android' | 'ios' | 'windows' | 'mac';

export default function Help(): JSX.Element {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-fg flex items-center gap-2">
          <HelpCircle size={22} aria-hidden /> 도움말
        </h1>
        <p className="text-sm text-muted mt-1">
          처음 사용하시거나 막힐 때 여기를 보세요.
        </p>
      </header>

      <TTSDiagnostic />
      <InstallGuide />
      <UpdateUninstallGuide />
      <FAQSection />
      <ContactSection />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) 음성(TTS) 진단
// ─────────────────────────────────────────────────────────────────────────────

function TTSDiagnostic(): JSX.Element {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testStatus, setTestStatus] = useState<
    'idle' | 'playing' | 'ok' | 'failed'
  >('idle');
  const [testErr, setTestErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ttsSupported()) return;
    void awaitVoices().then((vs) => {
      setVoices(vs.filter((v) => v.lang.toLowerCase().startsWith('zh')));
    });
  }, []);

  const supported = ttsSupported();
  const iosPWA = isIOS() && isStandalonePWA();
  const iosVer = getIOSVersion();
  const iosOutdated =
    iosVer !== null &&
    (iosVer.major < 17 || (iosVer.major === 17 && iosVer.minor < 4));

  const handleTest = (): void => {
    setTestStatus('playing');
    setTestErr(null);
    speak('你好。我是中文。', {
      onEnd: () => setTestStatus('ok'),
      onError: (e) => {
        setTestStatus('failed');
        setTestErr(e?.error ?? 'unknown');
      },
    });
  };

  return (
    <section>
      <SectionHeader
        title="🔊 음성이 안 들려요"
        subtitle="원인을 자동으로 진단합니다."
      />
      <div className="rounded-2xl border border-divider bg-surface p-4 space-y-3">
        {!supported ? (
          <Status
            kind="bad"
            title="이 브라우저는 음성을 지원하지 않습니다."
            body="Safari(iPhone), Chrome(Android/PC), Edge(PC) 중 하나로 열어 주세요."
          />
        ) : voices.length === 0 ? (
          <Status
            kind="bad"
            title="중국어 음성이 단말기에 설치되어 있지 않습니다."
            body="아래 안내에 따라 중국어 음성팩을 다운로드해 주세요."
          />
        ) : (
          <Status
            kind="good"
            title={`중국어 음성 ${voices.length}개가 감지되었습니다.`}
            body="아래 ‘테스트 재생’ 버튼으로 직접 들어 보세요."
          />
        )}

        {iosPWA && voices.length > 0 && (
          <Status
            kind="warn"
            title="홈 화면 앱(PWA)으로 열려 있습니다."
            body="iOS 17.4 미만에서는 음성이 막힐 수 있어요. 안 들리면 Safari 탭에서 다시 열어 보세요."
          />
        )}

        {iosOutdated && (
          <IOSUpdateGuide version={iosVer!} />
        )}

        {supported && (
          <div className="pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === 'playing'}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-white text-sm font-semibold px-4 py-2 disabled:opacity-60"
            >
              <Play size={16} aria-hidden />
              {testStatus === 'playing' ? '재생 중…' : '테스트 재생 (你好)'}
            </button>
            {testStatus === 'ok' && (
              <p className="text-sm text-success mt-2 inline-flex items-center gap-1">
                <CheckCircle2 size={16} aria-hidden /> 정상적으로 재생되었습니다.
              </p>
            )}
            {testStatus === 'failed' && (
              <p className="text-sm text-accent mt-2 inline-flex items-center gap-1">
                <AlertTriangle size={16} aria-hidden /> 재생 실패
                {testErr ? ` (오류: ${testErr})` : ''}
              </p>
            )}
          </div>
        )}

        {voices.length === 0 && supported && (
          <div className="pt-3 border-t border-divider">
            {isIOS() ? <IOSVoicePackGuide /> : <AndroidVoicePackGuide />}
          </div>
        )}

        {isIOS() && supported && (
          <details className="pt-3 border-t border-divider">
            <summary className="text-sm font-semibold text-fg cursor-pointer">
              🔉 음성이 작거나 안 들려요 (iPhone 볼륨 안내)
            </summary>
            <div className="mt-3">
              <IOSVolumeGuide />
            </div>
          </details>
        )}

        {voices.length > 0 && (
          <details className="pt-3 border-t border-divider">
            <summary className="text-sm font-semibold text-fg cursor-pointer">
              감지된 음성 목록 보기
            </summary>
            <ul className="mt-2 text-xs text-muted space-y-1">
              {voices.map((v) => (
                <li key={v.voiceURI}>
                  • {v.name} ({v.lang}) {v.localService ? '· 로컬' : '· 네트워크'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function IOSUpdateGuide({
  version,
}: {
  version: { major: number; minor: number };
}): JSX.Element {
  const verLabel = `iOS ${version.major}.${version.minor}`;
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/10 p-3">
      <p className="text-sm font-bold text-fg inline-flex items-center gap-1.5">
        <AlertTriangle size={16} aria-hidden /> 현재 {verLabel} — 업데이트 권장
      </p>
      <p className="text-xs text-muted mt-1 mb-2">
        Apple은 <b>iOS 17.4</b>부터 PWA 음성 재생과 중국어 voiceschanged 버그를 다수 수정했습니다.
        업데이트하면 음성 문제 대부분이 해결될 수 있어요.
      </p>
      <p className="text-sm font-semibold text-fg mb-1">📲 업데이트 방법</p>
      <ol className="list-decimal pl-5 space-y-1 text-sm text-fg">
        <li>
          <b>설정</b> → <b>일반</b> → <b>소프트웨어 업데이트</b>
        </li>
        <li>
          새 버전이 보이면 <b>"다운로드 및 설치"</b> (Wi-Fi · 충전기 권장)
        </li>
        <li>업데이트 후 이 앱을 다시 열어 테스트 재생을 다시 눌러 보세요.</li>
      </ol>
      <p className="text-xs text-muted mt-2">
        💡 기기가 너무 오래되어 iOS 17.4를 지원하지 않으면 (iPhone 8 이하 등):
        가능한 최신 버전으로 올린 뒤, 그래도 안 되면 Safari 탭에서 페이지를 여세요.
      </p>
    </div>
  );
}

function IOSVolumeGuide(): JSX.Element {
  return (
    <div className="text-sm space-y-3">
      <p className="font-bold text-fg">🔉 iPhone 음성이 작거나 안 들릴 때 점검표</p>
      <p className="text-muted">
        iPhone은 음성(TTS)을 <b>미디어가 아닌 "벨소리·알림 볼륨"</b>으로 재생합니다.
        아래를 순서대로 확인해 주세요.
      </p>

      <div className="rounded-lg border border-divider p-3">
        <p className="font-semibold text-fg mb-1.5">① 무음 모드 확인</p>
        <ul className="list-disc pl-5 space-y-1 text-fg/90">
          <li>왼쪽 옆면 <b>무음 스위치(주황색이 보이면 ON)</b> → 꺼 주세요.</li>
          <li>iPhone 15 Pro 이상은 <b>액션 버튼</b>이 무음으로 설정되어 있을 수 있어요. <b>설정 → 액션 버튼</b>에서 확인.</li>
          <li>화면 우상단을 아래로 쓸어 <b>제어 센터</b> → 종 모양 아이콘이 빨간색이면 무음 → 탭하여 해제.</li>
        </ul>
      </div>

      <div className="rounded-lg border border-divider p-3">
        <p className="font-semibold text-fg mb-1.5">② 미디어 음량 올리기</p>
        <ul className="list-disc pl-5 space-y-1 text-fg/90">
          <li>YouTube·Apple Music 등으로 <b>음악을 잠깐 재생</b>한 뒤 측면 볼륨 버튼을 끝까지 올리세요.</li>
          <li>음악 재생 중 슬라이더가 <b>"미디어"</b>로 표시되면 미디어 카테고리가 활성화된 상태입니다.</li>
          <li>그 상태에서 이 앱으로 돌아와 다시 재생해 보세요. iOS 음성이 깨어납니다.</li>
        </ul>
      </div>

      <div className="rounded-lg border border-divider p-3">
        <p className="font-semibold text-fg mb-1.5">③ 벨소리·알림 볼륨 올리기</p>
        <ul className="list-disc pl-5 space-y-1 text-fg/90">
          <li><b>설정 → 사운드 및 햅틱 → 벨소리와 알림 볼륨</b> 슬라이더를 끝까지 올립니다.</li>
          <li><b>"버튼으로 변경"</b>을 켜면 측면 버튼만으로 벨소리 볼륨을 바로 조절할 수 있어요.</li>
        </ul>
      </div>

      <div className="rounded-lg border border-divider p-3">
        <p className="font-semibold text-fg mb-1.5">④ Bluetooth 연결 확인</p>
        <ul className="list-disc pl-5 space-y-1 text-fg/90">
          <li>AirPods·Bluetooth 스피커가 연결되어 있으면 소리가 <b>그쪽으로만 출력</b>됩니다.</li>
          <li><b>제어 센터</b> → 음악 카드 우상단 <b>📡 AirPlay 아이콘</b> → <b>"iPhone"</b>으로 변경.</li>
          <li>또는 <b>설정 → Bluetooth</b>에서 연결된 기기 옆 ⓘ → <b>"이 기기에서 연결 해제"</b>.</li>
        </ul>
      </div>

      <p className="text-xs text-muted">
        💡 위 네 가지를 모두 확인해도 안 들리면 중국어 음성팩이 설치되지 않았을 가능성이 큽니다.
        위쪽의 <b>"음성팩 설치"</b> 안내를 따라주세요.
      </p>
    </div>
  );
}

function IOSVoicePackGuide(): JSX.Element {
  return (
    <div className="text-sm">
      <p className="font-bold text-fg mb-2">📱 iPhone 중국어 음성팩 설치</p>
      <ol className="list-decimal pl-5 space-y-1.5 text-fg">
        <li>
          <b>설정</b> 앱 열기
        </li>
        <li>
          <b>손쉬운 사용</b> 탭
        </li>
        <li>
          <b>읽기 및 말하기</b> (iOS 17.6+) 또는 <b>음성 콘텐츠</b> (이전 버전) 탭
        </li>
        <li>
          <b>음성</b> → <b>중국어</b> → <b>"중국어(중국 본토)"</b> 또는 <b>"보통화"</b>
        </li>
        <li>
          추천: <b>Tingting</b>(여성, 자연스러움) → ☁️ 다운로드 (200~400MB, Wi-Fi 권장)
        </li>
        <li>다운로드 100% 완료 후 이 앱을 종료 → 다시 열기</li>
      </ol>
      <p className="text-xs text-muted mt-3">
        💡 메뉴 이름이 다르면 설정 앱 상단에서 아래로 당겨 <b>"음성"</b>으로 검색하세요.
      </p>
    </div>
  );
}

function AndroidVoicePackGuide(): JSX.Element {
  return (
    <div className="text-sm">
      <p className="font-bold text-fg mb-2">📱 Android 중국어 음성팩 설치</p>
      <ol className="list-decimal pl-5 space-y-1.5 text-fg">
        <li>
          <b>설정</b> → <b>일반 관리</b> → <b>언어</b>
        </li>
        <li>
          <b>음성</b> → <b>Google 텍스트 음성 변환 엔진</b>
        </li>
        <li>
          <b>언어 설치</b> → <b>중국어(중국)</b> 체크 → 다운로드
        </li>
        <li>완료 후 이 앱을 종료 → 다시 열기</li>
      </ol>
      <p className="text-xs text-muted mt-3">
        💡 일부 기기는 <b>Samsung TTS</b>나 <b>HMS TTS</b>를 쓰며 메뉴 위치가 다를 수 있어요.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) 앱 설치 가이드 (OS별 탭)
// ─────────────────────────────────────────────────────────────────────────────

function InstallGuide(): JSX.Element {
  const initial: Platform = isIOS()
    ? 'ios'
    : /Android/i.test(navigator.userAgent)
      ? 'android'
      : /Mac/i.test(navigator.userAgent)
        ? 'mac'
        : 'windows';
  const [tab, setTab] = useState<Platform>(initial);

  return (
    <section>
      <SectionHeader
        title="📲 앱으로 설치하기"
        subtitle="홈 화면에 추가하면 인터넷 없이도 사용할 수 있어요."
      />
      <div className="rounded-2xl border border-divider bg-surface p-4 space-y-3">
        <div role="tablist" className="flex flex-wrap gap-2">
          <TabBtn cur={tab} v="ios" onClick={setTab} icon={<Apple size={14} />}>
            iPhone
          </TabBtn>
          <TabBtn cur={tab} v="android" onClick={setTab} icon={<Smartphone size={14} />}>
            Android
          </TabBtn>
          <TabBtn cur={tab} v="windows" onClick={setTab} icon={<Monitor size={14} />}>
            Windows
          </TabBtn>
          <TabBtn cur={tab} v="mac" onClick={setTab} icon={<Monitor size={14} />}>
            Mac
          </TabBtn>
        </div>

        <div className="pt-2 text-sm text-fg">
          {tab === 'ios' && <IOSInstallSteps />}
          {tab === 'android' && <AndroidInstallSteps />}
          {tab === 'windows' && <WindowsInstallSteps />}
          {tab === 'mac' && <MacInstallSteps />}
        </div>
      </div>
    </section>
  );
}

function TabBtn(props: {
  cur: Platform;
  v: Platform;
  onClick: (v: Platform) => void;
  icon: JSX.Element;
  children: React.ReactNode;
}): JSX.Element {
  const active = props.cur === props.v;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => props.onClick(props.v)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full text-sm font-semibold px-3 py-1.5 border',
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-bg text-muted border-divider',
      )}
    >
      {props.icon}
      {props.children}
    </button>
  );
}

function IOSInstallSteps(): JSX.Element {
  return (
    <>
      <p className="text-xs text-muted mb-2">
        iPhone은 반드시 <b>Safari</b>에서 열어야 설치할 수 있습니다 (Chrome·Firefox 불가).
      </p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>
          <b>Safari</b>로 이 페이지를 엽니다.
        </li>
        <li>
          화면 <b>아래 가운데</b>의 <b>공유 버튼</b> (□↑) 탭
        </li>
        <li>
          메뉴를 아래로 스크롤 → <b>"홈 화면에 추가"</b> 선택
        </li>
        <li>
          오른쪽 위 <b>"추가"</b> → 홈 화면에 아이콘 생성
        </li>
      </ol>
    </>
  );
}

function AndroidInstallSteps(): JSX.Element {
  return (
    <>
      <p className="text-xs text-muted mb-2">
        Chrome에서 열면 보통 <b>자동 설치 안내</b>가 뜹니다.
      </p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>
          <b>Chrome</b>으로 이 페이지를 엽니다.
        </li>
        <li>
          홈 화면 아래 <b>"📱 홈 화면에 앱으로 설치"</b>를 펼치고 <b>"Android에 설치"</b> 탭
        </li>
        <li>
          버튼이 비활성화된 경우: 오른쪽 위 <b>⋮ 메뉴</b> → <b>"앱 설치"</b> 또는 <b>"홈 화면에 추가"</b>
        </li>
      </ol>
    </>
  );
}

function WindowsInstallSteps(): JSX.Element {
  return (
    <ol className="list-decimal pl-5 space-y-1.5">
      <li>
        <b>Chrome</b> 또는 <b>Edge</b>로 이 페이지를 엽니다.
      </li>
      <li>
        주소창 오른쪽 끝의 <b>설치 아이콘</b> (모니터 + ⬇️) 클릭
      </li>
      <li>
        또는 메뉴(⋮) → <b>"앱"</b> → <b>"이 사이트를 앱으로 설치"</b>
      </li>
      <li>
        설치된 앱은 <b>시작 메뉴</b>에서 실행됩니다.
      </li>
    </ol>
  );
}

function MacInstallSteps(): JSX.Element {
  return (
    <ol className="list-decimal pl-5 space-y-1.5">
      <li>
        <b>Safari 17+</b> 또는 Chrome으로 이 페이지를 엽니다.
      </li>
      <li>
        Safari: 메뉴바 <b>파일</b> → <b>"Dock에 추가"</b>
      </li>
      <li>
        Chrome: 주소창 오른쪽 <b>설치 아이콘</b> 클릭
      </li>
      <li>
        Launchpad / Dock에서 실행하세요.
      </li>
    </ol>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) 업데이트 / 삭제 가이드 (OS별 탭)
// ─────────────────────────────────────────────────────────────────────────────

function UpdateUninstallGuide(): JSX.Element {
  const initial: Platform = isIOS()
    ? 'ios'
    : /Android/i.test(navigator.userAgent)
      ? 'android'
      : /Mac/i.test(navigator.userAgent)
        ? 'mac'
        : 'windows';
  const [tab, setTab] = useState<Platform>(initial);

  return (
    <section>
      <SectionHeader
        title="🔄 업데이트 / 🗑️ 삭제"
        subtitle="새 버전 적용 또는 앱·데이터 제거 방법"
      />
      <div className="rounded-2xl border border-divider bg-surface p-4 space-y-3">
        <div role="tablist" className="flex flex-wrap gap-2">
          <TabBtn cur={tab} v="ios" onClick={setTab} icon={<Apple size={14} />}>
            iPhone
          </TabBtn>
          <TabBtn cur={tab} v="android" onClick={setTab} icon={<Smartphone size={14} />}>
            Android
          </TabBtn>
          <TabBtn cur={tab} v="windows" onClick={setTab} icon={<Monitor size={14} />}>
            Windows
          </TabBtn>
          <TabBtn cur={tab} v="mac" onClick={setTab} icon={<Monitor size={14} />}>
            Mac
          </TabBtn>
        </div>

        <div className="pt-2 text-sm text-fg space-y-4">
          <div>
            <p className="font-semibold text-fg mb-1.5 inline-flex items-center gap-1.5">
              <RefreshCw size={14} aria-hidden /> 업데이트
            </p>
            {tab === 'ios' && <IOSUpdateSteps />}
            {tab === 'android' && <AndroidUpdateSteps />}
            {tab === 'windows' && <WindowsUpdateSteps />}
            {tab === 'mac' && <MacUpdateSteps />}
          </div>
          <div className="pt-3 border-t border-divider">
            <p className="font-semibold text-fg mb-1.5 inline-flex items-center gap-1.5">
              <Trash2 size={14} aria-hidden /> 앱 삭제
            </p>
            {tab === 'ios' && <IOSUninstallSteps />}
            {tab === 'android' && <AndroidUninstallSteps />}
            {tab === 'windows' && <WindowsUninstallSteps />}
            {tab === 'mac' && <MacUninstallSteps />}
          </div>
        </div>
      </div>
    </section>
  );
}

function IOSUpdateSteps(): JSX.Element {
  return (
    <>
      <p className="text-xs text-muted mb-2">
        앱은 열릴 때 백그라운드에서 자동으로 업데이트됩니다.
      </p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>
          홈 화면 앱 종료: 화면 아래에서 위로 천천히 쓸어 올린 뒤 카드를 위로 밀어 종료.
        </li>
        <li>다시 홈 화면에서 SMCB 앱 아이콘을 탭하세요.</li>
        <li>
          그래도 옛 버전이 보이면 <b>Safari</b>에서 이 페이지를 직접 열어 <b>당겨서 새로고침</b> →
          홈 화면 앱을 다시 여세요.
        </li>
      </ol>
    </>
  );
}

function IOSUninstallSteps(): JSX.Element {
  return (
    <>
      <p className="text-xs text-muted mb-2">
        홈 화면 아이콘 삭제 + 저장된 학습 데이터 삭제는 별도로 진행해야 합니다.
      </p>
      <p className="font-semibold text-fg mt-1 mb-1">앱 아이콘 삭제</p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>홈 화면에서 SMCB 아이콘을 <b>길게 누름</b>.</li>
        <li>
          메뉴에서 <b>"북마크 제거"</b> 또는 <b>"앱 제거"</b> → <b>"홈 화면에서 제거"</b>.
        </li>
      </ol>
      <p className="font-semibold text-fg mt-3 mb-1">학습 데이터(진도·즐겨찾기)까지 완전 삭제</p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>
          <b>설정 → Safari → 고급 → 웹사이트 데이터</b>
        </li>
        <li>검색창에 <b>"SMCB"</b> 또는 사이트 주소 입력.</li>
        <li>
          해당 항목을 왼쪽으로 쓸어 <b>삭제</b>.
        </li>
      </ol>
    </>
  );
}

function AndroidUpdateSteps(): JSX.Element {
  return (
    <>
      <p className="text-xs text-muted mb-2">
        앱은 열릴 때 자동으로 새 버전을 받아옵니다.
      </p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>최근 앱 화면에서 SMCB를 위로 밀어 완전 종료 → 다시 열기.</li>
        <li>
          그래도 옛 버전이 보이면 <b>Chrome</b>에서 이 페이지를 열어 <b>당겨서 새로고침</b>.
        </li>
        <li>
          최후 수단: Chrome <b>⋮ → 설정 → 개인정보 → 인터넷 사용 기록 삭제 → "캐시된 이미지·파일"</b> 체크 → 삭제.
        </li>
      </ol>
    </>
  );
}

function AndroidUninstallSteps(): JSX.Element {
  return (
    <>
      <p className="font-semibold text-fg mt-1 mb-1">앱 아이콘 삭제</p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>홈 화면에서 SMCB 아이콘을 <b>길게 누름</b> → <b>"제거"</b> 또는 휴지통으로 드래그.</li>
      </ol>
      <p className="font-semibold text-fg mt-3 mb-1">학습 데이터까지 완전 삭제</p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>
          <b>설정 → 앱 → SMCB</b> 선택 → <b>저장공간</b> → <b>"데이터 지우기"</b>.
        </li>
        <li>
          또는 Chrome <b>⋮ → 설정 → 사이트 설정 → 저장된 데이터</b>에서 해당 사이트 제거.
        </li>
      </ol>
    </>
  );
}

function WindowsUpdateSteps(): JSX.Element {
  return (
    <ol className="list-decimal pl-5 space-y-1.5">
      <li>앱 창을 닫고 시작 메뉴에서 다시 열면 자동 업데이트됩니다.</li>
      <li>
        강제 새로고침: 앱 안에서 <b>Ctrl + Shift + R</b> (또는 <b>F5</b>).
      </li>
      <li>
        그래도 안 되면 Chrome·Edge에서 <b>설정 → 개인정보 → 검색 데이터 삭제 → "캐시된 이미지·파일"</b>.
      </li>
    </ol>
  );
}

function WindowsUninstallSteps(): JSX.Element {
  return (
    <ol className="list-decimal pl-5 space-y-1.5">
      <li>
        시작 메뉴에서 <b>SMCB</b> 검색 → 우클릭 → <b>"제거"</b>.
      </li>
      <li>
        또는 앱 내부 <b>⋮ → "SMCB 제거"</b> (Chrome/Edge에서 설치한 경우).
      </li>
      <li>
        설정 → 앱 → 설치된 앱 → SMCB → <b>"제거"</b>로도 가능합니다.
      </li>
    </ol>
  );
}

function MacUpdateSteps(): JSX.Element {
  return (
    <ol className="list-decimal pl-5 space-y-1.5">
      <li>Dock에서 SMCB 아이콘 우클릭 → <b>"종료"</b> 후 다시 열기.</li>
      <li>
        Safari에서 페이지를 직접 열어 <b>⌘ + Shift + R</b>로 강제 새로고침.
      </li>
    </ol>
  );
}

function MacUninstallSteps(): JSX.Element {
  return (
    <ol className="list-decimal pl-5 space-y-1.5">
      <li>
        <b>Launchpad</b>에서 SMCB 아이콘을 길게 누르면 흔들립니다 → <b>X</b> 버튼 클릭 → 삭제.
      </li>
      <li>
        또는 <b>응용 프로그램</b> 폴더에서 SMCB를 휴지통으로 드래그.
      </li>
      <li>
        Safari 저장 데이터까지 삭제: <b>Safari → 설정 → 개인정보 → 웹사이트 데이터 관리</b>에서 검색 후 제거.
      </li>
    </ol>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) FAQ 아코디언
// ─────────────────────────────────────────────────────────────────────────────

type FAQ = { q: string; a: JSX.Element };

function FAQSection(): JSX.Element {
  const faqs: FAQ[] = useMemo(
    () => [
      {
        q: '글자가 너무 작아요.',
        a: (
          <p>
            우측 상단 ⚙️ <b>설정 → 글자 크기</b>에서 "크게" 또는 "아주 크게"로 바꿀 수 있어요.
          </p>
        ),
      },
      {
        q: '한자 위에 병음이 안 보여요.',
        a: (
          <p>
            ⚙️ <b>설정 → 병음 표시</b>가 꺼져 있을 수 있어요. 켜 주세요.
          </p>
        ),
      },
      {
        q: '오프라인에서도 쓸 수 있나요?',
        a: (
          <p>
            네. 홈 화면에 <b>앱으로 설치</b>한 뒤 한 번 열면, 인터넷 없이도 65과 본문과 부록을 볼 수 있습니다.
          </p>
        ),
      },
      {
        q: '여러 기기에서 학습 진도가 동기화되나요?',
        a: (
          <p>
            현재는 <b>단말기 안에만</b> 저장됩니다. 폰과 PC를 모두 쓰시면 각각 따로 진도가 쌓입니다.
          </p>
        ),
      },
      {
        q: '진도를 초기화하고 싶어요.',
        a: (
          <p>
            ⚙️ <b>설정 → 저장 공간 → 전체 초기화</b>를 누르면 진도·즐겨찾기·플래시카드가 모두 삭제됩니다.
          </p>
        ),
      },
      {
        q: '플래시카드는 어떻게 만들어지나요?',
        a: (
          <p>
            과별 단어 중 <b>⭐ 즐겨찾기</b>한 단어가 플래시카드에 들어갑니다. 매일 5분씩 복습해 보세요.
          </p>
        ),
      },
      {
        q: '검색은 어떤 단어로 가능한가요?',
        a: (
          <p>
            한자(中国), 병음(zhōngguó / zhongguo), 한국어 뜻 모두 가능합니다. 띄어쓰기·성조 표시는 무시됩니다.
          </p>
        ),
      },
      {
        q: '음성이 너무 빠르거나 느려요.',
        a: (
          <p>
            ⚙️ <b>설정 → 음성(TTS) → 속도</b> 슬라이더로 0.6× ~ 1.4× 조절할 수 있어요.
          </p>
        ),
      },
      {
        q: 'iPhone에서 음성이 자꾸 막혀요. 업데이트하면 좋아지나요?',
        a: (
          <p>
            네. Apple은 <b>iOS 17.4</b>부터 PWA 음성 재생 버그와 voiceschanged 이벤트 누락을 수정했어요.
            <b>설정 → 일반 → 소프트웨어 업데이트</b>에서 최신 버전으로 올린 뒤 다시 시도해 보세요.
            iPhone 8 이하 등 17을 지원하지 않는 기기는 가능한 최신 버전으로 올리고 Safari 탭에서 여세요.
          </p>
        ),
      },
      {
        q: '데이터가 외부로 전송되나요?',
        a: (
          <p>
            아니요. 이 앱은 <b>서버가 없습니다</b>. 모든 학습 데이터는 사용 중인 단말기 안에만 저장됩니다.
          </p>
        ),
      },
    ],
    [],
  );

  return (
    <section>
      <SectionHeader title="❓ 자주 묻는 질문" />
      <div className="rounded-2xl border border-divider bg-surface divide-y divide-divider">
        {faqs.map((f, i) => (
          <FAQItem key={i} q={f.q} a={f.a} />
        ))}
      </div>
    </section>
  );
}

function FAQItem({ q, a }: FAQ): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-fg">{q}</span>
        <ChevronDown
          size={18}
          aria-hidden
          className={cn(
            'flex-none text-muted transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="px-4 pb-3 text-sm text-muted">{a}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) 문의
// ─────────────────────────────────────────────────────────────────────────────

function ContactSection(): JSX.Element {
  return (
    <section>
      <SectionHeader title="✉️ 문의 / 오타 신고" />
      <div className="rounded-2xl border border-divider bg-surface p-4 text-sm text-fg space-y-2">
        <p>
          본문 오타·발음 오류·기능 제안은 담당 선생님께 알려 주세요. (연락처는 안내 페이지 참고)
        </p>
        <a
          href="/about"
          className="inline-flex items-center gap-1.5 text-primary font-semibold"
        >
          <Mail size={14} aria-hidden /> 안내 페이지로 가기
        </a>
      </div>
    </section>
  );
}

function Status(props: {
  kind: 'good' | 'warn' | 'bad';
  title: string;
  body: string;
}): JSX.Element {
  const color =
    props.kind === 'good'
      ? 'border-success/30 bg-success/10'
      : props.kind === 'warn'
        ? 'border-accent/30 bg-accent/10'
        : 'border-accent bg-accent/10';
  const Icon =
    props.kind === 'good' ? CheckCircle2 : props.kind === 'warn' ? AlertTriangle : Volume2;
  return (
    <div className={cn('rounded-xl border p-3', color)}>
      <p className="text-sm font-bold text-fg inline-flex items-center gap-1.5">
        <Icon size={16} aria-hidden /> {props.title}
      </p>
      <p className="text-xs text-muted mt-1">{props.body}</p>
    </div>
  );
}
