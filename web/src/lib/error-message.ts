/**
 * unknown 에러에서 사용자에게 보여줄 메시지를 안전하게 추출.
 * catch 절의 `err?.message ?? fallback`(암시적 any) 패턴의 타입-안전 대체 —
 * `errorMessage(err) ?? fallback`으로 드롭인 치환된다(no-explicit-any 정리).
 */
export function errorMessage(e: unknown): string | null {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return null;
}
