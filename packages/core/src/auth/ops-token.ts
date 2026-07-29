/**
 * ops(인프라) 엔드포인트의 Bearer 시크릿 게이트 — web·apps/api 공용.
 *
 * ops 라우트는 사용자 스코프가 아니고 파괴적이며(만료 세션 삭제) 공개 주소에서
 * 닿는다. 그래서 **fail-closed**다: 시크릿이 하나도 설정돼 있지 않으면 열어두는
 * 게 아니라 막는다. 로컬에서 토큰 없이 쓰고 싶으면 `WORKOUT_OPS_ALLOW_NO_TOKEN=1`로
 * 명시적으로 opt-in한다.
 *
 * 시크릿이 둘인 이유: Vercel Cron은 자기가 부를 때 `CRON_SECRET`을 Bearer로 보내고
 * (그 외 값을 넣을 방법이 없다), systemd 타이머·`ilapi prune`·수동 호출은
 * `WORKOUT_OPS_TOKEN`을 쓴다. 스케줄러를 Vercel로 옮기는 동안 둘 다 살아 있어야 해서
 * 양쪽을 받는다.
 */

export type OpsTokenSource = "ops-token" | "cron-secret";

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

function bearer(authorizationHeader: string | null | undefined): string {
  const header = (authorizationHeader ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

/**
 * 요청이 ops 시크릿을 제시했는지 검사한다.
 *
 * @param authorizationHeader 원본 Authorization 헤더 값
 * @param accept 허용할 시크릿 종류. 기본은 `WORKOUT_OPS_TOKEN`만 —
 *   `CRON_SECRET`은 Vercel Cron이 부르는 라우트에서만 명시적으로 켠다.
 */
export function opsTokenAuthorized(
  authorizationHeader: string | null | undefined,
  accept: readonly OpsTokenSource[] = ["ops-token"],
): boolean {
  const expected = accept
    .map((source) => (source === "cron-secret" ? readEnv("CRON_SECRET") : readEnv("WORKOUT_OPS_TOKEN")))
    .filter(Boolean);

  // 설정된 시크릿이 하나도 없다 → 명시적 opt-in이 없는 한 거부(fail-closed).
  if (expected.length === 0) {
    return readEnv("WORKOUT_OPS_ALLOW_NO_TOKEN") === "1";
  }

  const provided = bearer(authorizationHeader);
  if (!provided) return false;
  return expected.includes(provided);
}
