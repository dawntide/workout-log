export type WorkoutLogQueryContext = {
  planId: string | null;
  date: string;
  hasExplicitDate: boolean;
  logId: string | null;
  sessionId: string | null;
  openAdd: boolean;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function readWorkoutLogQueryContext(): WorkoutLogQueryContext {
  if (typeof window === "undefined") {
    return {
      planId: null,
      date: toDateKey(new Date()),
      hasExplicitDate: false,
      logId: null,
      sessionId: null,
      openAdd: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const planId = params.get("planId");
  const date = params.get("date");
  const logId = params.get("logId");
  const sessionId = params.get("sessionId");

  return {
    planId: planId && planId.trim() ? planId : null,
    date: date && DATE_ONLY_PATTERN.test(date) ? date : toDateKey(new Date()),
    hasExplicitDate: Boolean(date && DATE_ONLY_PATTERN.test(date)),
    logId: logId && logId.trim() ? logId : null,
    sessionId: sessionId && sessionId.trim() ? sessionId : null,
    openAdd: params.get("openAdd") === "1",
  };
}

// SSR initialContext ↔ 클라이언트 매칭 키. "서버가 렌더한 URL 컨텍스트와 지금 클라이언트가
// 보는 URL 컨텍스트가 같은가"만 답하도록 URL에서 파생 가능한 값으로만 구성한다.
// - planId: raw ?planId (리졸브된 플랜 id가 아님 — 리졸브 알고리즘은 양쪽이 동일 입력을 쓰므로 결과도 같다)
// - date: 명시된 ?date. 없으면 logId/sessionId 진입은 ""(로그·세션이 날짜를 결정), 새 세션 진입만
//   resolvedDate(서버=UTC today, 클라=로컬 today)를 넣어 타임존 불일치 시 클라이언트 폴백을 보장한다.
export function buildWorkoutLogMatchKey(input: {
  planId: string | null;
  explicitDate: string | null;
  resolvedDate: string;
  logId: string | null;
  sessionId: string | null;
}): string {
  const datePart =
    input.explicitDate ?? (input.logId || input.sessionId ? "" : input.resolvedDate);
  return `${input.planId ?? ""}:${datePart}:${input.logId ?? ""}:${input.sessionId ?? ""}`;
}

export function isDateOnlyString(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY_PATTERN.test(value);
}

export function daysBetweenDateKeys(dateKey: string, startDateKey: string) {
  const dateMs = new Date(`${dateKey}T00:00:00Z`).getTime();
  const startMs = new Date(`${startDateKey}T00:00:00Z`).getTime();
  return Math.floor((dateMs - startMs) / 86_400_000);
}

export function normalizeSchedule(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}
