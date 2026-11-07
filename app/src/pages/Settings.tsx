import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, RefreshCw, AlertTriangle, Info, ChevronRight, Download, Loader2, CheckCircle2, Upload, Save } from 'lucide-react';
import { useSettings, type Theme, type FontSize, type FlashcardGrades, type FlashcardDirection, type BlueLightLevel } from '@/stores/settings';
import type { SRSAlgorithm } from '@/stores/srs';
import { useProgress } from '@/stores/progress';
import { useFavorites } from '@/stores/favorites';
import { useSRS } from '@/stores/srs';
import { getStorageInfo, clearAllCaches, clearContentCaches, clearTTSAudioCache, type StorageInfo } from '@/lib/storage';
import { dbClearAll, dbExportAll, dbImportAll, type DbBackup } from '@/lib/db';
import { awaitVoices, isSupported, isIOS, isStandalonePWA } from '@/lib/tts';
import { bulkDownloadAll, getManifestSize } from '@/lib/ttsBulkDownload';
import { cn } from '@/lib/cn';
import SectionHeader from '@/components/SectionHeader';

export default function Settings(): JSX.Element {
  const s = useSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = (text: string): void => {
    setToast(text);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  };

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

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

  const onExportBackup = async (): Promise<void> => {
    try {
      const backup = await dbExportAll();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `smcb-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg({ text: '백업 파일을 저장했습니다. 안전한 곳에 보관해 주세요.' });
    } catch {
      setBackupMsg({ text: '백업 파일을 만들지 못했습니다.', error: true });
    }
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('백업 파일의 내용으로 현재 학습 기록을 덮어씁니다. 계속하시겠습니까?')) return;
    try {
      const backup = JSON.parse(await file.text()) as DbBackup;
      const n = await dbImportAll(backup);
      setBackupMsg({ text: `${n}개 항목을 복원했습니다. 잠시 후 앱을 새로 불러옵니다…` });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      const reason = err instanceof Error ? err.message : '파일을 읽을 수 없습니다.';
      setBackupMsg({ text: `복원 실패: ${reason}`, error: true });
    }
  };

  const onClearAll = async (): Promise<void> => {
    if (!confirm('모든 캐시와 학습 진도/즐겨찾기/플래시카드 데이터가 삭제됩니다. 계속하시겠습니까?')) return;
    await clearAllCaches();
    await dbClearAll();
    useProgress.setState({ byId: {}, lastLessonId: null });
    useFavorites.setState({ items: {} });
    useSRS.setState({ cards: {}, reviewsByDate: {} });
    setMsg('모든 데이터가 초기화되었습니다.');
    refreshStorage();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-fg">설정</h1>

      <section>
        <SectionHeader title="화면" />
        <div className="rounded-2xl border border-divider bg-surface divide-y divide-divider">
          <Row
            label="테마"
            description="라이트는 흰 배경, 다크는 검은 배경, 세피아는 따뜻한 종이색, 웜다크는 포근한 어두운색, 시스템은 단말기 설정을 따라요."
            stack
          >
            <Segmented
              value={s.theme}
              options={[
                { v: 'light', l: '라이트' },
                { v: 'dark', l: '다크' },
                { v: 'sepia', l: '세피아' },
                { v: 'warmdark', l: '웜다크' },
                { v: 'system', l: '시스템' },
              ]}
              onChange={(v) => {
                s.setTheme(v as Theme);
                showToast(
                  v === 'light' ? '밝은 흰 배경으로 바꿨어요.'
                  : v === 'dark' ? '어두운 검은 배경으로 바꿨어요.'
                  : v === 'sepia' ? '따뜻한 종이색 배경으로 바꿨어요.'
                  : v === 'warmdark' ? '포근한 어두운 배경으로 바꿨어요.'
                  : '단말기 설정에 따라 밝기가 자동으로 바뀌어요.',
                );
              }}
            />
          </Row>
          <Row label="글자 크기" description="본문 전체의 글자 크기예요." stack>
            <Segmented
              value={s.fontSize}
              options={[
                { v: 'md', l: '보통' },
                { v: 'lg', l: '크게' },
                { v: 'xl', l: '아주 크게' },
              ]}
              onChange={(v) => {
                s.setFontSize(v as FontSize);
                showToast(
                  v === 'md' ? '글자 크기를 보통으로 맞췄어요.'
                  : v === 'lg' ? '글자 크기를 크게 키웠어요.'
                  : '글자 크기를 아주 크게 키웠어요.',
                );
              }}
            />
          </Row>
          <Row label="한자 표시" description="예문의 한자(中文)를 보여줄지 결정합니다.">
            <Toggle
              on={s.showHanzi}
              onClick={() => {
                s.toggleHanzi();
                showToast(s.showHanzi ? '한자(中文)를 화면에서 숨겼어요.' : '본문·예문에 한자(中文)를 다시 표시해요.');
              }}
            />
          </Row>
          <Row label="병음 표시" description="한자 발음(pīnyīn)을 보여줍니다.">
            <Toggle
              on={s.showPinyin}
              onClick={() => {
                s.togglePinyin();
                showToast(s.showPinyin ? '한자 발음(병음)을 화면에서 숨겼어요.' : '한자 발음(병음)을 다시 표시해요.');
              }}
            />
          </Row>
          <Row
            label="글자별 병음"
            description="한자 한 글자 위에 작게 발음을 표시합니다. 끄면 한 줄로 모아 보여줘요."
          >
            <Toggle
              on={s.rubyPinyin}
              onClick={() => {
                s.toggleRubyPinyin();
                showToast(s.rubyPinyin ? '병음을 한 줄로 모아 표시해요.' : '병음을 한자 글자 위에 표시해요.');
              }}
            />
          </Row>
          <Row
            label="의미단위 표시"
            description="화면의 글자에만 / 로 의미 단위를 표시해요. 예) 我是 / 韩国人。 음성은 표시와 상관없이 문장 전체를 재생해요."
          >
            <Toggle
              on={s.chunkLevel === 'on'}
              onClick={() => {
                s.setChunkLevel(s.chunkLevel === 'on' ? 'off' : 'on');
                showToast(s.chunkLevel === 'on' ? '의미단위 표시를 껐어요.' : '의미 단위마다 / 를 표시해요.');
              }}
            />
          </Row>
          <Row label="한국어 표시" description="한국어 뜻을 함께 보여줍니다.">
            <Toggle
              on={s.showKorean}
              onClick={() => {
                s.toggleKorean();
                showToast(s.showKorean ? '한국어 뜻을 화면에서 숨겼어요.' : '한국어 뜻을 다시 표시해요.');
              }}
            />
          </Row>
          <Row
            label="청색광 차단"
            description="화면 전체에 따뜻한 색을 덧입혀 파란빛을 줄여요. 단계가 높을수록 더 따뜻해지고 눈부심이 줄어요. 모든 테마에 적용돼요."
            stack
          >
            <Segmented
              value={String(s.blueLight)}
              options={[
                { v: '0', l: '끄기' },
                { v: '1', l: '약하게' },
                { v: '2', l: '보통' },
                { v: '3', l: '강하게' },
              ]}
              onChange={(v) => {
                const level = Number(v) as BlueLightLevel;
                s.setBlueLight(level);
                showToast(
                  level === 0 ? '청색광 차단을 껐어요. 화면 색이 원래대로 돌아와요.'
                  : level === 1 ? '청색광 차단을 약하게 켰어요.'
                  : level === 2 ? '청색광 차단을 보통으로 켰어요.'
                  : '청색광 차단을 강하게 켰어요. 화면이 가장 따뜻해져요.',
                );
              }}
            />
          </Row>
        </div>
      </section>

      <section>
        <SectionHeader
          title="음성 재생 방식"
          subtitle="기기에 설치된 음성을 쓸지, 미리 녹음된 음성을 받아 쓸지 고를 수 있어요."
        />
        <div className="rounded-2xl border border-divider bg-surface divide-y divide-divider">
          <Row
            label="재생 방식"
            description="기기 음성은 단말기 음성팩을, 녹음 음성은 미리 녹음된 mp3를 사용합니다. 잘 모르겠으면 '녹음 음성'을 권해요."
            stack
          >
            <Segmented
              value={s.userMode ?? 'recorded'}
              options={[
                { v: 'device', l: '기기 음성' },
                { v: 'recorded', l: '녹음 음성' },
              ]}
              onChange={(v) => {
                // Segmented 옵션은 'device'|'recorded'만 노출되므로 narrow 가능.
                // UserMode는 null도 포함하지만 사용자가 null로 되돌리는 UI 없음.
                if (v === 'device' || v === 'recorded') {
                  s.setUserMode(v);
                  showToast(
                    v === 'device'
                      ? '기기에 설치된 음성으로 읽어줘요. 음성팩이 필요해요.'
                      : '미리 녹음된 음성으로 읽어줘요. 음성팩 없이도 들려요.',
                  );
                }
              }}
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
              onChange={(e) => {
                const rate = Number(e.target.value);
                s.setTTSRate(rate);
                showToast(
                  rate === 1
                    ? '음성 속도를 기본(1.00×)으로 맞췄어요.'
                    : `음성 속도를 ${rate.toFixed(2)}×로 맞췄어요. (${rate < 1 ? '느리게' : '빠르게'})`,
                );
              }}
              className="w-40"
              aria-label="음성 속도"
            />
          </Row>
          <Row label="음성 선택">
            {voices.length > 0 ? (
              <select
                value={s.ttsVoiceURI ?? ''}
                onChange={(e) => {
                  s.setTTSVoiceURI(e.target.value || null);
                  showToast(
                    e.target.value
                      ? '선택한 음성으로 읽어줘요.'
                      : '음성을 자동 선택으로 맞췄어요.',
                  );
                }}
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
        <SectionHeader title="플래시카드" subtitle="복습 알고리즘과 채점 방식을 조절합니다." />
        <div className="rounded-2xl border border-divider bg-surface divide-y divide-divider">
          <Row
            label="채점 단계"
            description="2단계는 '모름·알아요' 두 버튼, 4단계는 '모름·어려움·알아요·쉬움' 네 버튼으로 더 정교하게 채점해요."
            stack
          >
            <Segmented
              value={String(s.fcGrades)}
              options={[
                { v: '2', l: '2단계' },
                { v: '4', l: '4단계' },
              ]}
              onChange={(v) => {
                s.setFcGrades(Number(v) as FlashcardGrades);
                showToast(
                  v === '2'
                    ? '채점 버튼을 2단계(모름·알아요)로 바꿨어요.'
                    : '채점 버튼을 4단계(모름·어려움·알아요·쉬움)로 바꿨어요.',
                );
              }}
            />
          </Row>
          <Row
            label="알고리즘"
            description="복습 간격을 정하는 방식이에요. Leitner는 간단·고정 간격, SM-2는 답한 난이도에 따라 간격이 늘어나고 줄어요."
            stack
          >
            <Segmented
              value={s.fcAlgorithm}
              options={[
                { v: 'leitner', l: 'Leitner' },
                { v: 'sm2', l: 'SM-2' },
              ]}
              onChange={(v) => {
                s.setFcAlgorithm(v as SRSAlgorithm);
                showToast(
                  v === 'leitner'
                    ? '복습 간격을 Leitner(고정 간격) 방식으로 바꿨어요.'
                    : '복습 간격을 SM-2(난이도 반영) 방식으로 바꿨어요.',
                );
              }}
            />
          </Row>
          <Row
            label="문제 방향(기본)"
            description="中→韓: 한자 보고 뜻 맞히기 · 韓→中: 뜻 보고 한자 떠올리기 · 혼합: 둘을 섞어서 출제."
            stack
          >
            <Segmented
              value={s.fcDirection}
              options={[
                { v: 'zh2ko', l: '中→韓' },
                { v: 'ko2zh', l: '韓→中' },
                { v: 'mixed', l: '혼합' },
              ]}
              onChange={(v) => {
                s.setFcDirection(v as FlashcardDirection);
                showToast(
                  v === 'zh2ko' ? '한자를 보고 뜻을 맞히는 방향으로 출제해요.'
                  : v === 'ko2zh' ? '뜻을 보고 한자를 떠올리는 방향으로 출제해요.'
                  : '두 방향을 섞어서 출제해요.',
                );
              }}
            />
          </Row>
          <Row
            label="카드 종류 (기본)"
            description="플래시카드 풀에 넣을 자료 종류를 고르세요. 학습 시작 화면에서 다시 변경할 수 있어요."
            stack
          >
            <div className="flex flex-wrap gap-1.5">
              {(['vocab', 'example', 'verse', 'dialog', 'scenario'] as const).map((k) => {
                const label =
                  k === 'vocab' ? '단어' :
                  k === 'example' ? '예문' :
                  k === 'verse' ? '구절' :
                  k === 'dialog' ? '회화' : '시나리오';
                const on = s.fcCardTypes[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      s.setFcCardTypes({ ...s.fcCardTypes, [k]: !on });
                      showToast(
                        on
                          ? `${label} 카드를 학습에서 뺐어요.`
                          : `${label} 카드를 학습에 넣었어요.`,
                      );
                    }}
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
          <Row
            label="자동 음성 재생"
            description="카드가 바뀌면 자동으로 중국어 음성이 한 번 재생돼요."
          >
            <Toggle
              on={s.fcAutoplay}
              onClick={() => {
                s.setFcAutoplay(!s.fcAutoplay);
                showToast(
                  s.fcAutoplay
                    ? '자동 음성 재생을 껐어요.'
                    : '카드가 바뀌면 음성이 자동으로 재생돼요.',
                );
              }}
            />
          </Row>
          <Row
            label="듣기 테스트에 발음표 단음절 포함"
            description="듣기 테스트 모드에서 한 글자(단음절) 발음 카드도 함께 출제해요."
          >
            <Toggle
              on={s.fcPronInPairs}
              onClick={() => {
                s.setFcPronInPairs(!s.fcPronInPairs);
                showToast(
                  s.fcPronInPairs
                    ? '듣기 테스트에서 한 글자(단음절) 발음 카드를 뺐어요.'
                    : '듣기 테스트에 한 글자(단음절) 발음 카드도 함께 출제해요.',
                );
              }}
            />
          </Row>
          <Row
            label="부록1 기독교 용어 학습 포함"
            description="예수·하나님 같은 부록1의 기독교 핵심 용어 80여 개를 학습 풀에 넣어요."
          >
            <Toggle
              on={s.fcAppendixVocab}
              onClick={() => {
                s.setFcAppendixVocab(!s.fcAppendixVocab);
                showToast(
                  s.fcAppendixVocab
                    ? '부록1 기독교 용어를 학습에서 뺐어요.'
                    : '부록1 기독교 용어 80여 개를 학습에 넣었어요.',
                );
              }}
            />
          </Row>
        </div>
      </section>

      <section>
        <SectionHeader
          title="학습 진행상황 백업"
          subtitle="진도·즐겨찾기·플래시카드 기록을 파일로 저장하거나, 새 기기·재설치 후 복원할 수 있어요."
        />
        <div className="rounded-2xl border border-divider bg-surface p-4 space-y-3">
          <p className="text-sm text-muted leading-snug">
            기기를 바꾸거나 앱을 다시 설치하면 학습 기록이 사라질 수 있습니다.
            가끔 백업 파일을 저장해 두면 안전합니다.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => void onImportFile(e)}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onExportBackup()}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-3 py-2"
            >
              <Save size={14} aria-hidden /> 백업 파일 저장
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-divider text-fg text-sm font-semibold px-3 py-2"
            >
              <Upload size={14} aria-hidden /> 백업에서 복원
            </button>
          </div>
          {backupMsg && (
            <p className={cn('text-sm pt-1', backupMsg.error ? 'text-accent' : 'text-success')}>
              {backupMsg.text}
            </p>
          )}
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

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none"
        >
          <p className="max-w-sm rounded-full bg-primary text-white text-sm font-semibold px-4 py-2 shadow-lg text-center">
            {toast}
          </p>
        </div>
      )}
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
  const [removing, setRemoving] = useState(false);
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

  const remove = async (): Promise<void> => {
    if (!confirm('받아둔 중국어 음성을 삭제하시겠어요?\n오프라인 재생이 불가해지며, 다시 들으려면 약 20~40MB를 새로 받아야 합니다.')) return;
    setRemoving(true);
    try {
      await clearTTSAudioCache();
      setStatus('idle');
      setProgress({ done: 0, total: 0 });
      setLive({ done: 0, failed: 0, total: getManifestSize() });
    } finally {
      setRemoving(false);
    }
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
            disabled={removing}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-3 py-2',
              removing && 'opacity-50',
            )}
          >
            <Download size={14} aria-hidden />
            {status === 'done' ? '다시 받기' : status === 'partial' ? '재시도' : '지금 받기'}
          </button>
        )}
        {!running && (status === 'done' || status === 'partial') && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={removing}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-surface border border-divider text-fg text-sm font-semibold px-3 py-2',
              removing && 'opacity-50',
            )}
            aria-label="받아둔 중국어 음성 삭제"
          >
            <Trash2 size={14} aria-hidden /> {removing ? '삭제 중…' : '삭제'}
          </button>
        )}
      </div>
      {!running && (status === 'done' || status === 'partial') && (
        <p className="text-xs text-muted leading-snug pt-1">
          용량이 부족하면 받아둔 음성을 지울 수 있어요. 삭제 후에도 인터넷에 연결된 상태라면 들을 때마다 음성이 다시 받아집니다.
        </p>
      )}
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

function Row({
  label,
  description,
  children,
  stack,
}: {
  label: string;
  /** 어르신 친화적인 보조 설명. 라벨 아래 작은 회색 텍스트로 표시. */
  description?: string;
  children: React.ReactNode;
  /** true면 좁은 화면(< sm)에서 컨트롤이 라벨 아래로 떨어진다. 칩이 여러 개라 옆에 두면 라벨이 깨질 때 사용. */
  stack?: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        'gap-3 px-4 py-3',
        stack
          ? 'flex flex-col sm:flex-row sm:items-center sm:justify-between'
          : 'flex items-center justify-between',
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="text-fg">{label}</span>
        {description && <p className="text-xs text-muted mt-0.5 leading-snug">{description}</p>}
      </div>
      <div className={stack ? 'w-full sm:w-auto' : 'shrink-0'}>{children}</div>
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
    <div className="inline-flex flex-wrap gap-y-0.5 rounded-3xl border border-divider bg-bg p-0.5">
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
