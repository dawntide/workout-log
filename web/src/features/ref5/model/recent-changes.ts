// REF5 최근 판정 이력 — progression-state의 `ref5Status.recentChanges`(엔진이 남긴
// 마지막 8건)를 플랜 관리 패널에서 읽을 수 있는 행으로 바꾼다.
//
// 저장 직후 판정 카드가 "방금 무슨 일이 났는가"에 답한다면, 이 이력은 "내 기준이
// 그동안 어떻게 움직였는가"에 답한다. 카드처럼 문장을 만들지 않고 라벨·무게·종류로
// 쪼개는 이유는 표 형태로 훑기 위해서다.
//
// ⚠️ TUI(`apps/tui/internal/ui/ref5_recent_changes.go`)가 같은 문구를 미러링한다.
// 여기 라벨을 고치면 그쪽 테이블도 함께 고칠 것 — 두 테스트가 같은 기대 문자열을 쓴다.

import { ref5LiftStandardLabel } from "@workout/core/progression/feedback-catalog";
import type { Ref5Status } from "@workout/core/program-engine/ref5-status";

export type Ref5ChangeDirection = "up" | "flat" | "down";

export type Ref5RecentChangeRow = {
  key: string;
  liftLabel: string;
  direction: Ref5ChangeDirection;
  arrow: string;
  /** "100 → 102.5 kg" — 값이 그대로면 "62.5 kg" 하나만. */
  weightText: string;
  kindLabel: string;
};

const KIND_LABEL: Record<"ko" | "en", Record<string, string>> = {
  ko: {
    INCREASE: "증량",
    MAINTAIN: "유지",
    IMMEDIATE_DECREASE: "즉시 감량",
    STAGNATION_DECREASE: "정체 감량",
    AUXILIARY_CAP_DECREASE: "상한 감량",
    PULL_RELOCK: "창 재고정",
  },
  en: {
    INCREASE: "increase",
    MAINTAIN: "hold",
    IMMEDIATE_DECREASE: "immediate drop",
    STAGNATION_DECREASE: "stagnation drop",
    AUXILIARY_CAP_DECREASE: "cap drop",
    PULL_RELOCK: "window relock",
  },
};

// 판정창 흐름(↑ INCREASE / → MAINTAIN)과 같은 글리프를 쓰고 감량만 ↓를 더한다 —
// 같은 패널 안에서 두 섹션이 다른 기호 체계를 쓰면 읽는 사람이 다시 배워야 한다.
const ARROW: Record<Ref5ChangeDirection, string> = { up: "↑", flat: "→", down: "↓" };

function formatKg(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function directionOf(kind: string, beforeKg: number, afterKg: number): Ref5ChangeDirection {
  if (afterKg > beforeKg) return "up";
  if (afterKg < beforeKg) return "down";
  // 값이 같은 재고정은 방향이 없다. MAINTAIN과 같은 → 로 둔다.
  return kind === "INCREASE" ? "up" : "flat";
}

/**
 * 최신순 행 목록. 엔진은 오래된 것부터 쌓으므로 뒤집는다.
 *
 * PULL_RELOCK의 before/after는 기준 총하중이 아니라 **추가 중량**이라, 라벨만으로는
 * 같은 PULL 행과 구분되지 않는다. 종류 라벨("창 재고정")이 그 구분을 진다.
 */
export function buildRef5RecentChangeRows(
  status: Pick<Ref5Status, "recentChanges"> | null | undefined,
  locale: "ko" | "en",
): Ref5RecentChangeRow[] {
  const changes = status?.recentChanges ?? [];
  const rows: Ref5RecentChangeRow[] = [];
  for (let index = changes.length - 1; index >= 0; index -= 1) {
    const change = changes[index];
    if (!change) continue;
    const beforeKg = Number(change.beforeKg);
    const afterKg = Number(change.afterKg);
    if (!Number.isFinite(beforeKg) || !Number.isFinite(afterKg)) continue;
    const kind = String(change.kind ?? "").toUpperCase();
    const direction = directionOf(kind, beforeKg, afterKg);
    rows.push({
      // eventId는 엔진이 리프트·종류·완료이벤트로 조립해 유일하다.
      key: String(change.eventId ?? `${change.lift}:${kind}:${index}`),
      liftLabel: ref5LiftStandardLabel(String(change.lift ?? ""), locale),
      direction,
      arrow: ARROW[direction],
      weightText:
        beforeKg === afterKg
          ? `${formatKg(afterKg)} kg`
          : `${formatKg(beforeKg)} → ${formatKg(afterKg)} kg`,
      kindLabel: KIND_LABEL[locale][kind] ?? kind,
    });
  }
  return rows;
}

export function ref5RecentChangesEmptyCopy(locale: "ko" | "en"): string {
  return locale === "ko"
    ? "아직 판정된 변경이 없습니다 — 판정창이 처음 마감되면 여기에 쌓입니다."
    : "No judged changes yet — they appear here once the first window closes.";
}
