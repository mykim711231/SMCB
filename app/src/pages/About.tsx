import { Monitor } from 'lucide-react';
import AppleLogo from '@/components/AppleLogo';
import AndroidLogo from '@/components/AndroidLogo';
import SectionHeader from '@/components/SectionHeader';

export default function About(): JSX.Element {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-fg">안내</h1>

      <section className="rounded-2xl border border-divider bg-surface p-4 sm:p-5">
        <h2 className="font-bold text-fg mb-3">SMCB란?</h2>
        <p className="text-sm text-fg/90 mb-3">
          <strong>SMCB</strong>는 <strong>새문안교회 중국어 성경반(중급)</strong>의 영문 약자입니다.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="font-bold text-accent">S</dt>
          <dd className="text-fg/90"><span className="font-semibold">Saemoonan</span> · 새문안</dd>
          <dt className="font-bold text-accent">M</dt>
          <dd className="text-fg/90"><span className="font-semibold">Middle</span> · 중급</dd>
          <dt className="font-bold text-accent">C</dt>
          <dd className="text-fg/90"><span className="font-semibold">Chinese</span> · 중국어</dd>
          <dt className="font-bold text-accent">B</dt>
          <dd className="text-fg/90"><span className="font-semibold">Bible</span> · 성경반</dd>
        </dl>
      </section>

      <section className="rounded-2xl border border-divider bg-surface p-4 sm:p-5">
        <h2 className="font-bold text-fg mb-2">콘텐츠 출처 및 이용 안내</h2>
        <p className="text-sm text-fg/90 leading-relaxed">
          본 애플리케이션에서 제공하는 성경 연구 자료 및 교재 콘텐츠의 저작권은{' '}
          <strong>새문안교회 중국어 성경반(중급)</strong>에 있습니다.
          본 콘텐츠는 성경반 회원들의 학습 목적을 위해 제공되며, 무단 복제 및 상업적 이용을 금합니다.
        </p>
      </section>

      <section>
        <SectionHeader title="설치 안내" />
        <div className="rounded-2xl border border-divider bg-surface p-4 space-y-3 text-sm text-fg">
          {isIOS && (
            <div>
              <p className="font-semibold inline-flex items-center gap-1.5">
                <AppleLogo size={14} /> iPhone / iPad (Safari)
              </p>
              <ol className="list-decimal pl-5 mt-1 space-y-1 text-fg/90">
                <li>Safari 하단의 <strong>공유</strong> 버튼을 탭하세요.</li>
                <li><strong>홈 화면에 추가</strong>를 선택하세요.</li>
                <li>이름을 확인하고 <strong>추가</strong>를 탭하세요.</li>
              </ol>
            </div>
          )}
          {isAndroid && (
            <div>
              <p className="font-semibold inline-flex items-center gap-1.5">
                <AndroidLogo size={16} /> Android (Chrome)
              </p>
              <ol className="list-decimal pl-5 mt-1 space-y-1 text-fg/90">
                <li>Chrome 우측 상단의 <strong>⋮</strong> 메뉴를 여세요.</li>
                <li><strong>홈 화면에 추가</strong> 또는 <strong>앱 설치</strong>를 선택하세요.</li>
              </ol>
            </div>
          )}
          {!isIOS && !isAndroid && (
            <p className="text-fg/90 inline-flex items-center gap-1.5">
              <Monitor size={16} aria-hidden />
              <span>
                데스크톱 브라우저에서는 주소창의 설치 아이콘 또는{' '}
                <strong>···</strong> 메뉴의 <strong>앱 설치</strong>를 선택하세요.
              </span>
            </p>
          )}
        </div>
      </section>

      <section>
        <SectionHeader title="앱 정보" />
        <div className="rounded-2xl border border-divider bg-surface p-4 text-sm space-y-1 text-fg/90">
          <p>· 앱 버전 {__APP_VERSION__}</p>
          <p>· 65과 본문 + 어휘 + 발음 + 어법 + 성경 인용 + 회화 + 상황 + 질문</p>
          <p>· 미리 녹음된 발음 약 3,500개(mp3), 단말기 내장 음성은 보조용</p>
          <p>· 학습 모드: 플래시카드 · 4지선다 · 문장 조립 · 이어듣기 · 단계 듣기</p>
          <p>· 플래시카드 5종(단어·예문·구절·회화·시나리오), 복습 알고리즘 Leitner·SM-2</p>
          <p>· 전체 텍스트 검색, 학습 진도 백업·복원</p>
          <p>· 한자 / 병음 / 한국어 표시 토글, 큰글씨 · 다크 모드</p>
          <p>· 오프라인 학습 지원 (PWA), 분석 도구 미사용</p>
        </div>
      </section>

      <section>
        <SectionHeader title="만든 사람 · 문의" />
        <div className="rounded-2xl border border-divider bg-surface p-4 text-sm space-y-1 text-fg/90">
          <p>· 새문안교회 중국어 성경반(중급)을 위해 제작했습니다.</p>
          <p>
            · 앱이 잘 안 될 때나 의견이 있으시면 아래로 알려 주세요 ·{' '}
            <a
              href="mailto:gababayo@gmail.com"
              className="text-primary font-semibold underline break-all"
            >
              gababayo@gmail.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
