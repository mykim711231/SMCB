import { ExternalLink, MessageCircle } from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';

export default function About(): JSX.Element {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-fg">안내</h1>

      <section className="rounded-2xl border border-divider bg-surface p-4 sm:p-5">
        <h2 className="font-bold text-fg mb-2">콘텐츠 출처 및 이용 안내</h2>
        <p className="text-sm text-fg/90 leading-relaxed">
          본 애플리케이션에서 제공하는 성경 연구 자료 및 교재 콘텐츠의 저작권은{' '}
          <strong>새문안교회 중국어 성경반(중급)</strong>에 있습니다.
          본 콘텐츠는 성경반 회원들의 학습 목적을 위해 제공되며, 무단 복제 및 상업적 이용을 금합니다.
        </p>
      </section>

      <section>
        <SectionHeader title="공지 / 채널" subtitle="알림은 카카오톡 채널을 통해 안내드립니다." />
        <a
          href="https://pf.kakao.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 rounded-2xl border border-divider bg-surface p-4 text-fg"
        >
          <span className="flex items-center gap-2">
            <MessageCircle size={18} className="text-accent" aria-hidden />
            <span className="font-semibold">카카오톡 채널</span>
          </span>
          <ExternalLink size={16} className="text-muted" aria-hidden />
        </a>
        <p className="text-xs text-muted mt-2">
          채널 주소가 안내되면 위 링크가 실제 채널로 연결됩니다.
        </p>
      </section>

      <section>
        <SectionHeader title="설치 안내" />
        <div className="rounded-2xl border border-divider bg-surface p-4 space-y-3 text-sm text-fg">
          {isIOS && (
            <div>
              <p className="font-semibold">iPhone / iPad (Safari)</p>
              <ol className="list-decimal pl-5 mt-1 space-y-1 text-fg/90">
                <li>Safari 하단의 <strong>공유</strong> 버튼을 탭하세요.</li>
                <li><strong>홈 화면에 추가</strong>를 선택하세요.</li>
                <li>이름을 확인하고 <strong>추가</strong>를 탭하세요.</li>
              </ol>
            </div>
          )}
          {isAndroid && (
            <div>
              <p className="font-semibold">Android (Chrome)</p>
              <ol className="list-decimal pl-5 mt-1 space-y-1 text-fg/90">
                <li>Chrome 우측 상단의 <strong>⋮</strong> 메뉴를 여세요.</li>
                <li><strong>홈 화면에 추가</strong> 또는 <strong>앱 설치</strong>를 선택하세요.</li>
              </ol>
            </div>
          )}
          {!isIOS && !isAndroid && (
            <p className="text-fg/90">
              데스크톱 브라우저에서는 주소창의 설치 아이콘 또는{' '}
              <strong>···</strong> 메뉴의 <strong>앱 설치</strong>를 선택하세요.
            </p>
          )}
        </div>
      </section>

      <section>
        <SectionHeader title="앱 정보" />
        <div className="rounded-2xl border border-divider bg-surface p-4 text-sm space-y-1 text-fg/90">
          <p>· 65과 본문 + 어휘 + 발음 + 어법 + 성경 인용 + 회화 + 상황 + 질문</p>
          <p>· 단말기 내장 TTS (Web Speech API)</p>
          <p>· 한자 / 병음 / 한국어 토글, 큰글씨 모드</p>
          <p>· 전체 텍스트 검색 · 단어 플래시카드 (라이트너 5박스)</p>
          <p>· 오프라인 학습 지원 (PWA), 분석 도구 미사용</p>
        </div>
      </section>
    </div>
  );
}
