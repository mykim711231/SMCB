import { useEffect, useState } from 'react';
import { Trash2, RefreshCw } from 'lucide-react';
import { useSettings, type Theme, type FontSize } from '@/stores/settings';
import { useProgress } from '@/stores/progress';
import { useFavorites } from '@/stores/favorites';
import { useSRS } from '@/stores/srs';
import { getStorageInfo, clearAllCaches, clearContentCaches, type StorageInfo } from '@/lib/storage';
import { dbClearAll } from '@/lib/db';
import { awaitVoices, isSupported } from '@/lib/tts';
import { cn } from '@/lib/cn';
import SectionHeader from '@/components/SectionHeader';

export default function Settings(): JSX.Element {
  const s = useSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isSupported()) {
      void awaitVoices().then((vs) => {
        setVoices(vs.filter((v) => v.lang.toLowerCase().startsWith('zh')));
      });
    }
    refreshStorage();
  }, []);

  const refreshStorage = (): void => {
    void getStorageInfo().then(setStorage);
  };

  const onClearContent = async (): Promise<void> => {
    const n = await clearContentCaches();
    setMsg(`콘텐츠 캐시 ${n}개 삭제됨`);
    refreshStorage();
  };

  const onClearAll = async (): Promise<void> => {
    if (!confirm('모든 캐시와 학습 진도/즐겨찾기/플래시카드 데이터가 삭제됩니다. 계속하시겠습니까?')) return;
    await clearAllCaches();
    await dbClearAll();
    useProgress.setState({ byId: {}, lastLessonId: null });
    useFavorites.setState({ items: {} });
    useSRS.setState({ cards: {} });
    setMsg('모든 데이터가 초기화되었습니다.');
    refreshStorage();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-fg">설정</h1>

      <section>
        <SectionHeader title="화면" />
        <div className="rounded-2xl border border-divider bg-surface divide-y divide-divider">
          <Row label="테마">
            <Segmented
              value={s.theme}
              options={[
                { v: 'light', l: '라이트' },
                { v: 'dark', l: '다크' },
                { v: 'system', l: '시스템' },
              ]}
              onChange={(v) => s.setTheme(v as Theme)}
            />
          </Row>
          <Row label="글자 크기">
            <Segmented
              value={s.fontSize}
              options={[
                { v: 'md', l: '보통' },
                { v: 'lg', l: '크게' },
                { v: 'xl', l: '아주 크게' },
              ]}
              onChange={(v) => s.setFontSize(v as FontSize)}
            />
          </Row>
          <Row label="한자 표시">
            <Toggle on={s.showHanzi} onClick={s.toggleHanzi} />
          </Row>
          <Row label="병음 표시">
            <Toggle on={s.showPinyin} onClick={s.togglePinyin} />
          </Row>
          <Row label="한국어 표시">
            <Toggle on={s.showKorean} onClick={s.toggleKorean} />
          </Row>
        </div>
      </section>

      <section>
        <SectionHeader title="음성 (TTS)" subtitle="단말기 내장 음성을 사용합니다." />
        <div className="rounded-2xl border border-divider bg-surface divide-y divide-divider">
          <Row label={`속도: ${s.ttsRate.toFixed(2)}×`}>
            <input
              type="range"
              min={0.6}
              max={1.4}
              step={0.05}
              value={s.ttsRate}
              onChange={(e) => s.setTTSRate(Number(e.target.value))}
              className="w-40"
              aria-label="음성 속도"
            />
          </Row>
          <Row label="음성 선택">
            {voices.length > 0 ? (
              <select
                value={s.ttsVoiceURI ?? ''}
                onChange={(e) => s.setTTSVoiceURI(e.target.value || null)}
                className="rounded-lg border border-divider bg-bg text-fg px-2 py-1 text-sm max-w-[60vw]"
              >
                <option value="">자동</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-muted">중국어 음성 없음 / 미지원</span>
            )}
          </Row>
        </div>
      </section>

      <section>
        <SectionHeader
          title="저장 공간"
          subtitle="설치 후 단말기 용량을 줄이고 싶다면 콘텐츠 캐시를 비울 수 있습니다."
          right={
            <button
              type="button"
              onClick={refreshStorage}
              className="inline-flex items-center gap-1 text-sm text-primary"
            >
              <RefreshCw size={14} aria-hidden /> 새로고침
            </button>
          }
        />
        <div className="rounded-2xl border border-divider bg-surface p-4 space-y-3">
          {storage && storage.supported ? (
            <>
              <p className="text-sm text-fg">
                사용 중: <span className="font-semibold">{storage.usageMB} MB</span>
                {' / '}
                할당: <span className="font-semibold">{storage.quotaMB} MB</span>
                {' '}
                <span className="text-muted">({storage.percent}%)</span>
              </p>
              <div className="w-full h-2 rounded-full bg-divider overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, storage.percent)}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">브라우저가 저장 공간 정보를 제공하지 않습니다.</p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={onClearContent}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-divider text-fg text-sm font-semibold px-3 py-2"
            >
              <Trash2 size={14} aria-hidden /> 콘텐츠 캐시 비우기
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 border border-accent text-accent text-sm font-semibold px-3 py-2"
            >
              <Trash2 size={14} aria-hidden /> 전체 초기화
            </button>
          </div>
          {msg && <p className="text-sm text-success pt-1">{msg}</p>}
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-fg">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        on ? 'bg-primary' : 'bg-divider',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow',
          on ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function Segmented<T extends string>(props: {
  value: T;
  options: Array<{ v: T; l: string }>;
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div className="inline-flex rounded-full border border-divider bg-bg p-0.5">
      {props.options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={props.value === o.v}
          onClick={() => props.onChange(o.v)}
          className={cn(
            'rounded-full px-3 py-1 text-sm font-semibold',
            props.value === o.v ? 'bg-primary text-white' : 'text-muted',
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
