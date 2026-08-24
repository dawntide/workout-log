/**
 * 원판 분해 — 목표 무게를 "바 + 한쪽에 끼울 원판"으로 쪼갠다.
 *
 * 표시 전용이다. 라운딩은 이미 `snapWeightToIncrementKg`가 하고 REF5 스냅샷은 불변이므로,
 * 이 모듈을 저장·스냅 경로에 연결하지 않는다(계획서 docs/plate-calculator-plan.md §6-1).
 *
 * `roundToNearest2p5`를 재사용하지 않는 이유: 그 함수는 2.5 고정이라 보유 원판 기반
 * 분해에 쓸 수 없다.
 */

export type PlateInventory = {
  barWeightKg: number;
  /** 보유한 원판 종류(한 종류당 무한 개수 가정). 내부에서 내림차순 정규화한다. */
  platesKg: readonly number[];
};

export type PlateBreakdown =
  | {
      kind: "exact";
      /** 한쪽에 끼울 원판, 무거운 것부터. */
      perSide: number[];
      totalKg: number;
      barWeightKg: number;
    }
  | {
      kind: "nearest";
      perSide: number[];
      totalKg: number;
      requestedKg: number;
      barWeightKg: number;
    }
  | {
      kind: "below-bar";
      barWeightKg: number;
      requestedKg: number;
    };

const EPSILON = 1e-6;

/** 기본 원판 세트(kg). 국내 헬스장에서 흔한 구성. */
export const DEFAULT_PLATES_KG: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_BAR_WEIGHT_KG = 20;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizePlates(platesKg: readonly number[]): number[] {
  return [...new Set(platesKg.filter((plate) => Number.isFinite(plate) && plate > 0))].sort(
    (a, b) => b - a,
  );
}

/**
 * 한쪽 무게를 greedy로 채운다. 표준 원판 세트는 각 원판이 다음 것의 배수 관계에
 * 가까워 greedy가 최적해와 일치한다.
 */
function fillSide(targetPerSide: number, plates: number[]): { used: number[]; filled: number } {
  const used: number[] = [];
  let remaining = targetPerSide;
  for (const plate of plates) {
    while (remaining + EPSILON >= plate) {
      used.push(plate);
      remaining = round2(remaining - plate);
    }
  }
  return { used, filled: round2(targetPerSide - remaining) };
}

export function breakdownPlates(targetKg: number, inventory: PlateInventory): PlateBreakdown {
  const barWeightKg = Number.isFinite(inventory.barWeightKg)
    ? Math.max(0, round2(inventory.barWeightKg))
    : DEFAULT_BAR_WEIGHT_KG;
  const requestedKg = Number.isFinite(targetKg) ? round2(Math.max(0, targetKg)) : 0;

  if (requestedKg < barWeightKg - EPSILON) {
    return { kind: "below-bar", barWeightKg, requestedKg };
  }

  const plates = normalizePlates(inventory.platesKg);
  const targetPerSide = round2((requestedKg - barWeightKg) / 2);

  if (targetPerSide <= EPSILON) {
    return { kind: "exact", perSide: [], totalKg: barWeightKg, barWeightKg };
  }
  if (plates.length === 0) {
    return { kind: "nearest", perSide: [], totalKg: barWeightKg, requestedKg, barWeightKg };
  }

  const { used, filled } = fillSide(targetPerSide, plates);
  const totalKg = round2(barWeightKg + filled * 2);

  if (Math.abs(totalKg - requestedKg) < EPSILON) {
    return { kind: "exact", perSide: used, totalKg, barWeightKg };
  }

  // greedy는 항상 목표 이하에서 멈춘다. 한 단계 위(가장 가벼운 원판 하나 추가)가
  // 더 가까우면 그쪽을 택한다 — 조립 가능한 무게 중 목표에 가장 가까운 값이 목적이다.
  //
  // 단순히 `[...used, smallest]`로 붙이면 원판이 불필요하게 늘어난다. 예를 들어
  // 25/20/15/10/5 인벤토리에서 한쪽 25kg는 [25] 한 장이면 되는데 [20,5] 두 장이 된다.
  // 그래서 목표 무게를 정한 뒤 그 무게로 greedy를 다시 돌려 최소 장수를 얻는다.
  const smallest = plates[plates.length - 1]!;
  const overPerSide = round2(filled + smallest);
  const overUsed = fillSide(overPerSide, plates).used;
  const overTotal = round2(barWeightKg + overPerSide * 2);
  const under = Math.abs(requestedKg - totalKg);
  const over = Math.abs(overTotal - requestedKg);

  return over < under
    ? { kind: "nearest", perSide: overUsed, totalKg: overTotal, requestedKg, barWeightKg }
    : { kind: "nearest", perSide: used, totalKg, requestedKg, barWeightKg };
}

/** `20·10·2.5` 형태의 한쪽 요약. 원판이 없으면 빈 문자열. */
export function formatPerSide(perSide: readonly number[]): string {
  if (perSide.length === 0) return "";
  return perSide.map((plate) => (Number.isInteger(plate) ? String(plate) : plate.toFixed(2).replace(/0$/, ""))).join("·");
}
