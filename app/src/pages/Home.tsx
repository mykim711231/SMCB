import { Link } from 'react-router-dom';
import { BookOpen, Search, HelpCircle, ArrowRight, AlertTriangle, Type, GraduationCap } from 'lucide-react';
import { META } from '@/data/loaders';
import { useProgress, progressPercent } from '@/stores/progress';
import InstallPrompt from '@/components/InstallPrompt';
import OnboardingCard from '@/components/OnboardingCard';
import DeviceVoiceMissingBanner from '@/components/DeviceVoiceMissingBanner';
import RecordedAudioMissingBanner from '@/components/RecordedAudioMissingBanner';

function isInAppBrowser(): { kind: 'kakao' | 'naver' | 'line' | 'facebook' | 'instagram' | null; label: string | null } {
  if (typeof navigator === 'undefined') return { kind: null, label: null };
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return { kind: 'kakao', label: '카카오톡' };
  if (/NAVER\(inapp/i.test(ua)) return { kind: 'naver', label: '네이버 앱' };
  if (/Line\//i.test(ua)) return { kind: 'line', label: 'LINE' };
  if (/FBAN|FBAV/i.test(ua)) return { kind: 'facebook', label: 'Facebook' };
  if (/Instagram/i.test(ua)) return { kind: 'instagram', label: 'Instagram' };
  return { kind: null, label: null };
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function InAppBrowserBanner({ label }: { label: string }): JSX.Element {
  return (
    <section className="rounded-2xl border-2 border-accent bg-accent/10 p-4 sm:p-5">
      <p className="font-bold text-fg inline-flex items-center gap-1.5">
        <AlertTriangle size={18} aria-hidden /> {label} 내장 브라우저로 열려 있어요
      </p>
      <p className="text-sm text-fg/90 mt-2">
        이 화면에서는 <b>음성 재생·앱 설치·오프라인 사용</b>이 동작하지 않을 수 있습니다.
      </p>
      <p className="text-sm text-fg mt-2 font-semibold">▸ 해결 방법</p>
      <ul className="list-disc pl-5 text-sm text-fg/90 space-y-1 mt-1">
        <li>화면 <b>오른쪽 위 ⋮ 메뉴</b> → <b>"기본 브라우저로 열기"</b> 또는 <b>"Safari/Chrome으로 열기"</b>.</li>
        <li>메뉴가 없으면 페이지 주소를 길게 눌러 <b>"링크 복사"</b> → Safari(iPhone)·Chrome(Android)에 붙여넣기.</li>
      </ul>
    </section>
  );
}

export default function Home(): JSX.Element {
  const byId = useProgress((s) => s.byId);
  const lastId = useProgress((s) => s.lastLessonId);
  const total = META.length;
  const pct = progressPercent(byId, total);
  const done = Object.values(byId).filter((p) => p.read).length;

  const lastMeta = lastId ? META.find((m) => m.id === lastId) : undefined;
  const inApp = isInAppBrowser();
  const standalone = isStandaloneMode();

  return (
    <div className="space-y-6">
      {inApp.label && <InAppBrowserBanner label={inApp.label} />}
      {!inApp.label && <OnboardingCard />}
      {!inApp.label && <DeviceVoiceMissingBanner />}
      {!inApp.label && <RecordedAudioMissingBanner />}
      {!standalone && !inApp.label && <InstallPrompt defaultExpanded />}

      <section className="rounded-2xl bg-primary text-white p-5 sm:p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wider opacity-80">
          새문안교회
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold mt-1 leading-tight">
          중국어 성경반 (중급)
        </h1>
        <p className="text-sm opacity-90 mt-2">
          한자 · 병음 · 한국어 토글, 단말기 내장 TTS로 듣고 따라하기.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={lastMeta ? `/lesson/${lastMeta.id}` : '/toc'}
            className="inline-flex items-center gap-1.5 rounded-full bg-white text-primary text-sm font-semibold px-4 py-2"
          >
            {lastMeta ? '이어서 학습' : '학습 시작'} <ArrowRight size={16} aria-hidden />
          </Link>
          <Link
            to="/toc"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 text-white text-sm font-semibold px-4 py-2 border border-white/30"
          >
            전체 목차
          </Link>
        </div>
      </section>

      <section className="rounded-2xl bg-surface border border-divider p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-base font-bold text-fg">학습 진도</h2>
          <span className="text-sm text-muted">{done}/{total} 과 ({pct}%)</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="w-full h-2 rounded-full bg-divider overflow-hidden"
        >
          <div className="h-full bg-success transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        {lastMeta && (
          <p className="text-sm text-muted mt-3">
            최근:{' '}
            <Link to={`/lesson/${lastMeta.id}`} className="text-primary font-medium underline">
              {lastMeta.titleKo} · {lastMeta.titleZh}
            </Link>
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <QuickCard to="/toc" icon={<BookOpen size={20} aria-hidden />} title="목차" subtitle="65과 전체" />
        <QuickCard to="/search" icon={<Search size={20} aria-hidden />} title="검색" subtitle="한자·병음·한글" />
        <QuickCard to="/learn" icon={<GraduationCap size={20} aria-hidden />} title="학습" subtitle="플래시·문장·4지선다·대조쌍" />
        <QuickCard to="/hanzi" icon={<Type size={20} aria-hidden />} title="한자 인덱스" subtitle="글자별 단어" />
        <QuickCard to="/help" icon={<HelpCircle size={20} aria-hidden />} title="도움말" subtitle="음성·설치·FAQ" />
      </section>

      <section className="rounded-2xl bg-surface border border-divider p-4 sm:p-5">
        <h2 className="text-base font-bold text-fg mb-2">발음</h2>
        <ul className="divide-y divide-divider">
          {[
            { id: 'pronunciation1', title: '발음표', zh: '发音表' },
            { id: 'pronunciation2', title: '성조 변화', zh: '声调变化' },
            { id: 'pronunciation3', title: '병음 표기 규칙', zh: '拼写规则' },
          ].map((a) => (
            <li key={a.id}>
              <Link
                to={`/appendix/${a.id}`}
                className="flex items-center justify-between py-3 text-fg hover:text-primary"
              >
                <span className="flex flex-col">
                  <span>{a.title}</span>
                  <span className="text-xs text-muted">{a.zh}</span>
                </span>
                <ArrowRight size={16} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-surface border border-divider p-4 sm:p-5">
        <h2 className="text-base font-bold text-fg mb-2">교재 부록</h2>
        <ul className="divide-y divide-divider">
          {[
            { id: 'appendix1', title: '중국어 기독교 어휘표', zh: '中文基督教词汇表' },
            { id: 'appendix2', title: '중국 문화 배경과 선교', zh: '中国文化背景与宣教' },
          ].map((a) => (
            <li key={a.id}>
              <Link
                to={`/appendix/${a.id}`}
                className="flex items-center justify-between py-3 text-fg hover:text-primary"
              >
                <span className="flex flex-col">
                  <span>{a.title}</span>
                  <span className="text-xs text-muted">{a.zh}</span>
                </span>
                <ArrowRight size={16} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}

function QuickCard(props: {
  to: string;
  icon: JSX.Element;
  title: string;
  subtitle: string;
}): JSX.Element {
  return (
    <Link
      to={props.to}
      className="rounded-2xl bg-surface border border-divider p-4 flex flex-col gap-1 active:scale-[0.98] transition-transform"
    >
      <span className="w-9 h-9 inline-flex items-center justify-center rounded-lg bg-primary-soft text-primary">
        {props.icon}
      </span>
      <p className="text-sm font-bold text-fg mt-1">{props.title}</p>
      <p className="text-xs text-muted">{props.subtitle}</p>
    </Link>
  );
}
