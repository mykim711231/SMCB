import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Star, StarOff } from 'lucide-react';
import type { Lesson } from '@/types/lesson';
import { loadLesson, META } from '@/data/loaders';
import { useProgress } from '@/stores/progress';
import { useFavorites, favKey } from '@/stores/favorites';
import { useSettings } from '@/stores/settings';
import VerseRow from '@/components/VerseRow';
import SectionHeader from '@/components/SectionHeader';
import TTSButton from '@/components/TTSButton';
import { cn } from '@/lib/cn';

export default function LessonPage(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visit = useProgress((s) => s.visit);
  const markRead = useProgress((s) => s.markRead);
  const read = useProgress((s) => (id ? Boolean(s.byId[id]?.read) : false));
  const favHas = useFavorites((s) => s.has);
  const favToggle = useFavorites((s) => s.toggle);
  const { showHanzi, showPinyin, showKorean, toggleHanzi, togglePinyin, toggleKorean } = useSettings();

  useEffect(() => {
    let alive = true;
    setLesson(null);
    setError(null);
    if (!id) return;
    loadLesson(id)
      .then((l) => {
        if (!alive) return;
        if (!l) {
          setError('과를 찾을 수 없습니다.');
        } else {
          setLesson(l);
          visit(id);
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
      })
      .catch(() => alive && setError('콘텐츠를 불러오지 못했습니다.'));
    return () => {
      alive = false;
    };
  }, [id, visit]);

  if (!id) return <div className="text-muted">경로 오류</div>;
  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-fg">{error}</p>
        <Link to="/toc" className="text-primary underline">목차로</Link>
      </div>
    );
  }
  if (!lesson) {
    return <div className="text-muted" aria-live="polite">불러오는 중…</div>;
  }

  const idx = META.findIndex((m) => m.id === lesson.id);
  const prev = idx > 0 ? META[idx - 1] : null;
  const next = idx < META.length - 1 ? META[idx + 1] : null;

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs text-muted uppercase tracking-wider">
          Vol.{lesson.vol} · 第 {lesson.no} 课
        </p>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-fg leading-tight">{lesson.titleZh}</h1>
            <p className="text-pinyin font-pinyin text-sm mt-1">{lesson.titlePinyin}</p>
            <p className="text-fg/90 text-base mt-1">{lesson.titleKo}</p>
          </div>
          <TTSButton text={lesson.titleZh} label="제목 듣기" />
        </div>
        <button
          type="button"
          onClick={() => markRead(lesson.id, !read)}
          className={cn(
            'mt-2 inline-flex items-center gap-1.5 rounded-full text-sm font-semibold px-4 py-2 border',
            read
              ? 'bg-success text-white border-success'
              : 'bg-surface text-fg border-divider',
          )}
          aria-pressed={read}
        >
          <Check size={16} aria-hidden /> {read ? '학습 완료' : '학습 완료로 표시'}
        </button>
      </header>

      {/* Visibility toggle bar */}
      <div className="sticky top-14 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-bg/95 border-b border-divider flex gap-2 overflow-x-auto">
        <ToggleChip on={showHanzi} onClick={toggleHanzi} label="한자" />
        <ToggleChip on={showPinyin} onClick={togglePinyin} label="병음" />
        <ToggleChip on={showKorean} onClick={toggleKorean} label="한국어" />
      </div>

      {lesson.body.length > 0 && (
        <section>
          <SectionHeader title="本文 본문" />
          <div className="divide-y divide-divider">
            {lesson.body.map((v, i) => (
              <VerseRow key={i} verse={v} />
            ))}
          </div>
        </section>
      )}

      {lesson.bible.length > 0 && (
        <section>
          <SectionHeader title="圣经引用 성경 인용" />
          <ul className="space-y-3">
            {lesson.bible.map((b, i) => {
              const k = favKey(lesson.id, 'bible', i);
              const starred = favHas(k);
              return (
                <li key={i} className="rounded-xl border border-divider p-4 bg-surface">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-primary font-semibold">
                      {b.ref} <span className="text-muted font-normal">· {b.refKo}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => favToggle(k)}
                      aria-label={starred ? '즐겨찾기 해제' : '즐겨찾기'}
                      aria-pressed={starred}
                      className="w-9 h-9 inline-flex items-center justify-center rounded-full hover:bg-primary-soft"
                    >
                      {starred ? (
                        <Star size={18} className="text-accent fill-current" />
                      ) : (
                        <StarOff size={18} className="text-muted" aria-hidden />
                      )}
                    </button>
                  </div>
                  <VerseRow verse={b.text} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {lesson.questions.length > 0 && (
        <section>
          <SectionHeader title="本文问题 본문질문" />
          <ol className="list-decimal pl-5 space-y-2">
            {lesson.questions.map((q, i) => (
              <li key={i}>
                <VerseRow verse={q} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {lesson.vocab.length > 0 && (
        <section>
          <SectionHeader title="主要词汇 주요 어휘" subtitle={`${lesson.vocab.length}개`} />
          <ul className="divide-y divide-divider">
            {lesson.vocab.map((v) => {
              const k = favKey(lesson.id, 'vocab', v.id);
              const starred = favHas(k);
              return (
                <li key={v.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <TTSButton text={v.word} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-2xl font-semibold text-fg">{v.word}</span>
                        <span className="text-pinyin font-pinyin text-sm">{v.pinyin}</span>
                        <span className="text-xs text-muted">{v.pos}</span>
                      </div>
                      <p className="text-fg/90 mt-1">{v.meaning}</p>
                      {v.hanjaNote && (
                        <p className="text-xs text-muted mt-1 leading-snug">{v.hanjaNote}</p>
                      )}
                      {v.example && (
                        <div className="mt-2 rounded-lg bg-primary-soft/40 px-3 py-2">
                          <VerseRow verse={v.example} tts={false} className="py-0" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => favToggle(k)}
                      aria-label={starred ? '즐겨찾기 해제' : '즐겨찾기'}
                      aria-pressed={starred}
                      className="w-9 h-9 inline-flex items-center justify-center rounded-full hover:bg-primary-soft"
                    >
                      {starred ? (
                        <Star size={18} className="text-accent fill-current" />
                      ) : (
                        <StarOff size={18} className="text-muted" aria-hidden />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {lesson.pronunciation.length > 0 && (
        <section>
          <SectionHeader title="发音点 발음 포인트" />
          <div className="overflow-x-auto rounded-xl border border-divider">
            <table className="w-full text-sm">
              <thead className="bg-primary-soft/40 text-fg">
                <tr>
                  <th className="text-left px-3 py-2">한자</th>
                  <th className="text-left px-3 py-2">병음</th>
                  <th className="text-left px-3 py-2">뜻</th>
                  <th className="text-left px-3 py-2">메모</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {lesson.pronunciation.map((p, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-xl">{p.hanzi}</td>
                    <td className="px-3 py-2 font-pinyin text-pinyin">{p.pinyin}</td>
                    <td className="px-3 py-2">{p.ko}</td>
                    <td className="px-3 py-2 text-muted">{p.note}</td>
                    <td className="px-3 py-2"><TTSButton text={p.hanzi} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {lesson.grammar.length > 0 && (
        <section>
          <SectionHeader title="语法点 어법 포인트" />
          <ul className="space-y-3">
            {lesson.grammar.map((g, i) => (
              <li key={i} className="rounded-xl border border-divider p-4 bg-surface">
                <p className="text-lg font-semibold text-fg">{g.pattern}</p>
                <p className="text-sm text-muted mt-0.5">{g.meaningKo}</p>
                {g.examples.length > 0 && (
                  <div className="mt-2 divide-y divide-divider">
                    {g.examples.map((ex, j) => (
                      <VerseRow key={j} verse={ex} />
                    ))}
                  </div>
                )}
                {g.note && <p className="text-xs text-muted mt-2">{g.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lesson.dialogDaily.length > 0 && (
        <section>
          <SectionHeader title="应用会话 응용 회화" />
          <div className="rounded-xl border border-divider bg-surface p-4 divide-y divide-divider">
            {lesson.dialogDaily.flatMap((d, di) =>
              d.lines.map((v, li) => (
                <VerseRow key={`${di}-${li}`} verse={v} prefix={d.role ? `${d.role}:` : undefined} />
              )),
            )}
          </div>
        </section>
      )}

      {lesson.dialogGospel.length > 0 && (
        <section>
          <SectionHeader title="传福音对话 전도 회화" />
          <div className="rounded-xl border border-divider bg-surface p-4 divide-y divide-divider">
            {lesson.dialogGospel.flatMap((d, di) =>
              d.lines.map((v, li) => (
                <VerseRow key={`${di}-${li}`} verse={v} prefix={d.role ? `${d.role}:` : undefined} />
              )),
            )}
          </div>
        </section>
      )}

      {lesson.scenarios.length > 0 && (
        <section>
          <SectionHeader title="实战场景 실전 상황" />
          <ul className="space-y-3">
            {lesson.scenarios.map((s, i) => (
              <li key={i} className="rounded-xl border border-divider p-4 bg-surface">
                <p className="font-semibold text-fg">{s.title}</p>
                <div className="mt-2 divide-y divide-divider">
                  {s.segments.map((seg, j) =>
                    seg.kind === 'verse' ? (
                      <VerseRow key={j} verse={seg.verse} prefix={seg.prefix} />
                    ) : (
                      <p key={j} className="text-fg/90 py-2 leading-relaxed">{seg.text}</p>
                    ),
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="flex items-center justify-between gap-3 mt-8 pt-4 border-t border-divider">
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && navigate(`/lesson/${prev.id}`)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold border',
            prev
              ? 'bg-surface text-fg border-divider'
              : 'bg-surface text-muted/50 border-divider/50 cursor-not-allowed',
          )}
        >
          <ChevronLeft size={16} aria-hidden /> 이전
        </button>
        <Link to="/toc" className="text-sm text-muted underline">목차</Link>
        <button
          type="button"
          disabled={!next}
          onClick={() => next && navigate(`/lesson/${next.id}`)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold border',
            next
              ? 'bg-primary text-white border-primary'
              : 'bg-surface text-muted/50 border-divider/50 cursor-not-allowed',
          )}
        >
          다음 <ChevronRight size={16} aria-hidden />
        </button>
      </nav>
    </article>
  );
}

function ToggleChip(props: { on: boolean; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={props.on}
      onClick={props.onClick}
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold border whitespace-nowrap',
        props.on
          ? 'bg-primary text-white border-primary'
          : 'bg-surface text-muted border-divider',
      )}
    >
      {props.label}
    </button>
  );
}
