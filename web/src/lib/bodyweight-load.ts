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
