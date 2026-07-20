/**
 * Font stylesheets loaded off the critical path.
 *
 * Shared by the `<head>` preload hints (server) and the runtime injector
 * (client) so the two can never drift: a preload whose URL does not match the
 * stylesheet request exactly is a wasted download, not an optimization.
 */
export const FONT_STYLESHEETS = [
  // PERF: Pretendard Variable (한글) — 자체 호스팅 CSS로 CDN DNS 왕복 제거.
  // 폰트 파일은 CDN에서 서빙하되, CSS 자체는 동일 도메인 → HTTP/2 멀티플렉싱 활용.
  "/fonts/pretendard-subset.css",
  // Material Symbols Outlined — variable 아이콘 폰트 (display=swap 포함).
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap",
] as const;
