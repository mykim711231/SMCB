import { Link } from 'react-router-dom';
import { BookOpen, Search, Layers, HelpCircle, ArrowRight } from 'lucide-react';
import { META } from '@/data/loaders';
import { useProgress, progressPercent } from '@/stores/progress';
import InstallPrompt from '@/components/InstallPrompt';

export default function Home(): JSX.Element {
  const byId = useProgress((s) => s.byId);
  const lastId = useProgress((s) => s.lastLessonId);
  const total = META.length;
  const pct = progressPercent(byId, total);
  const done = Object.values(byId).filter((p) => p.read).length;

  const lastMeta = lastId ? META.find((m) => m.id === lastId) : undefined;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-primary text-white p-5 sm:p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wider opacity-80">
          새문안교회 중급
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold mt-1 leading-tight">
          중국어 성경반
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
        <QuickCard to="/flashcards" icon={<Layers size={20} aria-hidden />} title="플래시카드" subtitle="단어 복습" />
        <QuickCard to="/help" icon={<HelpCircle size={20} aria-hidden />} title="도움말" subtitle="음성·설치·FAQ" />
      </section>

      <section className="rounded-2xl bg-surface border border-divider p-4 sm:p-5">
        <h2 className="text-base font-bold text-fg mb-2">부록</h2>
        <ul className="divide-y divide-divider">
          {[
            { id: 'appendix1', title: '중국어 기독교 어휘표' },
            { id: 'appendix2', title: '중국 문화 배경과 선교' },
          ].map((a) => (
            <li key={a.id}>
              <Link
                to={`/appendix/${a.id}`}
                className="flex items-center justify-between py-3 text-fg hover:text-primary"
              >
                <span>{a.title}</span>
                <ArrowRight size={16} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <InstallPrompt />
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
