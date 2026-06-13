function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTo2(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveBrowserLocale(): "ko" | "en" {
  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang.trim().toLowerCase();
    if (lang.startsWith("ko")) return "ko";
    if (lang.startsWith("en")) return "en";
  }
  if (typeof navigator !== "undefined") {
    const lang = String(navigator.language ?? "").trim().toLowerCase();
    if (lang.startsWith("ko")) return "ko";
  }
  return "en";
}

export function isBodyweightExerciseName(exerciseName: string): boolean {
  const normalized = exerciseName.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("pull-up") ||
    normalized.includes("pull up") ||
    normalized.includes("chin-up") ||
    normalized.includes("chin up") ||
    normalized.includes("풀업") ||
    normalized.includes("친업")
  );
}

// 하이브리드(Asymptote × Async) 체중 확인 게이트: 이번 세션에 "맨몸 운동(풀업 등)의 AMRAP 세트"가
// 있는가. 풀업 AMRAP은 총중량(체중+추가)으로 TM을 좌우하므로, 그 직전이 체중을 갱신할 "중요한 순간".
// 처방 draft의 운동(이름 + plannedSetMeta.amrapPerSet)을 그대로 받는 순수 함수.
export function sessionHasBodyweightAmrap(
  exercises: ReadonlyArray<{
    exerciseName: string;
    plannedSetMeta?: { amrapPerSet?: boolean[] | null } | null;
  }>,
): boolean {
  return exercises.some((exercise) => {
    if (!isBodyweightExerciseName(exercise.exerciseName)) return false;
    const amrapPerSet = exercise.plannedSetMeta?.amrapPerSet;
    return Array.isArray(amrapPerSet) && amrapPerSet.some(Boolean);
  });
}

export function computeBodyweightTotalLoadKg(
  exerciseName: string,
  externalWeightKg: number,
  bodyweightKg: number | null,
): number | null {
  if (!isBodyweightExerciseName(exerciseName)) return null;
  if (bodyweightKg === null || bodyweightKg <= 0) return null;
  const external = Number.isFinite(externalWeightKg) ? Math.max(0, externalWeightKg) : 0;
  return roundTo2(bodyweightKg + external);
}

export function computeExternalLoadFromTotalKg(
  exerciseName: string,
  totalLoadKg: number,
  bodyweightKg: number | null,
): number | null {
  if (!isBodyweightExerciseName(exerciseName)) return null;
  if (bodyweightKg === null || bodyweightKg <= 0) return null;
  const total = Number.isFinite(totalLoadKg) ? Math.max(0, totalLoadKg) : 0;
  return roundTo2(Math.max(0, total - bodyweightKg));
}

/**
 * 프로그램 처방 무게(targetWeightKg = TM × %, 맨몸 운동은 체중 포함 총부하)를
 * 기록 입력 필드용 외부 추가중량으로 변환한다. 기록 필드는 외부 추가중량만 받는다.
 *
 * - 비-맨몸 운동: 처방값이 곧 외부중량 → 그대로 반환.
 * - 맨몸 + 체중 설정됨: 총부하 − 체중 (음수는 0).
 * - 맨몸 + 체중 미설정: 총부하를 외부중량으로 그대로 시드하면 부풀려진 값(예:
 *   풀업 97.5)이 외부중량으로 저장된다(2026-05-23 C2W6D1 이상치의 직접 원인).
 *   변환이 불가능하므로 0을 반환해 사용자가 실제 추가중량을 입력하도록 유도한다.
 */
export function prescriptionToExternalLoadKg(
  exerciseName: string,
  prescribedTotalKg: number,
  bodyweightKg: number | null,
): number {
  const base = Number.isFinite(prescribedTotalKg) ? prescribedTotalKg : 0;
  if (!isBodyweightExerciseName(exerciseName)) return base;
  const external = computeExternalLoadFromTotalKg(
    exerciseName,
    base,
    bodyweightKg,
  );
  return external ?? 0;
}

export function resolveLoggedTotalLoadKg(input: {
  exerciseName: string;
  weightKg?: number | null;
  meta?: Record<string, unknown> | null | undefined;
}): number | null {
  const loggedWeightKg = toFiniteNumber(input.weightKg);
  if (!isBodyweightExerciseName(input.exerciseName)) return loggedWeightKg;
  const metaTotalLoadKg = toFiniteNumber(input.meta?.totalLoadKg);
  if (metaTotalLoadKg !== null && metaTotalLoadKg > 0) return roundTo2(metaTotalLoadKg);
  return loggedWeightKg;
}

export function formatKgValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Number(value.toFixed(2))}kg`;
}

/**
 * 맨몸 운동에서 총무게 뒤에 병기할 추가중량 라벨을 만든다.
 * 추가중량 > 0 이면 `(+20)`, 0/음수면 `(체중)`/`(BW)`. 비-맨몸 운동이거나
 * 체중을 알 수 없으면 null(병기 없음).
 */
export function bodyweightAddedSuffix(
  exerciseName: string,
  totalLoadKg: number | null | undefined,
  bodyweightKg: number | null | undefined,
  locale: "ko" | "en" = resolveBrowserLocale(),
): string | null {
  if (!isBodyweightExerciseName(exerciseName)) return null;
  const total = toFiniteNumber(totalLoadKg);
  const bw = toFiniteNumber(bodyweightKg);
  if (total === null || bw === null || bw <= 0) return null;
  const added = roundTo2(Math.max(0, total - bw));
  return added > 0
    ? `(+${formatKgValue(added).replace("kg", "")})`
    : locale === "ko" ? "(체중)" : "(BW)";
}

/**
 * 로그된 세트의 부하를 총무게 기준으로 환산하고 추가중량 병기 라벨을 함께 반환한다.
 * 로그 weightKg는 외부 추가중량, meta.totalLoadKg는 저장 시점 총부하(체중+추가).
 * meta.totalLoadKg가 있으면 추가중량 = weightKg, 총무게 = meta.totalLoadKg.
 * 비-맨몸 운동이거나 총부하 메타가 없으면 suffix는 null(총무게=원래 무게).
 */
export function resolveLoggedLoadDisplay(input: {
  exerciseName: string;
  weightKg?: number | null;
  meta?: Record<string, unknown> | null | undefined;
  locale?: "ko" | "en";
}): { totalKg: number | null; suffix: string | null } {
  const locale = input.locale ?? resolveBrowserLocale();
  const totalKg = resolveLoggedTotalLoadKg(input);
  if (!isBodyweightExerciseName(input.exerciseName)) {
    return { totalKg, suffix: null };
  }
  const metaTotalLoadKg = toFiniteNumber(input.meta?.totalLoadKg);
  // 총부하 메타가 없으면 총무게로 환산 불가 → 원래 값 그대로, 병기 없음.
  if (metaTotalLoadKg === null || metaTotalLoadKg <= 0) {
    return { totalKg, suffix: null };
  }
  const added = toFiniteNumber(input.weightKg);
  const ext = added !== null && added > 0 ? roundTo2(added) : 0;
  const suffix =
    ext > 0
      ? `(+${formatKgValue(ext).replace("kg", "")})`
      : locale === "ko" ? "(체중)" : "(BW)";
  return { totalKg, suffix };
}

export function formatExerciseLoadLabel(input: {
  exerciseName: string;
  weightKg: number | null | undefined;
  bodyweightKg: number | null;
  source?: "external" | "total";
  showTotal?: boolean;
  locale?: "ko" | "en";
}) {
  const locale = input.locale ?? resolveBrowserLocale();
  const weightKg = toFiniteNumber(input.weightKg);
  if (weightKg === null) return "-";
  const source = input.source ?? "external";
  const bodyweightKg =
    typeof input.bodyweightKg === "number" && Number.isFinite(input.bodyweightKg) && input.bodyweightKg > 0
      ? roundTo2(input.bodyweightKg)
      : null;

  if (!isBodyweightExerciseName(input.exerciseName) || bodyweightKg === null) {
    return formatKgValue(weightKg);
  }

  const externalWeightKg =
    source === "total"
      ? computeExternalLoadFromTotalKg(input.exerciseName, weightKg, bodyweightKg)
      : roundTo2(Math.max(0, weightKg));
  const totalLoadKg =
    source === "total"
      ? roundTo2(Math.max(0, weightKg))
      : computeBodyweightTotalLoadKg(input.exerciseName, weightKg, bodyweightKg);

  // 추가중량 병기 라벨: 0보다 크면 `(+20)`, 없으면 체중만.
  const addedLabel =
    externalWeightKg !== null && externalWeightKg > 0
      ? `(+${formatKgValue(externalWeightKg).replace("kg", "")})`
      : locale === "ko" ? "(체중)" : "(BW)";

  // 총무게를 주(主) 표기로, 추가중량을 괄호로 병기한다.
  // 총무게를 알 수 없으면 추가중량만 표기.
  if (totalLoadKg === null) {
    return externalWeightKg !== null && externalWeightKg > 0
      ? `+${formatKgValue(externalWeightKg).replace("kg", "")}kg`
      : locale === "ko" ? "체중만" : "Bodyweight only";
  }

  if (input.showTotal === false) {
    return externalWeightKg !== null && externalWeightKg > 0
      ? `+${formatKgValue(externalWeightKg).replace("kg", "")}kg`
      : locale === "ko" ? "체중만" : "Bodyweight only";
  }

  return `${formatKgValue(totalLoadKg)} ${addedLabel}`;
}
