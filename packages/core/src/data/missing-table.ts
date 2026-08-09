/**
 * Postgres `42P01`(undefined_table) 판별.
 *
 * 보존 정리 작업들은 마이그레이션 전 DB(신규 클론·일부 CI 잡)에서도 호출될 수 있다.
 * 그 경우는 실패가 아니라 **무작업**이어야 하므로, 이 에러만 골라 삼킨다.
 * drizzle이 원 에러를 감싸는 경우가 있어 `cause` 한 겹까지 본다.
 */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const errorRecord = error as Record<string, unknown>;
  if (errorRecord.code === "42P01") return true;
  const cause = errorRecord.cause;
  if (!cause || typeof cause !== "object") return false;
  return (cause as Record<string, unknown>).code === "42P01";
}
