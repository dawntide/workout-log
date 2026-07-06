// 로케일 쿠키 상수 — messages.ts(카탈로그 ~1,300줄)와 분리된 모듈.
// LocaleProvider(client)가 이 상수를 messages에서 값-import하면 카탈로그 전체가
// 모든 라우트의 eager 클라 번들에 끌려온다(F4 실측: 매니페스트 미등재여도
// 런타임 네트워크에선 매 라우트 로드 — #491의 매니페스트 검증법이 착시였음).
export const LOCALE_COOKIE_NAME = "workout-log.locale";
