import {
  validateRef5StartConfig,
  type Ref5StartConfigValidationResult,
} from "@workout/core/program-engine/ref5";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** Submitted direct starts win; absent starts fall back to version defaults. */
export function resolveRef5PlanStartConfig(
  submittedParams: unknown,
  versionDefaults: unknown,
): Ref5StartConfigValidationResult {
  const submittedRef5 = asRecord(asRecord(submittedParams).ref5);
  const defaultRef5 = asRecord(asRecord(versionDefaults).ref5);
  return validateRef5StartConfig(
    Object.hasOwn(submittedRef5, "startingValuesKg")
      ? submittedRef5.startingValuesKg
      : defaultRef5.startingValuesKg,
  );
}
