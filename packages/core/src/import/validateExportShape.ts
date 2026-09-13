const SUPPORTED_VERSIONS = new Set<number>([1]);

export function validateExportShape(input: unknown): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["import body must be a JSON object"] };
  }
  const obj = input as Record<string, unknown>;
  const version = Number(obj.version);
  if (!Number.isFinite(version)) {
    errors.push("version must be a number");
  } else if (!SUPPORTED_VERSIONS.has(version)) {
    errors.push(`unsupported export version: ${version}`);
  }
  if (typeof obj.userId !== "string") {
    errors.push("userId must be a string");
  }
  if (typeof obj.exportedAt !== "string") {
    errors.push("exportedAt must be a string");
  }
  for (const key of [
    "templates",
    "templateVersions",
    "plans",
    "planModules",
    "planOverrides",
    "generatedSessions",
    "workoutLogs",
    "workoutSets",
  ]) {
    if (!Array.isArray(obj[key])) {
      errors.push(`${key} must be an array`);
    }
  }
  if (obj.progressionDecisions !== undefined) {
    if (!Array.isArray(obj.progressionDecisions)) {
      errors.push("progressionDecisions must be an array");
    } else {
      const logIds = new Set((Array.isArray(obj.workoutLogs) ? obj.workoutLogs : [])
        .map((row) => row?.id));
      const seen = new Set<string>();
      for (const row of obj.progressionDecisions) {
        if (!row || typeof row.logId !== "string" || !logIds.has(row.logId) || seen.has(row.logId)) {
          errors.push("progressionDecisions must reference unique workoutLogs in this file");
          continue;
        }
        seen.add(row.logId);
        if (!row.decisions || typeof row.decisions !== "object" || Array.isArray(row.decisions) ||
            !Object.entries(row.decisions).every(([key, value]) => {
              const decision = value as { mode?: unknown; workKg?: unknown } | null;
              return key.trim() && decision && ["hold", "increase", "reset"].includes(String(decision.mode)) &&
                typeof decision.workKg === "number" && Number.isFinite(decision.workKg) && decision.workKg >= 0;
            })) {
          errors.push("progressionDecisions contains an invalid decision");
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
