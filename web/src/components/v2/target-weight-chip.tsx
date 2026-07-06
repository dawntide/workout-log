type TargetWeightChipProps = {
  label: string;
  weightKg: number | null;
  lastDeltaKg: number | null;
  lastEventType: "INCREASE" | "HOLD" | "RESET" | null;
  /** 맨몸 운동 총무게 뒤 추가중량 병기 (`(+20)`/`(체중)`). 없으면 미표시. */
  weightSuffix?: string | null;
};

/**
 * 자동 진행 플랜의 운동별 "현재 무게 + 직전 변화" 칩.
 * 사이클 개요 시트(workout-log)와 플랜 관리 상세에서 공용으로 쓴다.
 * INCREASE는 ↑(success), RESET은 ↓(danger), HOLD는 화살표 없음.
 */
export function TargetWeightChip({
  label,
  weightKg,
  lastDeltaKg,
  lastEventType,
  weightSuffix,
}: TargetWeightChipProps) {
  const arrowKey =
    lastEventType === "INCREASE"
      ? "arrow_upward"
      : lastEventType === "RESET"
        ? "arrow_downward"
        : null;
  const arrowColor =
    lastEventType === "INCREASE"
      ? "var(--v2-c-success)"
      : lastEventType === "RESET"
        ? "var(--v2-c-danger)"
        : "var(--v2-ink-3)";
  const hasDelta =
    arrowKey !== null && lastDeltaKg !== null && Math.abs(lastDeltaKg) > 0;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--v2-s-2)",
        padding: "var(--v2-s-2) var(--v2-s-3)",
        background: "var(--v2-paper-2)",
        borderRadius: "var(--v2-r-2)",
        minHeight: "var(--v2-s-8)",
      }}
    >
      <span
        style={{
          fontSize: "var(--v2-t-12)",
          color: "var(--v2-ink)",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        className="v2-mono-label"
        style={{
          fontSize: "var(--v2-t-14)",
          color: "var(--v2-c-weight)",
          fontWeight: 700,
        }}
      >
        {weightKg !== null
          ? `${weightKg}kg${weightSuffix ? ` ${weightSuffix}` : ""}`
          : "—"}
      </span>
      {hasDelta ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            color: arrowColor,
            fontSize: "var(--v2-t-eyebrow)",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "var(--v2-t-14)" }}
            aria-hidden
          >
            {arrowKey}
          </span>
          <span className="v2-mono-label">
            {lastDeltaKg! > 0 ? `+${lastDeltaKg}` : `${lastDeltaKg}`}
          </span>
        </span>
      ) : null}
    </div>
  );
}
