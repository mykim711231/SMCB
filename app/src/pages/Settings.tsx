import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, RefreshCw, AlertTriangle, Info, ChevronRight, Download, Loader2, CheckCircle2 } from 'lucide-react';
import { useSettings, type Theme, type FontSize, type FlashcardGrades, type FlashcardDirection, type UserMode } from '@/stores/settings';
import type { SRSAlgorithm } from '@/stores/srs';
import { useProgress } from '@/stores/progress';
import { useFavorites } from '@/stores/favorites';
import { useSRS } from '@/stores/srs';
import { getStorageInfo, clearAllCaches, clearContentCaches, type StorageInfo } from '@/lib/storage';
import { dbClearAll } from '@/lib/db';
import { awaitVoices, isSupported, isIOS, isStandalonePWA } from '@/lib/tts';
import { bulkDownloadAll, getManifestSize } from '@/lib/ttsBulkDownload';
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
    useSRS.setState({ cards: {}, newCardsByDate: {}, reviewsByDate: {} });
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
        <SectionHeader
          title="음성 재생 방식"
          subtitle="기기에 설치된 음성을 쓸지, 미리 녹음된 음성을 받아 쓸지 고를 수 있어요."
        />
        <div className="rounded-2xl border border-divider bg-surface divide-y divide-divider">
          <Row label="재생 방식">
            <Segmented
              value={s.userMode ?? 'recorded'}
              options={[
                { v: 'device', l: '기기 음성' },
                { v: 'recorded', l: '녹음 음성' },
              ]}
              onChange={(v) => s.setUserMode(v as UserMode)}
            />
          </Row>
        </div>
        {(s.userMode ?? 'recorded') === 'recorded' && <TTSBulkCard />}
        {s.userMode === 'device' && (
          <p className="mt-2 text-xs text-muted px-1">
            기기에 중국어(zh-CN) 음성팩이 설치되어 있어야 정상 재생됩니다.
            음성팩이 없으면{' '}
            <Link to="/help" className="text-primary font-semibold underline">
              도움말의 음성 진단
            </Link>
            을 참고해 주세요.
          </p>
        )}
      </section>

      <section>
        <SectionHeader title="음성 (TTS)" subtitle="미리 녹음된 mp3로 재생합니다. 단말기 중국어 음성팩은 보조용이에요." />
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
        {voices.length === 0 && isSupported() && (
          <div className="mt-3 rounded-2xl border border-accent/30 bg-accent/10 p-4 text-sm text-fg">
            <p className="font-bold mb-2 inline-flex items-center gap-1.5"><AlertTriangle size={16} aria-hidden /> 중국어 음성이 감지되지 않았습니다</p>
            {isIOS() ? (
              <>
                <p className="mb-2">아이폰에서 중국어 음성팩을 다운로드해 주세요:</p>
                <ol className="list-decimal pl-5 space-y-1 text-muted">
                  <li>설정 → 손쉬운 사용</li>
                  <li>음성 콘텐츠 → 음성</li>
                  <li>중국어 → "중국어(중국 본토)" 또는 "보통화" 다운로드</li>
                  <li>완료 후 이 앱을 다시 열어 주세요</li>
                </ol>
              </>
            ) : (
              <>
                <p className="mb-2">단말기에서 중국어(zh-CN) 음성팩을 설치해 주세요:</p>
                <ul className="list-disc pl-5 space-y-1 text-muted">
                  <li>안드로이드: 설정 → 일반 관리 → 언어 → 음성 → Google 음성 → 언어 설치 → 중국어</li>
                  <li>윈도우: 설정 → 시간 및 언어 → 언어 → 중국어 추가 → 음성 패키지 포함</li>
                </ul>
              </>
            )}
          </div>
        )}
        {isIOS() && isStandalonePWA() && voices.length > 0 && (
          <div className="mt-3 rounded-2xl border border-divider bg-primary-soft p-4 text-sm text-fg">
            <p className="font-bold mb-1 inline-flex items-center gap-1.5"><Info size={16} aria-hidden /> 음성이 재생되지 않으면</p>
            <p className="text-muted">
              아이폰에서 홈 화면 앱(PWA)으로 열면 iOS 17.4 미만 버전은 음성 재생이 막힐 수 있습니다.
              그럴 땐 Safari로 페이지를 다시 열어 시도해 주세요.
            </p>
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="플래시카드" subtitle="복습 알고리즘과 일일 학습량을 조절합니다." />
        <div className="rounded-2xl border border-divider bg-surface divide-y divide-divider">
          <Row label="채점 단계">
            <Segmented
              value={String(s.fcGrades)}
              options={[
                { v: '2', l: '2단계' },
                { v: '4', l: '4단계' },
              ]}
              onChange={(v) => s.setFcGrades(Number(v) as FlashcardGrades)}
            />
          </Row>
          <Row label="알고리즘">
            <Segmented
              value={s.fcAlgorithm}
              options={[
                { v: 'leitner', l: 'Leitner' },
                { v: 'sm2', l: 'SM-2' },
              ]}
              onChange={(v) => s.setFcAlgorithm(v as SRSAlgorithm)}
            />
          </Row>
          <Row label="문제 방향(기본)">
            <Segmented
              value={s.fcDirection}
              options={[
                { v: 'zh2ko', l: '中→韓' },
                { v: 'ko2zh', l: '韓→中' },
                { v: 'mixed', l: '혼합' },
              ]}
              onChange={(v) => s.setFcDirection(v as FlashcardDirection)}
            />
          </Row>
          <Row label="카드 종류 (기본)">
            <div className="flex flex-wrap gap-1.5">
              {(['vocab', 'example', 'verse'] as const).map((k) => {
                const label = k === 'vocab' ? '단어' : k === 'example' ? '예문' : '구절';
                const on = s.fcCardTypes[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => s.setFcCardTypes({ ...s.fcCardTypes, [k]: !on })}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold border',
                      on ? 'bg-primary text-white border-primary' : 'bg-surface text-muted border-divider',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label="자동 음성 재생">
            <Toggle on={s.fcAutoplay} onClick={() => s.setFcAutoplay(!s.fcAutoplay)} />
          </Row>
          <Row label="오디오 마라톤 모드">
            <Toggle on={s.fcAudioMarathon} onClick={() => s.setFcAudioMarathon(!s.fcAudioMarathon)} />
          </Row>
          <Row label={`일일 학습 목표: ${s.fcDailyGoal === 0 ? '비활성' : `${s.fcDailyGoal}장`}`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={s.fcDailyGoal}
              onChange={(e) => s.setFcDailyGoal(Number(e.target.value))}
              className="w-32"
              aria-label="일일 학습 목표"
            />
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

      <section>
        <SectionHeader title="정보" />
        <div className="rounded-2xl border border-divider bg-surface divide-y divide-divider">
          <Link
            to="/about"
            className="flex items-center justify-between gap-3 px-4 py-3 text-fg hover:bg-primary-soft"
          >
            <span className="inline-flex items-center gap-2">
              <Info size={16} className="text-primary" aria-hidden />
              앱 정보 · SMCB 소개
            </span>
            <ChevronRight size={16} className="text-muted" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}

function TTSBulkCard(): JSX.Element {
  const status = useSettings((st) => st.ttsBulkStatus);
  const stored = useSettings((st) => st.ttsBulkProgress);
  const setStatus = useSettings((st) => st.setTTSBulkStatus);
  const setProgress = useSettings((st) => st.setTTSBulkProgress);

  const total = stored.total || getManifestSize();
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<{ done: number; failed: number; total: number }>({
    done: stored.done,
    failed: 0,
    total,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const start = async (): Promise<void> => {
    if (running) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setStatus('downloading');
    setLive({ done: 0, failed: 0, total: getManifestSize() });
    setProgress({ done: 0, total: getManifestSize() });
    const result = await bulkDownloadAll({
      signal: ac.signal,
      onProgress: (p) => {
        setLive(p);
        setProgress({ done: p.done, total: p.total });
      },
    });
    setRunning(false);
    if (result.aborted) setStatus('skipped');
    else if (result.failed === 0) setStatus('done');
    else setStatus('partial');
    setProgress({ done: result.done, total: result.total });
  };

  const stop = (): void => {
    abortRef.current?.abort();
  };

  const pct = total ? Math.floor((live.done / total) * 100) : 0;
  const doneCount = running ? live.done : stored.done;
  const failedCount = live.failed;

  return (
    <div className="mt-3 rounded-2xl border border-divider bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-fg inline-flex items-center gap-1.5">
          <Download size={16} aria-hidden /> 중국어 음성 미리 받기
        </p>
        <StatusBadge status={running ? 'downloading' : status} />
      </div>
      <p className="text-sm text-muted">
        약 <b>{total}</b>개 파일. 한 번 받아두면 인터넷 없이도 음성이 재생됩니다.
      </p>
      {(running || doneCount > 0) && (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={doneCount}
            className="w-full h-2 rounded-full bg-divider overflow-hidden"
          >
            <div
              className={cn(
                'h-full transition-[width] duration-300',
                status === 'done' ? 'bg-success' : 'bg-primary',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted inline-flex items-center gap-1.5">
            {running ? (
              <>
                <Loader2 size={14} aria-hidden className="animate-spin" />
                받는 중… {doneCount}/{total}
                {failedCount > 0 && ` (실패 ${failedCount})`}
              </>
            ) : status === 'done' ? (
              <>
                <CheckCircle2 size={14} aria-hidden className="text-success" />
                완료: {doneCount}/{total}
              </>
            ) : (
              <>
                {doneCount}/{total}
                {status === 'partial' && ' · 일부 실패 (재시도 가능)'}
              </>
            )}
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {running ? (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-divider text-fg text-sm font-semibold px-3 py-2"
          >
            중지
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-3 py-2"
          >
            <Download size={14} aria-hidden />
            {status === 'done' ? '다시 받기' : status === 'partial' ? '재시도' : '지금 받기'}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof useSettings.getState>['ttsBulkStatus'] }): JSX.Element | null {
  const map: Record<string, { label: string; cls: string }> = {
    idle: { label: '시작 전', cls: 'bg-divider text-muted' },
    downloading: { label: '받는 중', cls: 'bg-primary text-white' },
    done: { label: '완료', cls: 'bg-success text-white' },
    partial: { label: '일부 실패', cls: 'bg-accent text-white' },
    skipped: { label: '나중에', cls: 'bg-divider text-muted' },
  };
  const item = map[status];
  if (!item) return null;
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', item.cls)}>
      {item.label}
    </span>
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
