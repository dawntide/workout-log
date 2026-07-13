/** Lightweight REF5 discriminator safe to use in both server and client modules. */
export function isRef5PlanParams(
  params: Record<string, unknown> | null | undefined,
): boolean {
  if (!params) return false;
  return params.programFamily === "ref5" || Boolean(params.ref5);
}
