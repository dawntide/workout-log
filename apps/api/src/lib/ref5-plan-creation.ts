import {
  validateRef5StartConfig,
  type Ref5StartConfigValidationResult,
} from "@workout/core/program-engine/ref5";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * Submitted direct starts win; absent starts fall back to version defaults.
 *
 * The OAP start rungs (start config `3`, §5.2) follow the same source as the
 * loads: taking them from different objects could pair a submitted plan's loads
 * with the template's rungs, which is not a configuration the user chose.
 */
export function resolveRef5PlanStartConfig(
  submittedParams: unknown,
  versionDefaults: unknown,
): Ref5StartConfigValidationResult {
  const submittedRef5 = asRecord(asRecord(submittedParams).ref5);
  const defaultRef5 = asRecord(asRecord(versionDefaults).ref5);
  const source = Object.hasOwn(submittedRef5, "startingValuesKg") ? submittedRef5 : defaultRef5;
  return validateRef5StartConfig(source.startingValuesKg, source.oap);
}
