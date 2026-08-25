import type { IntensityInput } from "./workout-preferences";

/**
 * 세트 강도(RPE) 입력값의 저장 표현.
 *
 * 화면은 빈 셀을 0으로 들고 있고(입력 상태 표현), DB는 "값 없음"을 NULL로 적어야
 * 한다. 그 번역을 **전송 경계 한 곳**에서만 한다 — 화면 배열을 NULL 허용으로 바꾸면
 * 입력·포커스·정규화 전부에 null 분기가 번진다.
 *
 * 이 함수가 없던 동안 웹은 미입력을 그대로 0으로 보냈고, 평균 RPE가 0으로 희석됐다
 * (prod 실측 2026-08-25: 739세트 중 692가 rpe=0, 평균 0.16 — 실제 입력값 평균은 8.00).
 */

/** RPE 유효 범위. 0은 "값 없음"이라 저장 대상이 아니다. */
const MIN_RPE = 0;
const MAX_RPE = 10;

/**
 * RIR 입력 상한. **이 클램프가 안전성 근거의 전부다.**
 *
 * `rpe = 10 - rir`이므로 rir을 10까지 열면 `rpe = 0`이 나오는데, 그건 REF5가
 * "값 없음"으로 쓰는 센티널과 구별할 수 없다. 5로 막으면 저장값이 5~10이라
 * 충돌이 원천 차단된다(계획서 docs/rir-input-plan.md §2.4·§6-1).
 *
 * 실사용 범위이기도 하다 — RIR 6 이상은 "가볍다"는 뜻이라 굳이 기록하지 않는다.
 */
const MAX_RIR = 5;

/**
 * 화면 값 → 저장할 rpe. 미입력(0·음수·비유한)은 **null**이다.
 *
 * 0.5 스냅은 두 클라이언트가 공유하는 규칙이다 — RPE는 0.5 단위로 기록한다.
 */
export function toStoredRpe(input: number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const value = Number(input);
  if (!Number.isFinite(value)) return null;
  const clamped = Math.max(MIN_RPE, Math.min(MAX_RPE, value));
  const snapped = Math.round(clamped * 2) / 2;
  return snapped > 0 ? snapped : null;
}

/**
 * 화면 값 → 저장할 rpe. 모드와 무관하게 **미입력은 null**이다.
 *
 * RIR 모드는 `rpe = 10 - rir`로 뒤집는다. rir=0(한계까지)이 rpe=10, rir=5가 rpe=5다.
 */
export function toStoredIntensity(
  input: number | null | undefined,
  mode: IntensityInput,
): number | null {
  if (mode === "RPE") return toStoredRpe(input);
  if (input === null || input === undefined) return null;
  const value = Number(input);
  if (!Number.isFinite(value)) return null;
  const clamped = Math.max(0, Math.min(MAX_RIR, value));
  const snapped = Math.round(clamped * 2) / 2;
  return MAX_RPE - snapped;
}

/**
 * 저장된 rpe → 화면 값. 0·null은 "값 없음"이라 두 모드 모두 null이다.
 *
 * RIR 모드에서 rpe < 5(= rir > 5)인 옛 기록은 상한을 넘는다. 클램프하지 않고
 * 그대로 보여준다 — 사용자가 실제로 기록한 강도를 임의로 낮춰 표시하면 그게 더 나쁘다.
 */
export function toDisplayIntensity(
  rpe: number | null | undefined,
  mode: IntensityInput,
): number | null {
  const value = Number(rpe);
  if (!Number.isFinite(value) || value <= 0) return null;
  return mode === "RPE" ? value : MAX_RPE - value;
}
