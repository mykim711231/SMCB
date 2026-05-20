import { QRCodeSVG } from 'qrcode.react';
import { X, Camera } from 'lucide-react';

/**
 * QR 코드 초청 모달.
 *   - 다른 사람이 휴대폰 카메라로 QR을 비추면 설치 페이지가 열린다.
 *   - 어르신도 이해할 수 있도록 큰 QR + 큰 글씨 + 번호 단계 안내로 구성.
 *   - QR은 카메라가 인식해야 하므로 다크모드와 무관하게 항상 흰 배경/검은 모듈.
 *   - 카카오톡 우회 쿼리(?openExternalBrowser)는 붙이지 않는다 — QR 스캐너는
 *     기기의 기본 브라우저로 바로 열기 때문에 인앱 브라우저 문제가 없다.
 */
export default function InviteQrModal({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-qr-title"
      onClick={onClose}
    >
      <div
        className="bg-bg rounded-2xl max-w-md w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3
            id="invite-qr-title"
            className="text-xl font-bold text-fg inline-flex items-center gap-2"
          >
            <Camera size={22} aria-hidden />
            QR 코드로 초청하기
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted hover:text-fg p-1"
          >
            <X size={24} aria-hidden />
          </button>
        </div>

        <p className="text-base text-fg font-semibold">
          휴대폰 카메라로 아래 그림을 비추면 설치 화면이 열려요.
        </p>

        {/* QR — 스캐너 인식을 위해 항상 흰 배경/검은 모듈 고정 */}
        <div className="mt-4 flex justify-center">
          <div className="bg-white rounded-2xl p-4 border border-divider">
            <QRCodeSVG
              value={url}
              size={224}
              level="M"
              marginSize={2}
              bgColor="#FFFFFF"
              fgColor="#000000"
              title="중국어 성경반 앱 설치 주소"
            />
          </div>
        </div>

        <ol className="mt-5 space-y-3 text-base text-fg">
          <li className="flex gap-3">
            <span className="flex-none w-7 h-7 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">
              1
            </span>
            <span>상대방 휴대폰의 <b>카메라 앱</b>을 켭니다.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-none w-7 h-7 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">
              2
            </span>
            <span>카메라로 위의 <b>QR 그림</b>을 비춥니다.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-none w-7 h-7 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">
              3
            </span>
            <span>화면에 뜨는 <b>주소(링크)</b>를 누르면 설치 화면이 열립니다.</span>
          </li>
        </ol>

        <div className="mt-4 pt-3 border-t border-divider">
          <p className="text-sm text-muted">QR이 잘 안 되면 이 주소를 직접 알려 주세요</p>
          <p className="text-sm text-fg font-medium break-all mt-1 select-all">{url}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 rounded-full bg-primary text-white text-base font-semibold py-3"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
