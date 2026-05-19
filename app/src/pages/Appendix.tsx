import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Appendix } from '@/types/lesson';
import { loadAppendix } from '@/data/loaders';
import Markdown from '@/components/Markdown';

export default function AppendixPage(): JSX.Element {
  const { id } = useParams();
  const [data, setData] = useState<Appendix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!id) return;
    loadAppendix(id).then((a) => {
      if (!alive) return;
      if (!a) setError('자료를 찾을 수 없습니다.');
      else setData(a);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!id) return <div className="text-muted">경로 오류</div>;
  if (error)
    return (
      <div className="space-y-2">
        <p className="text-fg">{error}</p>
        <Link to="/" className="text-primary underline">
          홈으로
        </Link>
      </div>
    );
  if (!data) return <div className="text-muted">불러오는 중…</div>;

  return (
    <article className="space-y-4">
      <h1 className="text-xl font-bold text-fg">{data.title}</h1>
      <div className="bg-surface border border-divider rounded-2xl p-4 sm:p-5">
        <Markdown source={data.markdown} />
      </div>
    </article>
  );
}
