// 세션 sliding 만료 정책 — DB I/O 무의존 순수 모듈(session.ts가 사용, 정책은 유닛 테스트로 검증).
//
// - IDLE_TTL: 활동이 없으면 만료되는 창. 활동(findActiveSession)마다 now+IDLE_TTL로 갱신된다.
// - ABSOLUTE_MAX: createdAt 기준 하드 상한. 계속 활동해도 이 이상은 못 산다(무한 세션 방지).
//   쿠키 expires도 이 값으로 설정해 sliding DB 세션(IDLE_TTL 창)보다 오래 살게 한다 —
//   브라우저가 토큰을 계속 보내고, 실제 만료 게이트는 DB expiresAt다(미들웨어 재설정 불요).
// - REFRESH_INTERVAL: 매 요청 DB write를 막는 스로틀. expiresAt가 이 값 이상 낡았을 때만 갱신
//   → 활동 세션당 하루 1회 이하 write.
export const SESSION_IDLE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const SESSION_ABSOLUTE_MAX_MS = 1000 * 60 * 60 * 24 * 180; // 180 days
export const SESSION_REFRESH_INTERVAL_MS = 1000 * 60 * 60 * 24; // 1 day

/**
 * 슬라이딩 갱신 목표 만료시각을 계산한다(갱신 불필요 시 null).
 * desired = min(now+IDLE_TTL, createdAt+ABSOLUTE_MAX). 현재 expiresAt보다 REFRESH_INTERVAL
 * 이상 커질 때만 갱신(그 외엔 write 생략 = 매 요청 write 방지 + 절대 상한 도달 시 정지).
 */
export function computeSlideTarget(
  nowMs: number,
  expiresAtMs: number,
  createdAtMs: number,
): Date | null {
  const desired = Math.min(
    nowMs + SESSION_IDLE_TTL_MS,
    createdAtMs + SESSION_ABSOLUTE_MAX_MS,
  );
  if (desired - expiresAtMs >= SESSION_REFRESH_INTERVAL_MS) return new Date(desired);
  return null;
}
