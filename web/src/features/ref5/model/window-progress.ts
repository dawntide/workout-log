import type { Ref5Status } from "@workout/core/program-engine/ref5-status";

export const REF5_WINDOW_KEYS = ["SQ", "BP", "PULL", "DL", "OHP"] as const;

export type Ref5WindowKey = (typeof REF5_WINDOW_KEYS)[number];

const WINDOW_LABELS: Record<"ko" | "en", Record<Ref5WindowKey, string>> = {
  ko: {
    SQ: "SQ 하드",
    BP: "BP 집중",
    PULL: "PULL 집중",
    DL: "DL",
    OHP: "OHP",
  },
  en: {
    SQ: "SQ hard",
    BP: "BP focus",
    PULL: "PULL focus",
    DL: "DL",
    OHP: "OHP",
  },
};

const WINDOW_DESCRIPTIONS: Record<"ko" | "en", string> = {
  ko: "하드 = INVALID가 아닌 SQ H3(3×3)·H2(3×2), 집중 = 당일 우선 종목으로 배정된 INVALID가 아닌 BP·PULL 3×3입니다. 볼륨 세트는 횟수에서 제외하지만 볼륨 FAIL은 최종 판정에 반영합니다. 기준 횟수에서 자동 판정 후 0부터 다시 집계합니다.",
  en: "Hard means a non-INVALID SQ H3 (3×3) or H2 (3×2); focus means a non-INVALID 3×3 BP/PULL assigned as the session priority. Volume sets do not advance the count, but volume FAILs affect the final judgment. Each window resets after automatic judgment.",
};

export function getRef5WindowProgressDescription(locale: "ko" | "en") {
  return WINDOW_DESCRIPTIONS[locale];
}

/** §18 recent window flow: ↑ INCREASE / → MAINTAIN, oldest→newest. */
export function formatRef5WindowFlow(
  recentResults: readonly ("INCREASE" | "MAINTAIN")[],
): string {
  return recentResults.map((result) => (result === "INCREASE" ? "↑" : "→")).join(" ");
}

export type Ref5OapProgressRow = {
  key: "left" | "right";
  label: string;
  /** "2단 전완" / "rung 2 forearm" — 판정창 행의 무게 자리에 대응한다. */
  rungText: string;
  streakText: string;
  badges: string[];
};

/**
 * §18 OAP 표출: 좌/우 현재 단, 연속 PASS `n/3`, 해금·달성 배지.
 *
 * 판정창 행과 나란히 두되 같은 표에 섞지 않는다 — 이쪽은 kg 기준이 아니라 사다리 단이고,
 * `현재/임계값`도 창 노출 수가 아니라 승급 연속이다.
 */
export function buildRef5OapProgressRows(
  status: Ref5Status,
  locale: "ko" | "en",
): Ref5OapProgressRow[] {
  return (["left", "right"] as const).map((arm) => {
    const value = status.oap[arm];
    const badges: string[] = [];
    if (value.achieved) badges.push(locale === "ko" ? "달성" : "achieved");
    if (value.negativesUnlocked) badges.push(locale === "ko" ? "네거티브" : "negatives");
    return {
      key: arm,
      label:
        locale === "ko"
          ? `OAP ${arm === "left" ? "좌" : "우"}`
          : `OAP ${arm === "left" ? "L" : "R"}`,
      rungText:
        locale === "ko"
          ? `${value.rung}단 ${value.rungNameKo}`
          : `rung ${value.rung} ${value.rungName}`,
      streakText: `PASS ${value.passStreak}/${value.promoteThreshold}`,
      badges,
    };
  });
}

export function getRef5OapProgressDescription(locale: "ko" | "en") {
  return locale === "ko"
    ? "OAP 스킬 슬롯은 kg가 아니라 6단 사다리를 진행합니다. 같은 단에서 3연속 PASS면 승급, 2연속 FAIL이면 강등하며 HOLD는 양쪽 연속을 모두 끊습니다. 팔마다 따로 진행하고, PULL 기준·판정창과는 무관합니다."
    : "The OAP skill slot progresses a six-rung ladder rather than kilograms. Three straight PASSes promote, two straight FAILs demote, and a HOLD breaks both streaks. Each arm progresses on its own and neither touches the PULL standard or its window.";
}

export function buildRef5WindowProgressRows(
  status: Ref5Status,
  locale: "ko" | "en",
) {
  return REF5_WINDOW_KEYS.map((key) => {
    const window = status.windows[key];
    return {
      key,
      label: WINDOW_LABELS[locale][key],
      current: window.current,
      threshold: window.threshold,
      completed: window.completed,
      ratio: Math.min(1, window.current / Math.max(1, window.threshold)),
      // §18 gain rate: INCREASE judgments over completed windows, null until the
      // first window closes so the UI can distinguish "0%" from "not yet judged".
      gainRatePercent: window.gainRate === null ? null : Math.round(window.gainRate * 100),
      flow: formatRef5WindowFlow(window.recentResults),
    };
  });
}
