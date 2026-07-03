// 운동 이름 → 진행 대상(strength target) 정규 매핑.
// progression(reducer)과 program-engine(generateSession)이 공유하는 단일 진실원.
// 이전에는 양쪽(+클라이언트 2곳)에 byte-identical 복사본이 있어, 한쪽만 수정하면
// 자동 진행 결정과 처방이 silent하게 어긋날 수 있었다(audit §3.6).

export type StrengthTarget = "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL";

/**
 * substring 규칙으로 운동 이름을 5개 strength target 중 하나로 매핑한다.
 * 우선순위(squat → bench → deadlift → ohp → pull)는 변경 시 reducer/generator
 * 양쪽 동작에 영향을 주므로 순서를 바꾸지 말 것. 매칭 없으면 null.
 */
export function mapExerciseNameToTarget(exerciseName: string): StrengthTarget | null {
  const normalized = String(exerciseName).trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("squat")) return "SQUAT";
  if (normalized.includes("bench")) return "BENCH";
  if (normalized.includes("deadlift")) return "DEADLIFT";
  if (normalized.includes("overhead press") || normalized === "ohp" || normalized.includes("shoulder press")) {
    return "OHP";
  }
  if (
    normalized.includes("row") ||
    normalized.includes("pull-up") ||
    normalized.includes("pull up") ||
    normalized.includes("pulldown")
  ) {
    return "PULL";
  }
  return null;
}
