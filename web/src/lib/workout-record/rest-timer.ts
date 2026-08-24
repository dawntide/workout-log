/**
 * 휴식 타이머 순수 로직 — DOM·React 무지.
 *
 * 핵심 계약: **경과 시간은 항상 타임스탬프 차이로 파생한다.** setInterval은 리렌더만
 * 유발하고 값을 누적하지 않는다. 모바일 백그라운드 스로틀에서 누적 카운터는 조용히
 * 틀어지기 때문이다(계획서 docs/rest-timer-plan.md §3.1).
 *
 * 그래서 `now`는 전부 인자로 받는다 — 함수 안에서 Date.now()를 부르면 테스트가 불가능해진다.
 */

export type RestTimerState = {
  exerciseId: string;
  setIndex: number;
  /** epoch ms */
  startedAtMs: number;
  targetSeconds: number;
};

/** 남은 초. 만료 후에는 0 이하로 계속 내려가지 않고 0에서 멈춘다. */
export function remainingSeconds(state: RestTimerState, nowMs: number): number {
  const elapsedMs = Math.max(0, nowMs - state.startedAtMs);
  const remaining = state.targetSeconds - Math.floor(elapsedMs / 1000);
  return Math.max(0, remaining);
}

export function elapsedSeconds(state: RestTimerState, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - state.startedAtMs) / 1000));
}

export function isExpired(state: RestTimerState, nowMs: number): boolean {
  return remainingSeconds(state, nowMs) <= 0;
}

/** 0~1. 진행률 바 폭에 쓴다. 목표가 0 이하면 즉시 1(완료)로 본다. */
export function progressRatio(state: RestTimerState, nowMs: number): number {
  if (state.targetSeconds <= 0) return 1;
  const elapsed = elapsedSeconds(state, nowMs);
  return Math.max(0, Math.min(1, elapsed / state.targetSeconds));
}

/** `M:SS` — 10분 이상은 `MM:SS`. 음수는 0으로 클램프한다. */
export function formatRestClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 복원 값 파싱. 손상된 값·만료된 타이머는 버린다(만료 알림이 뒤늦게 울리면 안 된다).
 */
export function parseRestTimerState(raw: unknown, nowMs: number): RestTimerState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const exerciseId = typeof record.exerciseId === "string" ? record.exerciseId : "";
  const setIndex = Number(record.setIndex);
  const startedAtMs = Number(record.startedAtMs);
  const targetSeconds = Number(record.targetSeconds);

  if (!exerciseId) return null;
  if (!Number.isFinite(setIndex) || setIndex < 0) return null;
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return null;
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) return null;
  // 미래에서 시작한 타이머는 시계 변경·손상된 값이다.
  if (startedAtMs > nowMs) return null;

  const state: RestTimerState = {
    exerciseId,
    setIndex: Math.floor(setIndex),
    startedAtMs,
    targetSeconds: Math.floor(targetSeconds),
  };
  return isExpired(state, nowMs) ? null : state;
}
