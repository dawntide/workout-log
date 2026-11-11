/**
 * 클라이언트로 내보내도 되는 오류 문구인지 가른다.
 *
 * 서비스 계층은 사용자에게 보여줄 현지화 문구를 예외 메시지로 던지고, API 응답 헬퍼가 그
 * 메시지를 그대로 본문에 싣는다. 그 통로로 DB·네트워크 계층의 예외까지 나가면 SQL 문장과
 * 파라미터(drizzle `DrizzleQueryError`의 "Failed query: ... params: ..."), 접속 호스트
 * 같은 내부 정보가 응답에 실린다. 그런 예외만 골라 고정 문구로 바꾼다 — 전부 가리면
 * 정상적인 사용자 안내가 사라진다.
 */

const INTERNAL_ERROR_NAMES = new Set(["DrizzleQueryError", "DrizzleError", "DatabaseError"]);

const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
]);

/** PostgreSQL SQLSTATE: 영숫자 5자리(예: 23505, 42P01, 57P01). */
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

const MAX_CAUSE_DEPTH = 5;

function looksInternal(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: unknown; message?: unknown; code?: unknown; severity?: unknown };

  if (typeof record.name === "string" && INTERNAL_ERROR_NAMES.has(record.name)) return true;
  if (typeof record.message === "string" && record.message.startsWith("Failed query:")) return true;
  if (typeof record.code === "string") {
    if (NETWORK_ERROR_CODES.has(record.code)) return true;
    // node-postgres DatabaseError: SQLSTATE code와 severity가 함께 온다.
    if (SQLSTATE_PATTERN.test(record.code) && typeof record.severity === "string") return true;
  }
  return false;
}

/** 예외 자신이나 `cause` 사슬 어딘가가 DB·네트워크 계층에서 왔으면 true. */
export function isInternalError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current; depth += 1) {
    if (looksInternal(current)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** 응답 본문에 실을 문구. 내부 예외와 Error가 아닌 값은 `fallback`으로 바꾼다. */
export function clientErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (isInternalError(error)) return fallback;
  return error.message;
}
