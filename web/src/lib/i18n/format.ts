/**
 * 파라미터화 카피 포매터 — `{key}` 플레이스홀더 치환.
 *
 * messages.ts(전 로케일 카탈로그 ~1,300줄)와 분리된 모듈이다: 클라이언트
 * 컴포넌트가 formatCopy만 필요할 때 카탈로그 전체가 eager 클라 번들로 끌려오지
 * 않게 한다(F4 — 카탈로그는 LocaleProvider 로케일 전환 시 async 청크로만 로드).
 *
 * AppCopy는 전부 JSON-직렬화 가능한 문자열이어야 한다: 함수형 카피는 RSC
 * 서버→클라 prop 직렬화를 깨뜨려 홈 SSR 크래시를 냈다(2026-07-03 #491/#493
 * 인시던트). 파라미터가 필요한 카피는 `"{days}일 연속"` 같은 템플릿 문자열로
 * 정의하고 이 함수로 치환한다. 직렬화 가드는 messages.serializable.test.ts.
 */
export function formatCopy(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}
