/**
 * 운동 표기 컨벤션 (글로벌 strength training 표준)
 *
 * 처방(plan): `Sets × Reps @ Weight`
 *   - AMRAP 마지막 세트: `3 × 5+ @ 100kg`
 *   - RPE 처방: `3 × 5 @ 100kg RPE 8`
 *   - 퍼센트 강도: `3 × 5 @ 80%`
 *   - sets === 1이면 sets 부분 생략: `5 @ 100kg`
 *
 * 히스토리(log): per-set `Weight × Reps`
 *   - Compact (한 줄)는 (모든 weight 동일 && 모든 reps 동일 && AMRAP 세트 없음)일 때만
 *   - Compact: `100kg × 5 × 3` (Weight × Reps × Sets)
 *   - Expanded: 세트별 `100kg × 5` 행 나열, AMRAP 세트는 `100kg × 8+`
 *
 * 처방과 히스토리는 의미가 달라 절대 같은 형식으로 통일하지 말 것.
 */

export interface PrescriptionInput {
  sets: number;
  reps: number;
  /** 처방 무게 (kg). 0 이하/null이면 weight 부분 생략, percent가 있으면 percent 사용 */
  weightKg?: number | null;
  /** 퍼센트 강도 (0-100). weightKg가 없을 때 fallback */
  percent?: number | null;
  /** RPE 처방값 (1-10). AMRAP 세트와는 동시 표기 가능 */
  rpe?: number | null;
  /** 마지막 세트가 AMRAP이면 reps에 `+` 접미사 */
  lastSetAmrap?: boolean;
}

/** 처방을 문자열로 포맷. 색상 분리 없이 텍스트 한 줄. */
export function formatPrescription(input: PrescriptionInput): string {
  const { sets, reps, weightKg, percent, rpe, lastSetAmrap } = input;
  if (!Number.isFinite(sets) || !Number.isFinite(reps) || sets < 1 || reps < 1) {
    return "";
  }
  const repsToken = `${reps}${lastSetAmrap ? "+" : ""}`;
  const setsRepsPart = sets > 1 ? `${sets} × ${repsToken}` : repsToken;

  let intensityPart = "";
  if (typeof weightKg === "number" && weightKg > 0) {
    intensityPart = ` @ ${weightKg}kg`;
  } else if (typeof percent === "number" && percent > 0) {
    intensityPart = ` @ ${percent}%`;
  }

  const rpePart =
    typeof rpe === "number" && rpe > 0 ? ` RPE ${rpe}` : "";

  return `${setsRepsPart}${intensityPart}${rpePart}`;
}

export interface PerformedSetInput {
  weightKg: number;
  reps: number;
  isAmrap?: boolean;
}

/** 수행 로그 1세트를 `100kg × 5` 형태로. AMRAP이면 `+` 접미사 */
export function formatPerformedSet(input: PerformedSetInput): string {
  const { weightKg, reps, isAmrap } = input;
  const weightToken = weightKg > 0 ? `${weightKg}kg` : "—";
  return `${weightToken} × ${reps}${isAmrap ? "+" : ""}`;
}

export type PerformedHistoryView =
  | { mode: "compact"; weightKg: number; reps: number; sets: number }
  | { mode: "expanded"; sets: PerformedSetInput[] };

/**
 * 수행 로그를 compact/expanded 결정. 컨벤션:
 * Compact 조건 — 모든 세트 weight 동일 && reps 동일 && AMRAP 세트 없음
 * 위반 시 expanded.
 */
export function summarizePerformedHistory(
  sets: PerformedSetInput[],
): PerformedHistoryView {
  if (sets.length === 0) {
    return { mode: "expanded", sets: [] };
  }
  const first = sets[0]!;
  const noAmrap = sets.every((s) => !s.isAmrap);
  const uniform =
    noAmrap &&
    sets.every((s) => s.weightKg === first.weightKg && s.reps === first.reps);
  if (uniform) {
    return {
      mode: "compact",
      weightKg: first.weightKg,
      reps: first.reps,
      sets: sets.length,
    };
  }
  return { mode: "expanded", sets };
}

/** 수행 로그 compact 형식 문자열: `100kg × 5 × 3` (sets > 1) */
export function formatPerformedHistoryCompact(
  weightKg: number,
  reps: number,
  sets: number,
): string {
  const weightToken = weightKg > 0 ? `${weightKg}kg` : "—";
  if (sets > 1) {
    return `${weightToken} × ${reps} × ${sets}`;
  }
  return `${weightToken} × ${reps}`;
}

/** 수행 로그를 한 줄 문자열로 요약. compact이면 한 줄, expanded이면 세트별 ` / ` 구분. */
export function formatPerformedHistoryLine(
  sets: PerformedSetInput[],
): string {
  const view = summarizePerformedHistory(sets);
  if (view.mode === "compact") {
    return formatPerformedHistoryCompact(view.weightKg, view.reps, view.sets);
  }
  return view.sets.map((s) => formatPerformedSet(s)).join(" / ");
}

export interface PlannedGroup {
  /** 같은 reps/weight를 가진 연속 세트 개수 */
  count: number;
  reps: number;
  /** 0 이하면 weight 부분 생략 */
  weightKg?: number;
}

/**
 * 다중 그룹 처방을 한 줄 문자열로. 단일 그룹은 `Sets × Reps @ Weight`,
 * 다중 그룹은 `S1 × R1, S2 × R2 (max Wkg)` (그룹별 누적 + 최대 무게).
 * 처방 컨벤션 따라 모든 곳에 공백.
 */
export function formatPlannedGroups(groups: PlannedGroup[]): string {
  if (groups.length === 0) return "";
  if (groups.length === 1) {
    const g = groups[0]!;
    const weightSuffix =
      typeof g.weightKg === "number" && g.weightKg > 0
        ? ` @ ${g.weightKg}kg`
        : "";
    return `${g.count} × ${g.reps}${weightSuffix}`;
  }
  const repsPart = groups
    .map((g) => `${g.count} × ${g.reps}`)
    .join(", ");
  const maxWeight = Math.max(
    ...groups.map((g) =>
      typeof g.weightKg === "number" && g.weightKg > 0 ? g.weightKg : 0,
    ),
    0,
  );
  const weightSuffix = maxWeight > 0 ? ` (max ${maxWeight}kg)` : "";
  return `${repsPart}${weightSuffix}`;
}
