import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

/**
 * lazy 청크 로드 실패를 잡는 에러 경계.
 *
 * React의 <Suspense>는 로딩 상태만 처리하고 import() reject(예외)는 잡지 못한다.
 * 경계가 없으면 오프라인에서 캐시되지 않은 route 청크 로드 실패 시 예외가
 * 트리 최상단까지 전파되어 전체 언마운트 → 흰 화면이 된다.
 * 이 경계는 그 대신 "다운로드되지 않음" 안내 + 다시 시도 버튼을 보여준다.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 진단용 — 청크 로드 실패 여부 확인에 도움
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
        <p className="text-base font-medium text-fg">이 페이지를 열 수 없습니다</p>
        <p className="text-sm text-muted">
          아직 기기에 다운로드되지 않은 화면입니다.
          <br />
          인터넷에 연결한 뒤 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-primary text-white text-sm font-bold px-6 py-2"
        >
          다시 시도
        </button>
      </div>
    );
  }
}
