/**
 * plans 라우트 그룹 공용 헬퍼.
 *
 * plans.ts가 1,706줄이던 시절 파일 상단에 모여 있던 것들을, 라우트를 그룹별 모듈로
 * 쪼개면서 여기로 옮겼다(2026-08 감사 §3.3 C1). 로직은 그대로다.
 */

export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function withAutoProgressionDefaults(value: unknown) {
  const next = { ...toRecord(value) };
  next.autoProgression = true;
  return next;
}

export const PROGRESSION_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function snapTo2p5(n: number): number {
  return Math.max(0, Math.round(n / 2.5) * 2.5);
}

export type NormalizedIncrementOverrides = {
  increaseKg?: Record<string, number>;
  decreaseKg?: Record<string, number>;
};

export function validateIncrementOverrides(
  value: unknown,
  locale: "ko" | "en",
):
  | { ok: true; value: NormalizedIncrementOverrides | null }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: null };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      error:
        locale === "ko"
          ? "incrementOverrides는 객체여야 합니다."
          : "incrementOverrides must be an object.",
    };
  }

  const out: NormalizedIncrementOverrides = {};
  for (const side of ["increaseKg", "decreaseKg"] as const) {
    const raw = (value as Record<string, unknown>)[side];
    if (raw === undefined) continue;
    if (raw === null) continue;
    if (typeof raw !== "object" || Array.isArray(raw)) {
      return {
        ok: false,
        error:
          locale === "ko"
            ? `incrementOverrides.${side}는 객체여야 합니다.`
            : `incrementOverrides.${side} must be an object.`,
      };
    }
    const normalized: Record<string, number> = {};
    for (const [rawKey, rawValue] of Object.entries(raw)) {
      const key = String(rawKey).trim().toUpperCase();
      if (!PROGRESSION_KEY_PATTERN.test(key)) continue;
      const num = Number(rawValue);
      if (!Number.isFinite(num) || num < 0) {
        return {
          ok: false,
          error:
            locale === "ko"
              ? `${key}의 ${side} 값은 0 이상의 숫자여야 합니다.`
              : `${key} ${side} must be a non-negative number.`,
        };
      }
      normalized[key] = snapTo2p5(num);
    }
    if (Object.keys(normalized).length > 0) {
      out[side] = normalized;
    }
  }

  if (!out.increaseKg && !out.decreaseKg) return { ok: true, value: null };
  return { ok: true, value: out };
}

/**
 * `toRecord`와 **완전히 같은 함수**다. 1,706줄짜리 파일에 65줄과 144줄로 떨어져 있어
 * 보이지 않던 중복인데, 헬퍼를 여기 모으니 드러났다. 호출부(오버라이드·런타임 타깃 경로)가
 * 쓰는 이름을 바꾸는 건 이 리팩터의 범위 밖이라, 이름만 남기고 구현을 합친다.
 */
export const asRecord = toRecord;
