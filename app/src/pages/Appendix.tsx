import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Appendix } from '@/types/lesson';
import { loadAppendix } from '@/data/loaders';

const TITLES: Record<string, string> = {
  appendix1: '附录 1 — 중국어 기독교 어휘표',
  appendix2: '附录 2 — 중국 문화 배경과 선교',
  appendix3: '附录 3 — 북경표준중국어 검토보고서',
};

export default function AppendixPage(): JSX.Element {
  const { id } = useParams();
  const [data, setData] = useState<Appendix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!id) return;
    loadAppendix(id as Appendix['id']).then((a) => {
      if (!alive) return;
      if (!a) setError('부록을 찾을 수 없습니다.');
      else setData(a);
    });
    return () => { alive = false; };
  }, [id]);

  if (!id) return <div className="text-muted">경로 오류</div>;
  if (error) return (
    <div className="space-y-2">
      <p className="text-fg">{error}</p>
      <Link to="/" className="text-primary underline">홈으로</Link>
    </div>
  );
  if (!data) return <div className="text-muted">불러오는 중…</div>;

  return (
    <article className="space-y-4">
      <h1 className="text-xl font-bold text-fg">{TITLES[id] ?? data.title}</h1>
      {/* Markdown is rendered as preformatted text — small footprint, no extra parser. */}
      <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-fg/95 bg-surface border border-divider rounded-2xl p-4">
{data.markdown}
      </pre>
    </article>
  );
}
