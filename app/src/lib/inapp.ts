export type InAppKind = 'kakao' | 'naver' | 'facebook' | 'instagram';

export type InAppInfo = { kind: InAppKind; label: string } | { kind: null; label: null };

export function isInAppBrowser(): InAppInfo {
  if (typeof navigator === 'undefined') return { kind: null, label: null };
  const ua = navigator.userAgent;
  // KakaoTalk — 최신 갤럭시 기기에서 KAKAOTALK 외 KAKAO 변형도 감지
  if (/KAKAOTALK|KAKAO/i.test(ua)) return { kind: 'kakao', label: '카카오톡' };
  if (/NAVER\(inapp/i.test(ua)) return { kind: 'naver', label: '네이버 앱' };
  if (/FBAN|FBAV/i.test(ua)) return { kind: 'facebook', label: 'Facebook' };
  if (/Instagram/i.test(ua)) return { kind: 'instagram', label: 'Instagram' };
  return { kind: null, label: null };
}
