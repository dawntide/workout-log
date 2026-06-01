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
