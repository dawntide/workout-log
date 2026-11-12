"use client";

import { V2Card } from "@/components/v2/primitives";

/**
 * 코치 플랜 세션의 상단 안내.
 *
 * 처방이 있으면 **근거를 그대로** 보여 준다 — 서버는 처방의 범위만 검증하므로, 무게가
 * 합리적인지 시작 전에 사람이 읽고 판단하는 것이 유일한 안전장치다. 처방이 없으면 자유
 * 기록이 가능하다는 것만 알린다.
 */
export function CoachSessionNotice({
  rationale,
  showEmptyNotice,
  copy,
}: {
  rationale: string | null;
  showEmptyNotice: boolean;
  copy: {
    coachRationaleTitle: string;
    coachNoPrescriptionTitle: string;
    coachNoPrescriptionBody: string;
  };
}) {
  if (!rationale && !showEmptyNotice) return null;
  return (
    <V2Card
      tone={rationale ? "accent" : "inset"}
      padding="var(--v2-s-4)"
      radius="var(--v2-r-2)"
    >
      <div role="status" style={{ display: "grid", gap: "var(--v2-s-1)" }}>
        <p className="v2-label">
          {rationale ? copy.coachRationaleTitle : copy.coachNoPrescriptionTitle}
        </p>
        <p
          className="v2-small"
          style={{ color: "var(--v2-ink-2)", maxWidth: "62ch", whiteSpace: "pre-wrap" }}
        >
          {rationale ?? copy.coachNoPrescriptionBody}
        </p>
      </div>
    </V2Card>
  );
}
