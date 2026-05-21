import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Volume2,
  Monitor,
  HelpCircle,
  ChevronDown,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Wrench,
  Download,
  RotateCw,
  TrendingDown,
  Type,
  WifiOff,
  Search,
  Ruler,
  Link as LinkIcon,
  BatteryLow,
  Languages,
  Settings as SettingsIcon,
  X,
  ArrowRight,
  Mic,
  Layers,
  HardDrive,
  Info,
  GraduationCap,
} from 'lucide-react';
import AppleLogo from '@/components/AppleLogo';
import AndroidLogo from '@/components/AndroidLogo';
import {
  awaitVoices,
  isSupported as ttsSupported,
  isIOS,
  isStandalonePWA,
  getIOSVersion,
  speak,
} from '@/lib/tts';
import { cn } from '@/lib/cn';

const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

type Platform = 'android' | 'ios' | 'windows' | 'mac';

type Guide = {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  keywords: string;
  Body: () => JSX.Element;
};

// 사용자가 처음부터 차근차근 따라가기 좋은 순서.
// (글자별 병음 → 재생 방식 → 천천히 음성팩 → 설정 → 음성 진단 → 설치 → 업데이트/삭제)
const GUIDES: Guide[] = [
  {
    id: 'ruby',
    title: <><Languages size={18} aria-hidden /> 한자 위에 글자별 병음 보기</>,
    subtitle: '한 글자마다 발음(병음)이 또박또박 따라옵니다.',
    keywords: '글자별 병음 한자 위 ruby 발음 표기 정렬',
    Body: PerCharPinyinGuide,
  },
  {
    id: 'playback',
    title: <><Volume2 size={18} aria-hidden /> 음성 재생 방식 바꾸기</>,
    subtitle: '녹음 음성 / 기기 음성 중에서 고를 수 있어요.',
    keywords: '음성 재생 방식 기기 음성 녹음 음성 변경 바꾸기 모드',
    Body: PlaybackModeGuide,
  },
  {
    id: 'voicepack',
    title: <><Download size={18} aria-hidden /> 일단 시작하고, 천천히 음성팩 받기</>,
    subtitle: '먼저 녹음 음성으로 시작 → 나중에 음성팩 추가.',
    keywords: '녹음 음성 음성팩 다운로드 설치 나중에 mp3 데이터',
    Body: RecordedFirstGuide,
  },
  {
    id: 'settings',
    title: <><SettingsIcon size={18} aria-hidden /> 설정 페이지 한눈에 보기</>,
    subtitle: '화면 · 음성 · 플래시카드 · 백업 · 저장 공간 안내.',
    keywords: '설정 화면 테마 다크 라이트 시스템 글자 크기 폰트 한자 병음 한국어 표시 토글 재생 방식 음성 속도 빠르게 느리게 플래시카드 알고리즘 leitner sm2 채점 카드 종류 자동 재생 하루 새 카드 한도 듣기 테스트 대조쌍 발음표 부록 백업 복원 저장 공간 캐시 비우기 초기화 전체 초기화 정보',
    Body: SettingsOverviewGuide,
  },
  {
    id: 'learn-sources',
    title: <><GraduationCap size={18} aria-hidden /> 학습 모드별 자료 매핑</>,
    subtitle: '플래시카드 · 4지선다 · 문장 조립 · 이어듣기 · 듣기 테스트가 어떤 자료를 쓰는지.',
    keywords: '학습 모드 플래시카드 4지선다 문장 조립 이어듣기 듣기 테스트 마라톤 대조쌍 자료 매핑 본문 단어 예문 구절 회화 시나리오 어법 본문 질문 발음표 부록',
    Body: LearnSourcesGuide,
  },
  {
    id: 'tts',
    title: <><Volume2 size={18} aria-hidden /> 음성이 안 들려요</>,
    subtitle: '단말기 음성 진단 · 중국어 음성팩 설치 안내.',
    keywords: '음성 안 들려요 TTS 진단 음성팩 voiceschanged ios 26 17.4 볼륨',
    Body: TTSDiagnostic,
  },
  {
    id: 'install',
    title: <><Download size={18} aria-hidden /> 앱으로 설치하기</>,
    subtitle: '홈 화면에 추가하면 인터넷 없이도 사용할 수 있어요.',
    keywords: '앱 설치 홈 화면 추가 PWA iphone android windows mac safari chrome edge',
    Body: InstallGuide,
  },
  {
    id: 'update',
    title: <><RefreshCw size={18} aria-hidden /> 업데이트 / <Trash2 size={18} aria-hidden /> 삭제</>,
    subtitle: '새 버전 적용 또는 앱·데이터 제거 방법.',
    keywords: '업데이트 삭제 제거 재설치 캐시 새로고침',
    Body: UpdateUninstallGuide,
  },
];

export default function Help(): JSX.Element {
  const [query, setQuery] = useState('');
  const [openGuideId, setOpenGuideId] = useState<string | null>(null);
  const q = query.trim();

  const filteredGuides = GUIDES.filter((g) => matchesGuide(q, g.keywords));
  // 검색 중에는 매칭된 가이드를 모두 펼쳐서 한눈에 보여 줍니다.
  const searching = q.length > 0;

  const filteredTrouble = TROUBLE_ITEMS.filter((t) => matchQuery(t, q));
  const filteredFAQ = FAQ_ITEMS.filter((f) => matchQuery(f, q));
  const showTrouble = !searching || filteredTrouble.length > 0;
  const showFAQ = !searching || filteredFAQ.length > 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-fg flex items-center gap-2">
          <HelpCircle size={22} aria-hidden /> 도움말
        </h1>
        <p className="text-sm text-muted mt-1">
          처음 사용하시거나 막힐 때 여기를 보세요.
        </p>
        <p className="text-xs text-muted mt-1">
          앱 버전: <b>v{APP_VERSION}</b>
        </p>
      </header>

      <HelpSearch query={query} onChange={setQuery} />

      <div className="space-y-3">
        {filteredGuides.map((g) => {
          const isOpen = searching ? true : openGuideId === g.id;
          const Body = g.Body;
          return (
            <Accordion
              key={g.id}
              title={g.title}
              subtitle={g.subtitle}
              isOpen={isOpen}
              onToggle={() => setOpenGuideId((cur) => (cur === g.id ? null : g.id))}
            >
              <Body />
            </Accordion>
          );
        })}

        {showTrouble && (
          <Accordion
            title={<><Wrench size={18} aria-hidden /> 자주 발생하는 오류</>}
            subtitle={
              searching
                ? `검색 결과 ${filteredTrouble.length}건 (전체 ${TROUBLE_ITEMS.length}건 중)`
                : '증상별 해결 방법을 모았어요.'
            }
            isOpen={searching ? true : openGuideId === 'trouble'}
            onToggle={() =>
              setOpenGuideId((cur) => (cur === 'trouble' ? null : 'trouble'))
            }
          >
            <TroubleshootList query={q} />
          </Accordion>
        )}

        {showFAQ && (
          <Accordion
            title={<><HelpCircle size={18} aria-hidden /> 자주 묻는 질문</>}
            subtitle={
              searching
                ? `검색 결과 ${filteredFAQ.length}건 (전체 ${FAQ_ITEMS.length}건 중)`
                : '많이들 물어보시는 질문을 모았어요.'
            }
            isOpen={searching ? true : openGuideId === 'faq'}
            onToggle={() =>
              setOpenGuideId((cur) => (cur === 'faq' ? null : 'faq'))
            }
          >
            <FAQList query={q} />
          </Accordion>
        )}
      </div>
    </div>
  );
}

// 검색어가 비어 있으면 모든 가이드를 표시. 아니면 keywords 와 부분 일치하는 가이드만 표시.
function matchesGuide(q: string, keywords: string): boolean {
  if (!q) return true;
  return keywords.toLowerCase().includes(q.toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// 0) 도움말 검색
// ─────────────────────────────────────────────────────────────────────────────

function HelpSearch({
  query,
  onChange,
}: {
  query: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <section>
      <div className="rounded-2xl border border-divider bg-surface p-3">
        <label htmlFor="help-search" className="sr-only">
          도움말 검색
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-divider bg-bg px-3 py-2 focus-within:border-primary">
          <Search size={18} className="text-muted flex-none" aria-hidden />
          <input
            id="help-search"
            type="search"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="도움말 찾기 (예: 병음, 음성, 설치, 검색…)"
            className="flex-1 bg-transparent outline-none text-base text-fg placeholder:text-muted"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="검색어 지우기"
              className="rounded-full p-1 text-muted hover:bg-divider"
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
        <p className="text-xs text-muted mt-2 px-1">
          {query.trim()
            ? <>"<b className="text-fg">{query.trim()}</b>" 와(과) 관련된 도움말만 보여 드릴게요.</>
            : '아래 가이드를 천천히 살펴보거나, 위 칸에 단어를 입력해 찾을 수 있어요.'}
        </p>
      </div>
    </section>
  );
}

// ReactNode 안의 텍스트만 추출 — 검색 매칭용.
function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join(' ');
  if (typeof node === 'object' && 'props' in (node as object)) {
    const children = (node as { props?: { children?: ReactNode } }).props?.children;
    return nodeToText(children);
  }
  return '';
}

function matchQuery(item: { q: ReactNode; a: JSX.Element; keywords?: string }, q: string): boolean {
  if (!q) return true;
  const haystack = `${nodeToText(item.q)} ${nodeToText(item.a)} ${item.keywords ?? ''}`.toLowerCase();
  return haystack.includes(q.toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// 0-A) 아코디언 컴포넌트 (하나만 열림)
// ─────────────────────────────────────────────────────────────────────────────

function Accordion({
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-divider bg-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-primary-soft/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-fg inline-flex items-center gap-2 flex-wrap">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        <ChevronDown
          size={22}
          aria-hidden
          className={cn(
            'flex-none text-muted transition-transform duration-200 mt-0.5',
            isOpen && 'rotate-180',
          )}
        />
      </button>
      {isOpen && (
        <div className="border-t border-divider p-4 space-y-3">{children}</div>
      )}
    </section>
  );
}

// 가이드 내부에서 사용하는 한 단계 작은 아코디언.
// 한눈에 목록을 훑고 필요한 항목만 펼치는 용도.
function SubAccordion({
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-divider bg-bg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-primary-soft/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-fg inline-flex items-center gap-1.5 flex-wrap">
            {title}
          </p>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        <ChevronDown
          size={18}
          aria-hidden
          className={cn(
            'flex-none text-muted transition-transform duration-200 mt-0.5',
            isOpen && 'rotate-180',
          )}
        />
      </button>
      {isOpen && (
        <div className="border-t border-divider p-3 text-sm text-fg/90 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 0-1) 글자별 병음 가이드
// ─────────────────────────────────────────────────────────────────────────────

function PerCharPinyinGuide(): JSX.Element {
  return (
    <>
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-fg/95">
          <p className="font-bold text-fg mb-1.5">⭐ 글자별 병음이란?</p>
          <p>
            한자 <b>한 글자마다</b> 그 글자의 병음(발음 표기)이 바로 위에 정렬되어 보이는 표시 방식입니다.
            여러 글자 위에 병음이 한 줄로 길게 늘어서면 어느 병음이 어느 글자에 해당하는지 헷갈리는데,
            <b> 글자별 병음</b>을 켜면 보기 편해집니다.
          </p>
        </div>

        <div className="rounded-xl border border-divider p-3 bg-bg">
          <p className="text-xs text-muted mb-2">예시 (실제 화면 표시 방식)</p>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted">❌ 글자별 병음 끔</p>
              <div className="mt-1">
                <p className="text-pinyin text-sm">Shàngdì ài shìrén</p>
                <p className="text-2xl font-semibold text-fg">上帝爱世人</p>
              </div>
            </div>
            <div className="pt-2 border-t border-divider">
              <p className="text-xs text-muted">✅ 글자별 병음 켬 (권장)</p>
              <div className="mt-1 flex gap-3 items-end">
                {[
                  { z: '上', p: 'Shàng' },
                  { z: '帝', p: 'dì' },
                  { z: '爱', p: 'ài' },
                  { z: '世', p: 'shì' },
                  { z: '人', p: 'rén' },
                ].map((c) => (
                  <div key={c.z} className="text-center">
                    <div className="text-pinyin text-xs leading-tight">{c.p}</div>
                    <div className="text-2xl font-semibold text-fg leading-tight">{c.z}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="font-bold text-fg mb-2 inline-flex items-center gap-1.5">
            <SettingsIcon size={14} aria-hidden /> 켜는 방법
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-fg">
            <li>
              화면 우측 상단 <b>⚙️ 설정</b> 아이콘 탭
              <span className="text-xs text-muted"> (또는 </span>
              <Link to="/settings" className="text-primary font-semibold underline">
                설정 페이지 바로 가기
              </Link>
              <span className="text-xs text-muted">)</span>
            </li>
            <li>
              <b>화면 표시</b> 영역에서
            </li>
            <li>
              <b>"글자별 병음"</b> 스위치를 <b>켭니다</b> (오른쪽으로 밀기)
            </li>
            <li>
              본문/부록으로 돌아오면 즉시 적용됩니다.
            </li>
          </ol>
          <p className="text-xs text-muted mt-2">
            💡 <b>"병음 표시"</b>가 꺼져 있으면 <b>"글자별 병음"</b>도 보이지 않아요.
            두 개를 모두 켜 두면 가장 보기 편합니다.
          </p>
        </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 0-2) 음성 재생 방식 변경하기
// ─────────────────────────────────────────────────────────────────────────────

function PlaybackModeGuide(): JSX.Element {
  return (
    <>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm">
            <p className="font-bold text-fg mb-1">🟢 녹음 음성 (기본 · 권장)</p>
            <ul className="list-disc pl-4 space-y-0.5 text-fg/90 text-xs">
              <li>본문·단어·회화 약 <b>3,500여 개</b>를 미리 녹음한 mp3로 재생</li>
              <li>단말기에 중국어 음성팩을 <b>설치하지 않아도</b> 들립니다</li>
              <li>한 번 들은 음성은 단말기에 저장되어 오프라인에서도 OK</li>
            </ul>
          </div>
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
            <p className="font-bold text-fg mb-1">🟡 기기 음성</p>
            <ul className="list-disc pl-4 space-y-0.5 text-fg/90 text-xs">
              <li>단말기에 설치된 <b>중국어 음성팩</b>만 사용</li>
              <li>데이터 사용량이 적지만, 음성팩이 없으면 <b>전혀 들리지 않음</b></li>
              <li>중국어 음성팩이 이미 설치된 분께 적합</li>
            </ul>
          </div>
        </div>

        <div>
          <p className="font-bold text-fg mb-2 inline-flex items-center gap-1.5">
            <SettingsIcon size={14} aria-hidden /> 재생 방식 바꾸는 법
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-fg">
            <li>
              화면 우측 상단 <b>⚙️ 설정</b> 아이콘 탭
              <span className="text-xs text-muted"> (또는 </span>
              <Link to="/settings" className="text-primary font-semibold underline">
                설정 페이지 바로 가기
              </Link>
              <span className="text-xs text-muted">)</span>
            </li>
            <li>
              <b>음성 재생 방식</b> 영역에서
            </li>
            <li>
              <b>"재생 방식"</b> 버튼 중 원하는 항목을 탭하세요.
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-divider bg-bg p-0.5 text-xs">
                <span className="rounded-full bg-primary text-white px-2.5 py-1 font-semibold">기기 음성</span>
                <span className="rounded-full px-2.5 py-1 text-muted">녹음 음성</span>
              </div>
            </li>
            <li>
              변경 즉시 적용됩니다. 본문에서 🔊 버튼을 눌러 들어보세요.
            </li>
          </ol>
          <p className="text-xs text-muted mt-2">
            💡 처음 설치 후 홈 화면 상단에 보이는 <b>"내게 맞는 음성 방식 고르기"</b> 카드에서도 같은 설정을 할 수 있어요.
            그 카드는 한 번 고르면 사라지지만, 설정 페이지에서 언제든 다시 바꿀 수 있습니다.
          </p>
        </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 0-3) 녹음 음성으로 시작 → 나중에 중국어 음성팩 받기
// ─────────────────────────────────────────────────────────────────────────────

function RecordedFirstGuide(): JSX.Element {
  return (
    <div className="text-sm space-y-3">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-fg/95">
            중국어 음성팩 다운로드는 <b>200~400MB</b>로 시간이 걸립니다.
            먼저 <b>녹음 음성</b>으로 시작하시면 <b>음성팩 없이도</b> 본문·단어·회화 발음을 모두 들으실 수 있어요.
            나중에 시간이 나실 때 천천히 음성팩을 받으시면 됩니다.
          </p>
        </div>

        <div>
          <p className="font-bold text-fg mb-2">권장 순서 (3단계)</p>

          <div className="space-y-3">
            <div className="rounded-xl border border-divider p-3">
              <p className="font-semibold text-fg inline-flex items-center gap-2">
                <span className="rounded-full bg-primary text-white w-6 h-6 inline-flex items-center justify-center text-xs font-bold">1</span>
                지금 — 녹음 음성으로 시작
              </p>
              <ol className="list-decimal pl-9 mt-1.5 space-y-1 text-fg/90">
                <li>
                  ⚙️ <b>설정 → 음성 재생 방식 → "녹음 음성"</b> 선택
                </li>
                <li>본문 한 과를 열어 🔊 버튼을 한 번 눌러 보세요. 정상 재생되면 OK.</li>
                <li>
                  Wi-Fi가 연결된 상태에서 학습할 과를 미리 한 번씩 열어 두시면
                  오프라인에서도 들을 수 있어요.
                </li>
              </ol>
            </div>

            <div className="rounded-xl border border-divider p-3">
              <p className="font-semibold text-fg inline-flex items-center gap-2">
                <span className="rounded-full bg-primary text-white w-6 h-6 inline-flex items-center justify-center text-xs font-bold">2</span>
                여유 있을 때 — 중국어 음성팩 받기 (선택)
              </p>
              <ol className="list-decimal pl-9 mt-1.5 space-y-1 text-fg/90">
                <li>
                  Wi-Fi 환경에서 단말기에 충분한 저장 공간(약 500MB)을 확보하세요.
                </li>
                <li>
                  이 도움말 위쪽 <b>"음성이 안 들려요"</b> 섹션의 <b>"중국어 음성팩 설치 가이드"</b>를
                  참고해 설치하세요.
                  <span className="text-xs text-muted"> (iPhone · Android · Windows · Mac 모두 안내가 있습니다)</span>
                </li>
                <li>
                  다운로드 완료 후 이 앱을 <b>완전히 종료하고 다시 열어</b> 주세요.
                  새 음성이 인식됩니다.
                </li>
              </ol>
              <p className="text-xs text-muted mt-2 pl-9">
                💡 이 단계를 건너뛰셔도 학습에 전혀 지장이 없어요. 녹음 음성만으로도 모든 본문 발음을 들으실 수 있습니다.
              </p>
            </div>

            <div className="rounded-xl border border-divider p-3">
              <p className="font-semibold text-fg inline-flex items-center gap-2">
                <span className="rounded-full bg-primary text-white w-6 h-6 inline-flex items-center justify-center text-xs font-bold">3</span>
                음성팩 설치 후 — 재생 방식 다시 고르기 (선택)
              </p>
              <ol className="list-decimal pl-9 mt-1.5 space-y-1 text-fg/90">
                <li>
                  ⚙️ <b>설정 → 음성 재생 방식</b> 으로 돌아갑니다.
                </li>
                <li>
                  <b>"녹음 음성"</b>을 그대로 두시는 게 <b>가장 안정적</b>이에요.
                  녹음 음성은 모든 단말기에서 동일한 발음으로 들립니다.
                </li>
                <li>
                  <b>"기기 음성"</b>으로 바꾸면 단말기에 설치된 중국어 음성으로 들을 수 있지만,
                  단어가 mp3 목록에 없으면 단말기 음성에 의존하게 됩니다.
                </li>
              </ol>
              <p className="text-xs text-muted mt-2 pl-9 inline-flex items-center gap-1">
                <ArrowRight size={12} aria-hidden /> 자세한 비교는 위쪽 <b>"음성 재생 방식 바꾸기"</b> 섹션을 참고하세요.
              </p>
            </div>
          </div>
        </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 0-4) 설정 페이지 한눈에 보기
// ─────────────────────────────────────────────────────────────────────────────

function SettingsOverviewGuide(): JSX.Element {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const sections: {
    icon: JSX.Element;
    title: string;
    subtitle: string;
    body: JSX.Element;
  }[] = [
    {
      icon: <Monitor size={14} aria-hidden />,
      title: '화면',
      subtitle: '눈에 보이는 것 바꾸기',
      body: (
        <ul className="list-disc pl-5 space-y-2 text-fg/90">
          <li>
            <b>테마</b> — 화면 바탕색을 고릅니다.
            <ul className="list-[circle] pl-5 mt-1 text-xs text-muted space-y-0.5">
              <li><b>라이트</b> · 하얀 종이처럼 환한 화면 (낮에 보기 좋아요)</li>
              <li><b>다크</b> · 검은 바탕에 흰 글씨 (밤에 눈이 덜 부셔요)</li>
              <li><b>시스템</b> · 휴대폰 설정에 맞춰 자동으로 바뀝니다</li>
            </ul>
          </li>
          <li>
            <b>글자 크기</b> — <i>보통 / 크게 / 아주 크게</i>
            <div className="text-xs text-muted mt-0.5">
              글씨가 작아 잘 안 보이시면 <b>크게</b> 또는 <b>아주 크게</b>로 바꾸세요.
              한자도, 발음도, 한국어 뜻도 모두 같이 커집니다.
            </div>
          </li>
          <li>
            <b>한자 표시 · 병음 표시 · 한국어 표시</b> — 세 줄을 따로 켜고 끌 수 있어요.
            <div className="text-xs text-muted mt-0.5">
              예를 들어 한자만 보고 외우고 싶으시면 병음과 한국어를 잠시 꺼 두세요.
              다시 켜고 싶으면 같은 자리에서 똑같이 다시 누르시면 됩니다.
            </div>
          </li>
          <li>
            <b>글자별 병음</b> — 한자 한 글자 위에 발음(병음)이 또박또박 따라옵니다.
            <div className="text-xs text-muted mt-0.5">
              어느 발음이 어느 한자에 해당하는지 헷갈리실 때 <b>꼭 켜 두세요</b>.
              자세한 설명은 위쪽 <b>"한자 위에 글자별 병음 보기"</b> 안내를 보세요.
            </div>
          </li>
        </ul>
      ),
    },
    {
      icon: <Volume2 size={14} aria-hidden />,
      title: '음성 재생 방식',
      subtitle: '어떤 목소리로 들을지',
      body: (
        <>
          <p className="text-xs text-muted">
            본문 옆 스피커 버튼을 누르면 발음이 들려요. 어떤 목소리를 쓸지 여기서 고릅니다.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-fg/90">
            <li>
              <b>녹음 음성</b> (처음에 추천드려요)
              <div className="text-xs text-muted mt-0.5">
                저희가 미리 정확하게 녹음해 둔 약 <b>3,500개</b>의 발음 파일을 들려드려요.
                휴대폰에 중국어 음성팩이 따로 없어도 <b>바로 들리고</b>,
                한 번 들으신 발음은 인터넷 없이도 다시 들을 수 있어요.
              </div>
            </li>
            <li>
              <b>기기 음성</b>
              <div className="text-xs text-muted mt-0.5">
                휴대폰에 들어 있는 중국어 음성으로 들립니다.
                중국어 음성팩이 <b>설치되지 않은 휴대폰</b>에서는 소리가 전혀 나지 않으니
                초보자께는 권하지 않습니다.
              </div>
            </li>
          </ul>
          <p className="text-xs text-muted">
            💡 <b>"녹음 음성"</b>을 고르시면 그 아래에 <b>"중국어 음성 미리 받기"</b> 칸이
            나옵니다. 와이파이가 연결된 곳에서 한 번 받아 두시면, 인터넷이 끊겨도 모든 발음을 들으실 수 있어요.
          </p>
        </>
      ),
    },
    {
      icon: <Mic size={14} aria-hidden />,
      title: '음성',
      subtitle: '발음을 빠르게 또는 천천히',
      body: (
        <ul className="list-disc pl-5 space-y-2 text-fg/90">
          <li>
            <b>속도</b> — 동그라미를 왼쪽으로 미시면 <b>천천히</b>, 오른쪽으로 미시면 <b>빠르게</b> 들립니다.
            <div className="text-xs text-muted mt-0.5">
              숫자가 <b>1.00×</b>일 때가 보통 속도입니다.
              처음 배우실 때는 <b>0.80×</b>(조금 천천히)를 추천드립니다.
              귀에 익으시면 점점 올려 보세요.
            </div>
          </li>
          <li>
            <b>음성 선택</b> — 보통은 <b>"자동"</b> 그대로 두세요.
            <div className="text-xs text-muted mt-0.5">
              휴대폰에 여러 중국어 목소리가 있을 때 그 중에서 하나를 고르는 칸입니다.
              특별히 다른 목소리로 듣고 싶으실 때만 바꾸시면 됩니다.
            </div>
          </li>
        </ul>
      ),
    },
    {
      icon: <Layers size={14} aria-hidden />,
      title: '플래시카드',
      subtitle: '단어 외우기 연습',
      body: (
        <>
          <p className="text-xs text-muted">
            카드를 한 장씩 넘기면서 단어를 외우는 기능입니다.
            <b> 처음에는 그대로 두시고</b> 익숙해지신 다음에 바꾸셔도 충분합니다.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-fg/90">
            <li>
              <b>채점 단계</b> — 답을 본 뒤 누를 버튼이 몇 개일지 고릅니다.
              <ul className="list-[circle] pl-5 mt-1 text-xs text-muted space-y-0.5">
                <li><b>2단계</b> · 〈모름 / 알아요〉 두 가지만 — 간단해서 편해요</li>
                <li><b>4단계</b> · 〈모름 / 어려움 / 알아요 / 쉬움〉 — 더 세밀하게 표시</li>
              </ul>
            </li>
            <li>
              <b>알고리즘</b> — 다음에 같은 카드를 <b>언제 다시 보여줄지</b> 정하는 방법.
              <ul className="list-[circle] pl-5 mt-1 text-xs text-muted space-y-0.5">
                <li><b>Leitner</b> · 쉬운 방식 — 맞히면 더 오래 뒤로 미루고, 틀리면 다시 자주 보여줍니다</li>
                <li><b>SM-2</b> · 정교한 방식 — 외운 정도에 맞춰 며칠 뒤에 보여줄지 자동 계산</li>
              </ul>
              <p className="text-xs text-muted mt-1">
                💡 어떤 것을 고르셔도 외워집니다. 잘 모르시면 <b>그대로 두세요</b>.
              </p>
            </li>
            <li>
              <b>문제 방향</b> — 어느 쪽을 먼저 보여 줄지 고릅니다.
              <ul className="list-[circle] pl-5 mt-1 text-xs text-muted space-y-0.5">
                <li><b>中→韓</b> · 중국어를 보고 한국어 뜻을 떠올립니다</li>
                <li><b>韓→中</b> · 한국어 뜻을 보고 중국어를 떠올립니다 (조금 더 어려워요)</li>
                <li><b>혼합</b> · 두 방향을 번갈아 보여줍니다</li>
              </ul>
            </li>
            <li>
              <b>카드 종류</b> — <i>단어 · 예문 · 구절 · 회화 · 시나리오</i> 중에서 연습할 종류를 고릅니다.
              여러 개를 함께 켜 두실 수도 있어요.
            </li>
            <li>
              <b>자동 음성 재생</b> — 카드를 넘길 때마다 발음이 <b>자동으로 들립니다</b>.
              매번 스피커 버튼을 누르지 않아도 돼서 편해요.
            </li>
            <li>
              <b>듣기 테스트에 발음표 단음절 포함</b> — 듣기 테스트 모드에서 한 글자(단음절) 발음 카드도 함께 출제합니다.
            </li>
            <li>
              <b>부록1 기독교 용어 학습 포함</b> — 예수·하나님 같은 부록1의 기독교 용어 80여 개를 학습 풀에 넣습니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      icon: <Download size={14} aria-hidden />,
      title: '학습 진행상황 백업',
      subtitle: '진도를 파일로 저장하고 되살리기',
      body: (
        <>
          <p className="text-xs text-muted">
            이 앱은 서버가 없어 진도가 단말기 안에만 저장됩니다.
            기기를 바꾸거나 앱을 다시 설치하기 전에 백업해 두면 안전해요.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-fg/90">
            <li>
              <b>백업 파일 저장</b> — 진도·즐겨찾기·플래시카드 기록을 파일 하나로 내려받습니다.
              <div className="text-xs text-muted mt-0.5">
                받은 파일을 이메일·메모 앱·클라우드 등 안전한 곳에 보관하세요.
              </div>
            </li>
            <li>
              <b>백업에서 복원</b> — 저장해 둔 백업 파일을 불러와 학습 기록을 되살립니다.
              <div className="text-xs text-muted mt-0.5">
                새 기기나 다시 설치한 앱에서 이 버튼으로 예전 진도를 그대로 옮길 수 있어요.
                복원하면 <b>지금 기록을 백업 내용으로 덮어씁니다</b>.
              </div>
            </li>
          </ul>
        </>
      ),
    },
    {
      icon: <HardDrive size={14} aria-hidden />,
      title: '저장 공간',
      subtitle: '휴대폰 자리 정리',
      body: (
        <>
          <p className="text-xs text-muted">
            앱이 휴대폰에서 차지하는 자리(용량)를 보여 줍니다.
            <b> 자리가 부족할 때만</b> 만지시면 됩니다. 평소엔 그냥 두세요.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-fg/90">
            <li>
              <b>사용 중 · 할당</b> — 이 앱이 지금 쓰고 있는 자리와, 휴대폰이 허락한 최대 자리를 알려 줍니다.
            </li>
            <li>
              <b>콘텐츠 캐시 비우기</b> — 임시로 받아 둔 글과 발음 파일만 지웁니다.
              <div className="text-xs text-muted mt-0.5">
                내용이 이상하게 바뀌었거나 발음이 이상할 때 한 번 눌러 보세요.
                <b> 즐겨찾기, 진도, 외운 카드 기록은 그대로 남아 있어요. 안심하세요.</b>
              </div>
            </li>
            <li>
              <b className="text-accent">전체 초기화</b> <AlertTriangle size={12} className="inline -mt-0.5 text-accent" aria-hidden /> — <b>처음 설치한 상태로 되돌립니다</b>.
              <div className="text-xs text-muted mt-0.5">
                즐겨찾기, 진도, 외운 카드 <b>모두 사라집니다</b>.
                정말 처음부터 다시 시작하실 때만 사용하세요.
                실수로 누르셔도 <b>"정말 지울까요?"</b> 확인 창이 한 번 더 떠서 안전합니다.
              </div>
            </li>
          </ul>
        </>
      ),
    },
    {
      icon: <Info size={14} aria-hidden />,
      title: '정보',
      subtitle: '앱에 대한 설명',
      body: (
        <ul className="list-disc pl-5 space-y-1 text-fg/90">
          <li>
            <b>앱 정보 · SMCB 소개</b>를 누르시면 <b>SMCB 이름의 뜻</b>, <b>콘텐츠 출처·이용 안내</b>, <b>설치 방법</b>, <b>앱 버전</b>, <b>만든 사람 연락처</b>가 나옵니다.
            <div className="text-xs text-muted mt-0.5">
              무언가 잘 안 될 때 도움을 청하시려면 여기 적힌 버전 번호를 함께 알려 주세요.
            </div>
          </li>
        </ul>
      ),
    },
  ];

  return (
    <div className="text-sm space-y-3">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-fg/95">
            설정 페이지는 <b>앱을 내 눈과 귀에 맞춰 주는 곳</b>이에요.
            글자를 키우거나, 발음을 천천히 들리게 하거나, 어두운 화면으로 바꿀 수 있어요.
          </p>
          <p className="text-fg/95 mt-2">
            한 번 바꾸면 <b>그대로 저장</b>되어 다음에 앱을 열어도 계속 그대로 보여요.
            잘못 누르셨어도 괜찮습니다. 같은 자리에서 다시 원래대로 바꾸시면 돼요.
          </p>
          <p className="text-fg/95 mt-2">
            👉 지금 바로{' '}
            <Link to="/settings" className="text-primary font-semibold underline">
              설정 페이지로 가기
            </Link>
            .
          </p>
        </div>

        <div className="space-y-2">
          {sections.map((s, i) => (
            <SubAccordion
              key={i}
              title={
                <>
                  {s.icon}
                  <span>{s.title}</span>
                </>
              }
              subtitle={s.subtitle}
              isOpen={openIdx === i}
              onToggle={() => setOpenIdx((cur) => (cur === i ? null : i))}
            >
              {s.body}
            </SubAccordion>
          ))}
        </div>

        <p className="text-xs text-muted pt-1 rounded-xl border border-divider p-3 bg-bg">
          💡 <b>걱정 마세요.</b> 설정에서 무엇을 바꾸셔도 본문이나 단어가 사라지지 않습니다.
          <b className="text-accent"> "전체 초기화"</b> 한 가지만 조심하시면 됩니다.
          헷갈리시면 같은 자리에서 다시 원래대로 누르시면 돼요.
        </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 학습 모드별 기초자료 매핑
// ─────────────────────────────────────────────────────────────────────────────

function LearnSourcesGuide(): JSX.Element {
  // 각 행은 한 과(課)에 존재하는 자료 영역. 모드별 ◯/× 는 해당 영역을 학습 풀에 포함하는지.
  // 코드 출처:
  //   - 플래시카드: lib/flashcard-items.ts buildAllCardSources
  //   - 문장 조립: lib/sentence-builder.ts buildAllPrompts (헤더 주석)
  //   - 4지선다:   pages/Quiz.tsx mcqPrompts (vocab만)
  //   - 대조쌍:    lib/minimal-pairs.ts extractMinimalPairs (vocab + 옵션 발음표)
  //   - 마라톤:    lib/flashcard-items.ts buildMarathonSources
  const rows: Array<{
    area: string;
    desc: string;
    flashcard: 'yes' | 'no' | 'opt';
    sentence: 'yes' | 'no' | 'opt';
    mcq: 'yes' | 'no' | 'opt';
    pairs: 'yes' | 'no' | 'opt';
    marathon: 'yes' | 'no' | 'opt';
  }> = [
    { area: '본문',       desc: '本文 — 레슨 본문 문장',          flashcard: 'no',  sentence: 'no',  mcq: 'no',  pairs: 'no',  marathon: 'opt' },
    { area: '단어',       desc: '主要词汇 — 주요 어휘',           flashcard: 'yes', sentence: 'no',  mcq: 'yes', pairs: 'yes', marathon: 'opt' },
    { area: '단어 예문',  desc: 'vocab.example — 어휘 예문',      flashcard: 'yes', sentence: 'yes', mcq: 'no',  pairs: 'no',  marathon: 'opt' },
    { area: '발음표',     desc: '发音点 — 단음절 발음표',         flashcard: 'no',  sentence: 'no',  mcq: 'no',  pairs: 'opt', marathon: 'no'  },
    { area: '어법 예문',  desc: '语法点 — 어법 예문',             flashcard: 'no',  sentence: 'yes', mcq: 'no',  pairs: 'no',  marathon: 'no'  },
    { area: '성경 구절',  desc: '圣经引用 — 성경 인용',           flashcard: 'yes', sentence: 'no',  mcq: 'no',  pairs: 'no',  marathon: 'opt' },
    { area: '응용 회화',  desc: '应用会话 — 일상 회화 라인',      flashcard: 'yes', sentence: 'yes', mcq: 'no',  pairs: 'no',  marathon: 'opt' },
    { area: '전도 회화',  desc: '传福音会话 — 전도 회화 라인',    flashcard: 'yes', sentence: 'yes', mcq: 'no',  pairs: 'no',  marathon: 'opt' },
    { area: '시나리오',   desc: '场景 — 실전 상황 verse 세그먼트', flashcard: 'yes', sentence: 'yes', mcq: 'no',  pairs: 'no',  marathon: 'opt' },
    { area: '본문 질문',  desc: '本文问题 — 본문 이해 질문',      flashcard: 'no',  sentence: 'yes', mcq: 'no',  pairs: 'no',  marathon: 'no'  },
    { area: '부록 단어',  desc: '附录 — 부록1 기독교 용어',       flashcard: 'opt', sentence: 'no',  mcq: 'opt', pairs: 'opt', marathon: 'no'  },
  ];

  const cell = (v: 'yes' | 'no' | 'opt'): JSX.Element => {
    if (v === 'yes') return <span className="text-primary font-bold" aria-label="포함">◯</span>;
    if (v === 'opt') return <span className="text-accent font-bold" aria-label="설정에 따라 포함">△</span>;
    return <span className="text-muted" aria-label="제외">×</span>;
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted">
        한 과(課)에 들어 있는 자료 영역이 학습 모드별로 어떻게 쓰이는지 알려드려요.
      </p>
      <ul className="text-xs text-muted list-disc pl-5 space-y-0.5">
        <li><span className="text-primary font-bold">◯</span> 포함 — 해당 모드의 학습 풀에 항상 들어갑니다.</li>
        <li><span className="text-accent font-bold">△</span> 옵션 — 설정 토글로 켤 수 있어요.</li>
        <li><span className="text-muted">×</span> 제외 — 해당 모드에서 쓰지 않습니다.</li>
      </ul>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-fg">
              <th className="text-left p-2 border-b border-divider whitespace-nowrap">자료 영역</th>
              <th className="p-2 border-b border-divider whitespace-nowrap">플래시<br/>카드</th>
              <th className="p-2 border-b border-divider whitespace-nowrap">4지<br/>선다</th>
              <th className="p-2 border-b border-divider whitespace-nowrap">문장<br/>조립</th>
              <th className="p-2 border-b border-divider whitespace-nowrap">이어<br/>듣기</th>
              <th className="p-2 border-b border-divider whitespace-nowrap">듣기<br/>테스트</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.area} className="align-top">
                <td className="p-2 border-b border-divider">
                  <div className="font-semibold text-fg">{r.area}</div>
                  <div className="text-[10px] text-muted">{r.desc}</div>
                </td>
                <td className="p-2 border-b border-divider text-center">{cell(r.flashcard)}</td>
                <td className="p-2 border-b border-divider text-center">{cell(r.mcq)}</td>
                <td className="p-2 border-b border-divider text-center">{cell(r.sentence)}</td>
                <td className="p-2 border-b border-divider text-center">{cell(r.marathon)}</td>
                <td className="p-2 border-b border-divider text-center">{cell(r.pairs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-accent/40 bg-accent-soft p-3 space-y-2">
        <p className="text-fg/90 text-xs">
          <b className="text-accent">△ 옵션 토글은 어디에서 켜나요?</b>
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-fg/90">
          <li>
            <b>이어듣기의 본문/단어/예문/구절/회화/시나리오</b> —{' '}
            <Link to="/learn?mode=marathon" className="text-primary font-semibold underline">학습 → 이어듣기</Link> 화면의{' '}
            <b>영역</b> 섹션에서 원하는 영역만 켜세요. 그 영역만 권/과 순서로 재생합니다.
          </li>
          <li>
            <b>듣기 테스트의 발음표</b> —{' '}
            <Link to="/settings" className="text-primary font-semibold underline">설정</Link> 페이지 →{' '}
            <b>"듣기 테스트에 발음표 단음절 포함"</b> 토글을 켜면 单字 발음표도 풀에 들어갑니다.
          </li>
          <li>
            <b>부록 단어 (플래시카드 · 4지선다 · 듣기 테스트)</b> —{' '}
            <Link to="/settings" className="text-primary font-semibold underline">설정</Link> 페이지 →{' '}
            <b>"부록1 기독교 용어 학습 포함"</b> 토글을 켜면 부록1의 기독교 용어 80+개가 학습 풀에 합류해요.
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-divider p-3 bg-bg space-y-2">
        <p className="text-fg/90 text-xs">
          <b>모드별 한 줄 요약</b>
        </p>
        <ul className="list-disc pl-5 space-y-1 text-xs text-muted">
          <li><b className="text-fg">플래시카드</b> — 단어 · 예문 · 구절 · 회화 · 시나리오를 카드 한 장씩 넘기며 외워요.</li>
          <li><b className="text-fg">4지선다</b> — 주요 어휘(단어)만 출제. 4개 보기 중 한국어 뜻을 고르거나 한자/병음을 맞춰요.</li>
          <li><b className="text-fg">문장 조립</b> — 회화체 문장(회화·예문·시나리오·어법 예문·본문 질문)을 토큰으로 흩어 놓고 다시 맞춰요. <i>본문·구절은 문어체라 제외.</i></li>
          <li><b className="text-fg">이어듣기</b> — 선택한 영역(본문·단어·예문·구절·회화·시나리오)을 권/과 순서대로 끝까지 재생만 해요. 채점 없음.</li>
          <li><b className="text-fg">듣기 테스트</b> — 헷갈리기 쉬운 발음을 짝지어 듣고 골라요. 단어 풀에서 자동 추출, 설정에서 발음표 단음절도 켤 수 있어요.</li>
        </ul>
      </div>
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
  // iOS 26.0 ~ 26.1: PWA 환경에서 SpeechSynthesis 회귀 보고 다수
  // (MacRumors 포럼 등). Apple은 26.2 이상에서 수정 진행 중.
  const ios26Regression =
    iosVer !== null && iosVer.major === 26 && iosVer.minor < 2;

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
    <>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-bold text-fg inline-flex items-center gap-1.5">
            <Volume2 size={16} aria-hidden /> 이 앱은 미리 녹음된 중국어 음성을 사용합니다
          </p>
          <p className="text-xs text-muted mt-1">
            65과 본문·단어·회화의 중국어 발음 약 <b>3,500여 개</b>를 빌드 시점에
            <b> Microsoft Edge Neural 음성(Xiaoxiao)</b>으로 미리 합성해 두었어요.
            단말기에 중국어 <b>음성팩이 없어도</b> 정상적으로 들립니다.
            처음 한 번만 인터넷이 필요하고, 그 이후에는 오프라인에서도 재생됩니다.
          </p>
          <p className="text-xs text-muted mt-2">
            💡 미리 녹음된 음성이 없는 텍스트는 단말기 내장 <b>중국어</b> 음성으로 대체합니다.
            한국어 음성으로 한자를 잘못 발음(한국어 한자음)하는 것을 막기 위해,
            <b> 단말기에 중국어 음성팩이 없으면 재생을 시도하지 않습니다.</b>
            이때만 아래 진단 결과가 의미가 있어요.
          </p>
        </div>

        {!supported ? (
          <Status
            kind="warn"
            title="이 브라우저는 단말기 음성 합성을 지원하지 않습니다."
            body="미리 녹음된 음성은 그대로 재생됩니다. 다만 텍스트 직접 입력 등 일부 기능은 제한될 수 있어요."
          />
        ) : voices.length === 0 ? (
          <Status
            kind="warn"
            title="단말기에 중국어 음성팩이 설치되어 있지 않습니다."
            body="미리 녹음된 음성은 정상 재생됩니다. 단말기 음성도 쓰고 싶다면 아래 안내를 참고하세요."
          />
        ) : (
          <Status
            kind="good"
            title={`단말기 중국어 음성 ${voices.length}개가 감지되었습니다.`}
            body="미리 녹음된 음성과 함께 단말기 내장 음성도 사용할 수 있어요."
          />
        )}

        {iosPWA && voices.length > 0 && (
          <Status
            kind="warn"
            title="홈 화면 앱(PWA)으로 열려 있습니다."
            body={
              ios26Regression
                ? 'iOS 26.0 · 26.1 PWA 환경에서 음성 재생이 막히는 사례가 보고되었어요. 안 들리면 Safari 탭에서 다시 열거나 iOS 26.2 이상으로 업데이트하세요.'
                : 'iOS 17.4 미만에서는 음성이 막힐 수 있어요. 안 들리면 Safari 탭에서 다시 열어 보세요.'
            }
          />
        )}

        {iosOutdated && (
          <IOSUpdateGuide version={iosVer!} />
        )}

        {ios26Regression && (
          <IOS26RegressionGuide version={iosVer!} />
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
            <VoicePackGuide />
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
    </>
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
      <p className="text-sm font-semibold text-fg mb-1 inline-flex items-center gap-1.5"><Download size={14} aria-hidden /> 업데이트 방법</p>
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

function IOS26RegressionGuide({
  version,
}: {
  version: { major: number; minor: number };
}): JSX.Element {
  const verLabel = `iOS ${version.major}.${version.minor}`;
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/10 p-3">
      <p className="text-sm font-bold text-fg inline-flex items-center gap-1.5">
        <AlertTriangle size={16} aria-hidden /> 현재 {verLabel} — 음성 재생 회귀 보고
      </p>
      <p className="text-xs text-muted mt-1 mb-2">
        Apple <b>iOS 26.0 · 26.1</b>에서 홈 화면 앱(PWA)의 SpeechSynthesis가
        중단되거나 무음으로 재생되는 사례가 다수 보고되었습니다.
        Apple은 <b>iOS 26.2</b> 이상에서 수정 작업을 진행 중이에요.
      </p>
      <p className="text-sm font-semibold text-fg mb-1 inline-flex items-center gap-1.5"><Download size={14} aria-hidden /> 임시 해결책</p>
      <ol className="list-decimal pl-5 space-y-1 text-sm text-fg">
        <li>
          <b>설정 → 일반 → 소프트웨어 업데이트</b>에서 iOS 26.2 이상이 보이면 업데이트.
        </li>
        <li>
          업데이트가 아직 없으면 이 페이지를 <b>Safari 탭으로 직접 열기</b>:
          홈 화면 앱이 아닌 Safari 주소창에서 페이지를 열면 음성이 정상 재생됩니다.
        </li>
        <li>또는 미리 녹음된 음성(앱 기본)이 정상 동작하는지 ▶ 버튼으로 다시 확인.</li>
      </ol>
      <p className="text-xs text-muted mt-2">
        💡 이 앱의 본문·단어·회화 발음은 미리 녹음된 mp3로 재생되므로
        SpeechSynthesis 회귀와 무관하게 들립니다. 단말기 음성 합성이 필요한 경우(직접 입력 등)만 영향을 받습니다.
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
          <li>왼쪽 옆면 <b>무음 스위치(주황색이 보이면 ON)</b> → 꺼 주세요. (iPhone 14 이하)</li>
          <li><b>iPhone 15 Pro·15 Pro Max, iPhone 16 시리즈 전체</b>는 무음 스위치 대신 <b>액션 버튼</b>이 있어요. 위 옆면을 길게 눌렀을 때 무음으로 동작하면 <b>설정 → 액션 버튼</b>에서 다른 동작으로 바꾸세요.</li>
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

      <div className="rounded-lg border border-divider p-3">
        <p className="font-semibold text-fg mb-1.5">⑤ 첫 한 번은 ▶ 버튼을 직접 탭</p>
        <ul className="list-disc pl-5 space-y-1 text-fg/90">
          <li>iOS는 보안상 <b>사용자가 직접 누른 첫 탭</b>이 있어야 음성 재생이 깨어납니다.</li>
          <li>위 <b>"테스트 재생 (你好)"</b> 버튼을 손가락으로 한 번만 눌러 주세요. 이후엔 본문 🔊 버튼도 정상 작동합니다.</li>
        </ul>
      </div>

      <p className="text-xs text-muted">
        💡 위를 모두 확인해도 안 들리면 중국어 음성팩이 설치되지 않았을 가능성이 큽니다.
        설정 → 손쉬운 사용 → <b>음성 콘텐츠 → 음성 → 중국어</b>에서 음성팩을 다운로드하세요.
      </p>
    </div>
  );
}

// 4종 OS 모두에 대해 중국어 음성팩 설치 가이드를 제공한다.
// 기존엔 isIOS() ? iOS : Android 이분기였으나 Windows/Mac 사용자가
// 잘못된 Android 가이드를 보던 문제를 해결.
function VoicePackGuide(): JSX.Element {
  const initial: Platform = isIOS()
    ? 'ios'
    : /Android/i.test(navigator.userAgent)
      ? 'android'
      : /Mac/i.test(navigator.userAgent)
        ? 'mac'
        : 'windows';
  const [tab, setTab] = useState<Platform>(initial);

  return (
    <div>
      <p className="font-bold text-fg mb-2 inline-flex items-center gap-1.5">
        <Volume2 size={14} aria-hidden /> 중국어 음성팩 설치 가이드
      </p>
      <div role="tablist" className="flex flex-wrap gap-2 mb-3">
        <TabBtn cur={tab} v="ios" onClick={setTab} icon={<AppleLogo size={12} />}>iPhone</TabBtn>
        <TabBtn cur={tab} v="android" onClick={setTab} icon={<AndroidLogo size={14} />}>Android</TabBtn>
        <TabBtn cur={tab} v="windows" onClick={setTab} icon={<Monitor size={14} />}>Windows</TabBtn>
        <TabBtn cur={tab} v="mac" onClick={setTab} icon={<AppleLogo size={12} />}>Mac</TabBtn>
      </div>
      <div className="text-sm">
        {tab === 'ios' && <IOSVoicePackGuide />}
        {tab === 'android' && <AndroidVoicePackGuide />}
        {tab === 'windows' && <WindowsVoicePackGuide />}
        {tab === 'mac' && <MacVoicePackGuide />}
      </div>
    </div>
  );
}

function WindowsVoicePackGuide(): JSX.Element {
  return (
    <div className="text-sm">
      <p className="font-bold text-fg mb-2 inline-flex items-center gap-1.5"><Monitor size={14} aria-hidden /> Windows 중국어 음성팩 설치</p>
      <p className="font-semibold text-fg mt-1 mb-1">▸ Windows 11 (대부분 권장)</p>
      <ol className="list-decimal pl-5 space-y-1 text-fg">
        <li><b>설정</b> (Win + I) → <b>시간 및 언어</b> → <b>언어 및 지역</b></li>
        <li>"선호하는 언어" → <b>+ 언어 추가</b> → <b>"中文 (中华人民共和国)"</b> 또는 <b>"Chinese (Simplified, China)"</b> 선택</li>
        <li>"언어 기능 설치" 화면에서 <b>"음성"</b> 체크박스 활성 → <b>설치</b></li>
        <li>설치 완료 후 <b>설정 → 접근성 → 내레이터 → 내레이터 음성 추가</b>에서 <b>中文</b> 음성 보임 확인</li>
      </ol>
      <p className="font-semibold text-fg mt-3 mb-1">▸ Windows 10</p>
      <ol className="list-decimal pl-5 space-y-1 text-fg">
        <li><b>설정</b> → <b>시간 및 언어</b> → <b>언어</b> → <b>+ 기본 설정 언어 추가</b></li>
        <li><b>中文(中国)</b> 선택 → 다음 → <b>"음성 인식"</b>·<b>"텍스트 음성 변환"</b> 체크 → 설치</li>
      </ol>
      <p className="font-semibold text-fg mt-3 mb-1">▸ Edge·Chrome 사용자 (앱 단독 음성)</p>
      <ul className="list-disc pl-5 space-y-1 text-fg/90">
        <li>Edge: 주소창에 <b>edge://settings/languages</b> → <b>"텍스트를 음성으로 변환"</b> 음성 추가</li>
        <li>Chrome은 OS 음성을 그대로 사용 — 위 Windows 설정만 완료하면 됩니다.</li>
      </ul>
      <p className="text-fg mt-3">설치 후 <b>브라우저를 완전히 종료 후 다시 열어</b> 음성이 잡히는지 확인하세요.</p>
      <p className="text-xs text-muted mt-2">
        💡 음성 패키지가 보이지 않으면 <b>"Windows Update"</b>를 한 번 실행해 주세요. 옵션 기능이 비활성화돼 있을 수 있어요.
      </p>
    </div>
  );
}

function MacVoicePackGuide(): JSX.Element {
  return (
    <div className="text-sm">
      <p className="font-bold text-fg mb-2 inline-flex items-center gap-1.5"><AppleLogo size={14} /> Mac 중국어 음성팩 설치</p>

      <p className="font-semibold text-fg mt-1 mb-1">▸ macOS 15 Sequoia (2024년 9월 이후)</p>
      <p className="text-xs text-muted mb-1">
        macOS Sequoia부터는 <b>"말하기 콘텐츠"</b> 화면에서 새 음성을 받을 수 없어요.
        <b>VoiceOver 유틸리티</b>를 통해서만 신규 다운로드가 가능합니다.
      </p>
      <ol className="list-decimal pl-5 space-y-1 text-fg">
        <li><b>시스템 설정</b> → <b>손쉬운 사용</b> → <b>VoiceOver</b></li>
        <li><b>"VoiceOver 유틸리티 열기…"</b> 버튼 클릭 (별도 창이 열립니다)</li>
        <li>좌측 <b>음성</b> 카테고리 → <b>음성</b> 탭</li>
        <li>"기본" 옆 음성 드롭다운 → 가장 아래 <b>사용자화…</b></li>
        <li><b>中文 (中国 본토 · 보통화)</b> 섹션에서 <b>Tingting</b>·<b>Sinji</b>·<b>Meijia</b> 중 하나 체크 → <b>확인</b></li>
        <li>다운로드(40~400MB) 완료 후 잠시 뒤 시스템 설정의 <b>말하기 콘텐츠 → 시스템 음성</b> 목록에도 자동으로 나타납니다.</li>
      </ol>
      <p className="text-xs text-muted mt-2">
        💡 음성이 보이지 않거나 빈 사각형으로 표시되면 <b>Mac을 재시작</b>해 주세요. 색인이 부팅 시 갱신됩니다.
      </p>

      <p className="font-semibold text-fg mt-3 mb-1">▸ macOS 13 Ventura · 14 Sonoma</p>
      <ol className="list-decimal pl-5 space-y-1 text-fg">
        <li><b>시스템 설정</b>(System Settings) → <b>손쉬운 사용</b>(Accessibility)</li>
        <li><b>말하기 콘텐츠</b>(Spoken Content) → <b>시스템 음성</b>(System Voice) → <b>사용자화…</b>(Customize…)</li>
        <li>아래로 스크롤 → <b>中文 (中国 본토)</b> 섹션에서 <b>Tingting</b>·<b>Sinji</b>·<b>Meijia</b> 중 하나 체크 → <b>확인</b></li>
        <li>다운로드(40~400MB) 완료 시 진행률이 사라지면 준비 완료</li>
      </ol>

      <p className="font-semibold text-fg mt-3 mb-1">▸ macOS 12 Monterey 이전</p>
      <ol className="list-decimal pl-5 space-y-1 text-fg">
        <li><b>시스템 환경설정</b> → <b>손쉬운 사용</b> → <b>말하기</b></li>
        <li><b>시스템 음성</b> 드롭다운 → <b>사용자화…</b> → <b>中文</b> 음성 체크 → <b>확인</b></li>
      </ol>

      <p className="text-fg mt-3">다운로드 후 <b>Safari·Chrome을 완전히 종료한 다음 다시 열어</b> 이 페이지에서 테스트 재생을 눌러 보세요.</p>
      <p className="text-xs text-muted mt-2">
        💡 다운로드가 멈추거나 음성이 안 잡히면 <b>Mac을 재시작</b>한 뒤 다시 확인해 보세요. macOS는 음성 인덱스를 부팅 시 새로 읽습니다.
      </p>
    </div>
  );
}

function IOSVoicePackGuide(): JSX.Element {
  return (
    <div className="text-sm">
      <p className="font-bold text-fg mb-2 inline-flex items-center gap-1.5"><AppleLogo size={14} /> iPhone 중국어 음성팩 설치</p>
      <ol className="list-decimal pl-5 space-y-1.5 text-fg">
        <li>
          <b>설정</b> 앱 열기
        </li>
        <li>
          <b>손쉬운 사용</b> 탭
        </li>
        <li>
          <b>음성 콘텐츠</b> 탭 (iOS 버전에 따라 위치가 살짝 다를 수 있어요)
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
      <p className="font-bold text-fg mb-2 inline-flex items-center gap-1.5"><AndroidLogo size={16} /> Android 중국어 음성팩 설치</p>

      <p className="font-semibold text-fg mt-2 mb-1">▸ Samsung Galaxy 폰 (One UI 6 이하)</p>
      <ol className="list-decimal pl-5 space-y-1 text-fg">
        <li>
          <b>설정</b> → <b>일반 관리</b> → <b>언어 및 입력</b> → <b>음성</b>
        </li>
        <li>
          <b>텍스트 음성 변환</b> → <b>Google 텍스트 음성 변환 엔진</b>
        </li>
        <li>
          <b>언어 설치</b> → <b>중국어(중국)</b> 체크 → 다운로드
        </li>
      </ol>

      <p className="font-semibold text-fg mt-3 mb-1">▸ Samsung Galaxy (One UI 7 · Android 15)</p>
      <p className="text-xs text-muted mb-1">
        One UI 7부터 <b>Samsung TTS 엔진은 3rd-party 앱(브라우저 포함)에서 차단</b>됩니다.
        Chrome으로 이 앱을 쓰려면 반드시 <b>Google TTS 엔진</b>을 활성화해야 해요.
      </p>
      <ol className="list-decimal pl-5 space-y-1 text-fg">
        <li>
          Play 스토어에서 <b>"Google 텍스트 음성 변환 엔진"</b>이 설치·업데이트되어 있는지 확인.
        </li>
        <li>
          <b>설정</b> → <b>일반 관리</b> → <b>텍스트 음성 변환</b>
        </li>
        <li>
          <b>기본 엔진</b>을 <b>Samsung TTS</b>가 아닌 <b>Google 텍스트 음성 변환 엔진</b>으로 변경.
        </li>
        <li>
          엔진 옆 ⚙️ → <b>언어 설치</b> → <b>중국어(중국)</b> 다운로드.
        </li>
      </ol>

      <p className="font-semibold text-fg mt-3 mb-1">▸ Pixel · 기타 Android (대부분)</p>
      <ol className="list-decimal pl-5 space-y-1 text-fg">
        <li>
          <b>설정</b> → <b>접근성</b> → <b>텍스트 음성 변환 출력</b> (공식 권장 경로)
        </li>
        <li>
          기본 엔진이 <b>Google TTS 엔진</b>인지 확인 → 옆 ⚙️
        </li>
        <li>
          <b>언어 설치</b> → <b>중국어(중국)</b> 체크 → 다운로드
        </li>
      </ol>
      <p className="text-xs text-muted mt-1">
        💡 일부 펌웨어는 <b>설정 → 시스템 → 언어 및 입력 → 음성 → 텍스트 음성 변환 출력</b> 경로를 사용합니다.
      </p>

      <p className="text-fg mt-3">완료 후 이 앱을 완전 종료 → 다시 열기.</p>
      <p className="text-xs text-muted mt-3">
        💡 메뉴 이름이 위와 다르면 <b>설정 앱 검색창</b>에 <b>"음성"</b> 또는 <b>"TTS"</b>를 입력해 보세요. 일부 기기(샤오미·화웨이 등)는 <b>Samsung TTS</b>·<b>HMS TTS</b>를 쓰며 위치가 다릅니다.
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
    <>
        <div role="tablist" className="flex flex-wrap gap-2">
          <TabBtn cur={tab} v="ios" onClick={setTab} icon={<AppleLogo size={12} />}>
            iPhone
          </TabBtn>
          <TabBtn cur={tab} v="android" onClick={setTab} icon={<AndroidLogo size={14} />}>
            Android
          </TabBtn>
          <TabBtn cur={tab} v="windows" onClick={setTab} icon={<Monitor size={14} />}>
            Windows
          </TabBtn>
          <TabBtn cur={tab} v="mac" onClick={setTab} icon={<AppleLogo size={12} />}>
            Mac
          </TabBtn>
        </div>

        <div className="pt-2 text-sm text-fg">
          {tab === 'ios' && <IOSInstallSteps />}
          {tab === 'android' && <AndroidInstallSteps />}
          {tab === 'windows' && <WindowsInstallSteps />}
          {tab === 'mac' && <MacInstallSteps />}
        </div>
    </>
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
    <>
        <div role="tablist" className="flex flex-wrap gap-2">
          <TabBtn cur={tab} v="ios" onClick={setTab} icon={<AppleLogo size={12} />}>
            iPhone
          </TabBtn>
          <TabBtn cur={tab} v="android" onClick={setTab} icon={<AndroidLogo size={14} />}>
            Android
          </TabBtn>
          <TabBtn cur={tab} v="windows" onClick={setTab} icon={<Monitor size={14} />}>
            Windows
          </TabBtn>
          <TabBtn cur={tab} v="mac" onClick={setTab} icon={<AppleLogo size={12} />}>
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
    </>
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
// 4) 자주 발생하는 오류 — 증상별 해결 아코디언
// ─────────────────────────────────────────────────────────────────────────────

type Trouble = { q: ReactNode; a: JSX.Element; keywords?: string };

const TROUBLE_ITEMS: Trouble[] = [
      {
        q: <><RotateCw size={14} aria-hidden /> 흰 화면 / 검은 화면만 보이고 앱이 안 열려요.</>,
        a: (
          <>
            <p className="mb-2">
              저장된 캐시(서비스워커)가 손상됐을 수 있어요. 아래를 순서대로 시도해 주세요.
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-fg/90">
              <li>앱을 완전히 종료(최근 앱에서 위로 밀기) 후 다시 열기.</li>
              <li>
                <b>iPhone</b>: Safari로 페이지를 열어 <b>당겨서 새로고침</b> → 홈 화면 앱 다시 열기.
              </li>
              <li>
                <b>Android</b>: Chrome <b>⋮ → 설정 → 개인정보 → 인터넷 사용 기록 삭제 → 캐시된 이미지·파일</b> 체크 → 삭제.
              </li>
              <li>
                <b>데스크톱</b>: 앱 안에서 <b>Ctrl/⌘ + Shift + R</b>로 강력 새로고침.
              </li>
              <li>그래도 안 되면 위쪽 <b>"🔄 업데이트 / 🗑️ 삭제"</b> 섹션의 삭제 안내대로 제거 후 다시 설치.</li>
            </ol>
          </>
        ),
      },
      {
        q: <><TrendingDown size={14} aria-hidden /> 학습 진도와 즐겨찾기가 갑자기 사라졌어요.</>,
        a: (
          <>
            <p className="mb-2">
              브라우저 보안 정책이 데이터를 자동으로 지운 경우입니다. 흔한 원인 세 가지:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-fg/90">
              <li>
                <b>iPhone Safari</b>는 7일 이상 방문하지 않은 사이트의 저장 데이터를 자동 삭제합니다(ITP).
                <b> 홈 화면 앱으로 설치</b>하면 이 제한을 받지 않아요.
              </li>
              <li>
                <b>시크릿/프라이빗 모드</b>로 열면 모든 데이터가 탭을 닫는 순간 사라집니다.
                일반 탭에서 다시 열어 주세요.
              </li>
              <li>
                다른 브라우저(Chrome ↔ Safari, 폰 ↔ PC)는 <b>각각 별도 저장소</b>입니다. 동일 브라우저로 다시 열기.
              </li>
            </ul>
            <p className="text-xs text-muted mt-2">
              💡 진도는 단말기 안에만 저장됩니다. 미리 ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>학습 진행상황 백업</b>에서 백업 파일을 받아 두면, 데이터가 사라져도 복원할 수 있어요.
            </p>
          </>
        ),
      },
      {
        q: <><Type size={14} aria-hidden /> 한자가 일본식 / 이상한 모양으로 보여요.</>,
        a: (
          <>
            <p className="mb-2">
              운영체제 폰트가 일본어 CJK를 우선 적용한 경우입니다.
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-fg/90">
              <li>
                <b>Android (Samsung)</b>: <b>설정 → 일반 관리 → 언어 및 입력 → 언어</b>에서 <b>한국어 또는 중국어(간체)</b>를 추가하고 우선순위를 위로 올리세요.
              </li>
              <li>
                <b>Android (Pixel·기타)</b>: <b>설정 → 시스템 → 언어 및 입력 → 언어</b>에서 동일하게 추가·우선순위 조정.
              </li>
              <li>
                <b>iPhone</b>: <b>설정 → 일반 → 언어 및 지역 → 기본 언어 순서</b>에서 한국어 또는 중국어를 위로 올리세요.
              </li>
              <li>
                <b>Samsung Galaxy</b>: <b>설정 → 디스플레이 → 글꼴</b>이 사용자 글꼴이면 기본 글꼴로 되돌리기.
              </li>
              <li>일부 단어만 이상하면 본문 오타일 수 있어요. ✉️ 문의로 알려 주세요.</li>
            </ol>
          </>
        ),
      },
      {
        q: <><WifiOff size={14} aria-hidden /> 오프라인에서 일부 과만 안 보여요.</>,
        a: (
          <>
            <p className="mb-2">
              본문은 용량을 줄이려고 <b>처음 열 때만</b> 다운로드되어 캐시됩니다. 오프라인 모드 전에 미리 한 번씩 열어 두세요.
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-fg/90">
              <li>Wi-Fi가 연결된 상태에서 학습할 과들을 한 번씩 열어 본문이 보이는지 확인.</li>
              <li>부록·검색·플래시카드도 마찬가지로 한 번씩 진입.</li>
              <li>그 후 비행기 모드로 전환해 다시 열어 정상 표시되는지 확인.</li>
            </ol>
            <p className="text-xs text-muted mt-2">
              💡 앱 캐시 정책: 본문/부록은 최대 90일 보관, 새 버전이 배포되면 자동 갱신됩니다.
            </p>
          </>
        ),
      },
      {
        q: <><Search size={14} aria-hidden /> 검색 결과가 안 나와요.</>,
        a: (
          <>
            <ul className="list-disc pl-5 space-y-1 text-fg/90">
              <li>
                첫 진입 시 인덱스를 다운로드합니다(약 200KB). 1~3초 후 다시 시도해 보세요.
              </li>
              <li>
                <b>한자(中国)</b>, <b>병음(zhongguo, zhōngguó 둘 다 가능)</b>, <b>한국어 뜻</b> 모두로 시도.
              </li>
              <li>
                병음은 <b>성조 표시 없이</b> 입력해도 됩니다. 띄어쓰기는 무시됩니다.
              </li>
              <li>
                그래도 안 되면 본문에 없는 단어일 수 있어요. 어휘표(부록 1)에서 확인.
              </li>
            </ul>
          </>
        ),
      },
      {
        q: <><Ruler size={14} aria-hidden /> 화면이 잘리거나 버튼이 가려져요.</>,
        a: (
          <>
            <ul className="list-disc pl-5 space-y-1 text-fg/90">
              <li>
                <b>iPhone X 이상</b>: 노치/홈 인디케이터를 피하도록 자동 여백이 적용됩니다. 보이지 않으면 한 번 새로고침.
              </li>
              <li>
                <b>가로 모드</b>로 회전하면 일부 표가 더 넓게 보입니다.
              </li>
              <li>
                글자가 큰글씨로 설정되어 잘리면 <b>설정 → 글자 크기</b>에서 한 단계 작게 변경.
              </li>
              <li>
                브라우저 확대(핀치 줌)가 적용된 상태일 수 있어요. 두 손가락으로 축소해 100%로 맞춥니다.
              </li>
            </ul>
          </>
        ),
      },
      {
        q: <><LinkIcon size={14} aria-hidden /> 앱 안의 링크가 외부 브라우저로 열려요. (iPhone)</>,
        a: (
          <>
            <p className="mb-2">
              iOS는 홈 화면 PWA에서 외부 URL을 자동으로 Safari로 띄웁니다. 정상 동작이며 앱은 그대로 유지됩니다.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-fg/90">
              <li>다시 앱으로 돌아오려면 화면 좌측 상단의 <b>‹ SMCB</b>를 탭하세요.</li>
              <li>
                계속 외부 브라우저로 열리면 iOS 기본 브라우저가 Safari가 아닐 수 있어요.
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li><b>iOS 18+</b>: 설정 → <b>앱</b> → <b>기본 앱</b> → <b>웹 브라우저</b> → Safari.</li>
                  <li><b>iOS 17 이하</b>: 설정 → <b>Safari</b> 또는 사용 중인 브라우저 앱(Chrome 등) → <b>기본 브라우저 앱</b>.</li>
                  <li>경로가 안 보이면 설정 검색창에 <b>"기본 브라우저"</b>를 입력하세요.</li>
                </ul>
              </li>
            </ul>
          </>
        ),
      },
      {
        q: <><Volume2 size={14} aria-hidden /> 미리 녹음된 발음(mp3)이 안 들려요.</>,
        a: (
          <>
            <p className="mb-2">
              이 앱은 본문·단어·회화 발음 약 <b>3,500여 개</b>를 미리 녹음한 mp3 파일로 재생합니다.
              아래를 순서대로 확인해 주세요.
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-fg/90">
              <li>
                기기 음량이 켜져 있는지 확인하고, 위쪽 <b>“음성이 안 들려요”</b>의
                <b> ‘테스트 재생 (你好)’</b> 버튼을 먼저 눌러 보세요.
              </li>
              <li>
                테스트는 들리는데 본문/단어 발음이 안 들리면 <b>네트워크</b>를 확인하세요.
                첫 재생 시 mp3 한 개당 약 20KB를 다운로드합니다.
              </li>
              <li>
                <b>오프라인 사용</b>: 비행기 모드 이전에 학습할 과를 한 번씩 열어
                발음을 한 번 재생해 두면, 이후에는 인터넷 없이도 들을 수 있습니다.
              </li>
              <li>
                그래도 안 되면 ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>저장 공간 → 콘텐츠 캐시 비우기</b> 후
                다시 열어 발음을 재생해 보세요.
              </li>
              <li>
                미리 녹음되지 않은 텍스트(직접 입력 등)는 단말기 내장 음성으로 대체됩니다.
                이때는 단말기 중국어 음성팩이 필요합니다.
              </li>
            </ol>
            <p className="text-xs text-muted mt-2">
              💡 mp3 파일은 <b>Microsoft Edge Neural TTS(Xiaoxiao)</b>로 만들었어요.
              누가, 어떤 기기로 열어도 <b>동일한 음성</b>으로 들립니다.
            </p>
          </>
        ),
      },
      {
        q: <><BatteryLow size={14} aria-hidden /> 배터리 절약 모드에서 음성이 끊기거나 멈춰요. (Android)</>,
        a: (
          <>
            <p className="mb-2">
              Android의 절전·데이터 절약 모드는 백그라운드 JavaScript를 제한해 음성 재생이 끊길 수 있어요.
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-fg/90">
              <li>
                <b>Samsung Galaxy</b>: <b>설정 → 디바이스 관리(또는 배터리 및 디바이스 관리) → 배터리</b>에서 절전 모드 끄기, 또는 <b>앱 → SMCB → 배터리 → "제한 없음"</b>.
              </li>
              <li>
                <b>Pixel·기타 Android</b>: <b>설정 → 배터리 → 절전 모드</b>를 끄거나, <b>설정 → 앱 → SMCB → 배터리 → "제한 없음"</b>.
              </li>
              <li>
                Chrome 데이터 절약: <b>Chrome ⋮ → 설정 → 사이트 설정</b>에서 차단된 항목이 없는지 확인. <span className="text-muted">(Chrome 100 이후 "Lite 모드"는 제거되었습니다.)</span>
              </li>
              <li>
                메뉴 위치는 제조사·OS 버전에 따라 다릅니다. 안 보이면 설정 검색창에 <b>"배터리"</b>를 입력하세요.
              </li>
            </ol>
          </>
        ),
      },
];

function TroubleshootList({ query }: { query: string }): JSX.Element {
  const filtered = TROUBLE_ITEMS.filter((t) => matchQuery(t, query));
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const searching = query.length > 0;

  if (filtered.length === 0) {
    return (
      <div className="text-sm text-muted">
        이 검색어에 해당하는 항목이 없어요. 다른 단어로 찾아 보세요.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-divider bg-bg divide-y divide-divider overflow-hidden">
      {filtered.map((t, i) => (
        <TroubleItem
          key={i}
          q={t.q}
          a={t.a}
          isOpen={searching ? true : openIdx === i}
          onToggle={() => setOpenIdx((cur) => (cur === i ? null : i))}
        />
      ))}
    </div>
  );
}

function TroubleItem({
  q,
  a,
  isOpen,
  onToggle,
}: Trouble & { isOpen: boolean; onToggle: () => void }): JSX.Element {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-fg inline-flex items-center gap-2">{q}</span>
        <ChevronDown
          size={18}
          aria-hidden
          className={cn(
            'flex-none text-muted transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>
      {isOpen && <div className="px-4 pb-3 text-sm text-fg/90">{a}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) FAQ 아코디언
// ─────────────────────────────────────────────────────────────────────────────

type FAQ = { q: ReactNode; a: JSX.Element; keywords?: string };

const FAQ_ITEMS: FAQ[] = [
      {
        q: '글자가 너무 작아요.',
        keywords: '글자 크기 폰트 크게 설정 폰트사이즈',
        a: (
          <p>
            우측 상단 ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>글자 크기</b>에서 "크게" 또는 "아주 크게"로 바꿀 수 있어요.
          </p>
        ),
      },
      {
        q: '한자·병음·한국어 뜻 중 일부가 화면에서 사라졌어요.',
        keywords: '한자 병음 한국어 뜻 안 보여 사라 표시 설정 화면 토글 pinyin 글자별 위에',
        a: (
          <>
            <p className="mb-2">
              ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>화면</b>에 표시를 켜고 끄는 토글이 있어요.
              토글을 끄면 그 내용이 본문·예문에서 빠집니다. 안 보이는 것을 다시 켜 주세요.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><b>한자 표시</b> — 중국어 한자(中文)를 보이거나 숨깁니다.</li>
              <li><b>병음 표시</b> — 한자 발음(pīnyīn)을 보이거나 숨깁니다.</li>
              <li><b>한국어 표시</b> — 한국어 뜻을 보이거나 숨깁니다.</li>
              <li><b>글자별 병음</b> — 켜면 병음이 한자 글자 위에, 끄면 한 줄로 모여 표시돼요(병음 자체는 그대로 보입니다).</li>
            </ul>
          </>
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
        keywords: '동기화 여러 기기 폰 pc 백업 파일',
        a: (
          <p>
            자동 동기화는 없습니다. 진도는 <b>단말기 안에만</b> 저장되어, 폰과 PC를 모두 쓰시면 각각 따로 쌓여요.
            기기 사이에 진도를 옮기려면 ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>학습 진행상황 백업</b>의 백업 파일을 이용하세요.
          </p>
        ),
      },
      {
        q: '진도를 초기화하고 싶어요.',
        keywords: '초기화 리셋 진도 삭제 저장 공간 전체',
        a: (
          <p>
            ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>저장 공간 → 전체 초기화</b>를 누르면 진도·즐겨찾기·플래시카드가 모두 삭제됩니다.
          </p>
        ),
      },
      {
        q: '플래시카드는 어떻게 만들어지나요?',
        keywords: '플래시카드 덱 복습 대상 즐겨찾기 오답노트 전체 단어 예문 구절 회화 시나리오 카드 종류 부록1 설정',
        a: (
          <>
            <p className="mb-2">
              65과 전체의 <b>단어·예문·구절·회화·시나리오</b>가 자동으로 카드가 됩니다.
              따로 만들 필요 없이 바로 학습할 수 있어요. 다만 ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>카드 종류</b>에서
              꺼 둔 종류는 카드로 나오지 않고, <b>부록1 기독교 용어</b>는 설정에서 켜야 학습 풀에 들어갑니다.
            </p>
            <p>
              덱(카드 묶음)은 여러 가지예요. <b>복습 대상</b>은 복습할 때가 된 카드,
              <b>즐겨찾기</b>는 ⭐ 표시한 항목, <b>오답노트</b>는 자주 틀린 카드만 모은
              덱입니다. 매일 5분씩 '복습 대상'을 풀어 보세요.
            </p>
          </>
        ),
      },
      {
        q: '플래시카드에 예문이나 회화 같은 특정 종류가 안 나와요.',
        keywords: '카드 종류 안 나와 빠짐 일부만 예문 회화 단어 구절 시나리오 부록1 설정',
        a: (
          <>
            <p className="mb-2">
              플래시카드에 넣을 <b>카드 종류</b>를 설정에서 고를 수 있어요. 거기서 꺼 둔
              종류는 카드로 나오지 않습니다. ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>카드 종류 (기본)</b>에서
              단어·예문·구절·회화·시나리오를 다시 켜 주세요. 학습 시작 화면에서도 바로 바꿀 수 있어요.
            </p>
            <p>
              <b>부록1의 기독교 용어</b>(예수·하나님 등 80여 개)는 기본적으로 꺼져 있어요.
              함께 외우려면 ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>부록1 기독교 용어 학습 포함</b>을 켜세요.
            </p>
          </>
        ),
      },
      {
        q: '듣기 테스트에 한 글자(단음절) 발음 카드가 안 나와요.',
        keywords: '듣기 테스트 대조쌍 발음표 단음절 한 글자 안 나와 빠짐 설정 토글',
        a: (
          <p>
            듣기 테스트는 기본적으로 <b>단어</b>에서 헷갈리는 짝만 뽑아요. 한 글자(단음절)
            발음표 카드까지 함께 풀려면 ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>듣기 테스트에 발음표 단음절 포함</b>을 켜세요.
          </p>
        ),
      },
      {
        q: "플래시카드 '복습 대상'에 카드가 안 나와요. 왜 그런가요?",
        keywords: '플래시카드 복습 대상 카드 안 나와 빈 화면 범위 선택 학습 분량',
        a: (
          <>
            <p className="mb-2">
              <b>"복습 대상"</b>은 먼저 <b>범위</b>를 골라야 카드가 나옵니다.
              플래시카드 화면 위쪽의 <b>"범위"</b>를 펼쳐서 오늘 학습할 과를
              선택하세요. 선택한 범위의 카드는 한 장도 빠짐없이 모두 나옵니다.
            </p>
            <p>
              하루에 외울 분량은 <b>범위를 좁게 잡아</b> 조절하세요 — 예를 들어
              한두 과만 골라 두면 그만큼만 나옵니다. 다 끝내면 다음 과를
              추가로 선택하시면 됩니다.
            </p>
          </>
        ),
      },
      {
        q: "플래시카드에서 틀린 카드는 다시 나오나요? '오답 재투입'이 뭔가요?",
        keywords: '오답 재투입 모름 어려움 틀린 카드 다시 lapses 세션',
        a: (
          <>
            <p className="mb-2">
              한 세션에서 <b>모름·어려움</b>으로 채점한 카드는, 그 세션이 끝난 뒤
              <b>'오답 재투입'</b> 덱으로 모여 한 번 더 풀 수 있어요.
            </p>
            <p>
              재투입은 <b>세션당 한 번</b>입니다. '오답 재투입'을 푸는 도중에 또 틀려도
              무한히 반복되지는 않아요. 틀린 카드는 복습 일정에도 자동으로 반영되어
              며칠 안에 '복습 대상'에서 다시 만나게 됩니다.
            </p>
          </>
        ),
      },
      {
        q: '이어듣기는 일반 학습과 뭐가 다른가요?',
        keywords: '이어듣기 마라톤 오디오 듣기 채점 없음 부록 순차 재생',
        a: (
          <p>
            이어듣기는 선택한 범위의 카드를 권·과 순서대로 <b>읽어 주기만 하는 듣기 전용</b>
            모드예요. 정답을 누르는 <b>채점이 없고</b>, 진도에도 반영되지 않습니다.
            교재 <b>부록</b>은 이어듣기 대상에서 제외됩니다. 집안일을 하거나 이동 중에
            귀로만 익히고 싶을 때 사용해 보세요.
          </p>
        ),
      },
      {
        q: '이어듣기 간격과 반복은 어떻게 조절하나요?',
        keywords: '이어듣기 간격 반복 횟수 슬라이더 2회 3회 카드 반복 리허설',
        a: (
          <p>
            이어듣기 하단의 <b>카드 간격</b> 슬라이더로 다음 카드까지 대기 시간을
            0.2~15초까지 조절할 수 있어요. 같은 카드를 반복 재생할 때 사이 간격은
            문장 리허설에 적합한 0.8초로 고정되어 있습니다.
            <b>반복</b> 버튼(+/-)으로 각 카드를 2~5회 연속 반복 재생할 수도 있습니다.
            한 문장을 여러 번 들으며 발성·성조를 익힐 때 특히 유용해요.
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
        q: '검색했더니 일부만 나와요. 결과가 다 안 보여요.',
        keywords: '검색 결과 개수 제한 60 일부만 다 안 나와요 전부',
        a: (
          <p>
            검색 결과는 한 번에 <b>최대 60개</b>까지만 표시됩니다. 흔한 한자나 짧은
            글자로 찾으면 결과가 너무 많아 일부만 보일 수 있어요. 찾는 단어를
            <b>더 길게·구체적으로</b> 입력하면 원하는 항목이 위쪽에 나옵니다.
          </p>
        ),
      },
      {
        q: '음성이 너무 빠르거나 느려요.',
        keywords: '음성 속도 빠르 느려 slow fast tts 슬라이더',
        a: (
          <p>
            ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>음성(TTS) → 속도</b> 슬라이더로 0.6× ~ 1.4× 조절할 수 있어요.
          </p>
        ),
      },
      {
        q: 'iPhone에서 음성이 자꾸 막혀요. 업데이트하면 좋아지나요?',
        a: (
          <>
            <p className="mb-2">
              네. Apple은 <b>iOS 17.4</b>부터 PWA 음성 재생 버그와 voiceschanged 이벤트 누락을 수정했어요.
              <b>설정 → 일반 → 소프트웨어 업데이트</b>에서 최신 버전으로 올린 뒤 다시 시도해 보세요.
              iPhone 8 이하 등 17을 지원하지 않는 기기는 가능한 최신 버전으로 올리고 Safari 탭에서 여세요.
            </p>
            <p className="text-xs text-muted">
              ⚠️ <b>iOS 26.0 · 26.1</b>에서는 PWA SpeechSynthesis 회귀가 다시 보고되었어요.
              가능하면 <b>iOS 26.2 이상</b>으로 업데이트하고, 그 전이라면 Safari 탭으로 직접 열어 사용하세요.
              미리 녹음된 mp3 음성은 이 회귀와 무관하게 정상 재생됩니다.
            </p>
          </>
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
      {
        q: '학습 진도를 백업하거나 다른 기기로 옮길 수 있나요?',
        keywords: '백업 복원 파일 진도 옮기기 기기 변경 이전 내보내기',
        a: (
          <>
            <p className="mb-1">
              네. ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>학습 진행상황 백업</b>에서 진도·즐겨찾기·플래시카드 기록을 파일로 저장하고 되살릴 수 있어요.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><b>백업 파일 저장</b>을 눌러 받은 파일을 이메일·메모·클라우드 등 안전한 곳에 보관하세요.</li>
              <li>새 기기나 다시 설치한 앱에서 <b>백업에서 복원</b>을 눌러 그 파일을 불러오면 예전 진도가 그대로 옮겨집니다.</li>
              <li>복원하면 그 기기의 현재 기록을 백업 내용으로 덮어쓰니, 옮기는 방향에 주의하세요.</li>
            </ul>
            <p className="text-xs text-muted mt-2">
              💡 자동 동기화는 아직 없습니다(서버가 없어요). 여러 기기를 쓰신다면 가끔 백업 파일로 직접 옮겨 주세요.
            </p>
          </>
        ),
      },
      {
        q: '검색 결과가 옛 데이터인 것 같아요 / 단어가 안 나와요.',
        keywords: '검색 인덱스 옛 데이터 캐시 새로고침 콘텐츠',
        a: (
          <p>
            ⚙️ <Link to="/settings" className="text-primary font-semibold underline">설정</Link> → <b>저장 공간 → 콘텐츠 캐시 비우기</b>를 누른 뒤 검색을 다시 사용하면 인덱스가 새로 받아집니다. (학습 진도는 유지됩니다.)
          </p>
        ),
      },
      {
        q: '왜 모든 사람이 같은 음성으로 듣나요?',
        a: (
          <p>
            이 앱은 본문·단어·회화 발음을 빌드 시점에 <b>Microsoft Edge Neural TTS</b>(여성, 표준 보통화)로
            미리 녹음한 mp3로 재생합니다. 단말기·운영체제에 관계없이 <b>동일한 발음과 억양</b>을 듣게 되어
            학습 일관성이 높아집니다.
          </p>
        ),
      },
      {
        q: '단말기에 중국어 음성팩이 없어도 발음을 들을 수 있나요?',
        a: (
          <p>
            네. 약 <b>3,500여 개</b>의 미리 녹음된 mp3 파일을 함께 배포합니다.
            iPhone·Android·PC 어디서든 음성팩 다운로드 없이 바로 들립니다.
            처음 한 번만 인터넷이 필요하고, 한 번 재생하면 단말기에 캐시되어 오프라인에서도 들을 수 있어요.
            미리 녹음되지 않은 텍스트만 단말기 내장 음성으로 대체됩니다.
          </p>
        ),
      },
      {
        q: '한국어 발음도 지원하나요?',
        a: (
          <p>
            아니요. 이 앱은 <b>중국어 발음만</b> 제공합니다. 한국어 뜻 읽어주기는 지원하지 않아요.
            또한 한국어 음성이 한자를 잘못 발음(한국어 한자음)하는 것을 막기 위해,
            중국어 음성팩이 없는 단말에서는 음성 재생을 시도하지 않습니다.
          </p>
        ),
      },
      {
        q: '용어가 어려워요 — PWA, 서비스워커, ITP가 뭔가요?',
        a: (
          <ul className="list-disc pl-5 space-y-1">
            <li><b>PWA(홈 화면 앱)</b>: 일반 앱처럼 홈 화면에 아이콘이 생기고 인터넷 없이도 열리는 웹앱 형식.</li>
            <li><b>서비스워커(앱 캐시)</b>: 본문·음성 버튼을 단말기에 저장해 두는 작은 도우미. 오프라인 사용을 가능하게 합니다.</li>
            <li><b>ITP(Apple 자동 삭제 정책)</b>: iPhone Safari가 7일 이상 안 쓴 사이트의 데이터를 자동 지우는 보안 정책. 홈 화면 앱으로 설치하면 이 제한을 받지 않아요.</li>
            <li><b>voiceschanged(음성 목록 갱신)</b>: 단말기에 새 음성팩을 받았을 때 브라우저가 목록을 새로고침하는 신호.</li>
          </ul>
        ),
      },
];

function FAQList({ query }: { query: string }): JSX.Element {
  const filtered = FAQ_ITEMS.filter((f) => matchQuery(f, query));
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const searching = query.length > 0;

  if (filtered.length === 0) {
    return (
      <div className="text-sm text-muted">
        이 검색어에 해당하는 질문이 없어요. 다른 단어로 찾아 보세요.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-divider bg-bg divide-y divide-divider overflow-hidden">
      {filtered.map((f, i) => (
        <FAQItem
          key={i}
          q={f.q}
          a={f.a}
          isOpen={searching ? true : openIdx === i}
          onToggle={() => setOpenIdx((cur) => (cur === i ? null : i))}
        />
      ))}
    </div>
  );
}

function FAQItem({
  q,
  a,
  isOpen,
  onToggle,
}: FAQ & { isOpen: boolean; onToggle: () => void }): JSX.Element {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-fg inline-flex items-center gap-2">{q}</span>
        <ChevronDown
          size={18}
          aria-hidden
          className={cn(
            'flex-none text-muted transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>
      {isOpen && <div className="px-4 pb-3 text-sm text-muted">{a}</div>}
    </div>
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
