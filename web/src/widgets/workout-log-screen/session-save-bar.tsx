import { StickyActionBar } from "@/components/ui/page-layout";
import { formatRestClock } from "@/lib/workout-record/rest-timer";

export type SessionSaveBarRest = {
  active: boolean;
  remaining: number;
  target: number;
  ratio: number;
  onExtend: (deltaSeconds: number) => void;
  onSkip: () => void;
};

/**
 * 세트 진행률 게이지 + 저장 버튼.
 *
 * 휴식 중에는 진행률 줄을 **휴식 줄로 전환**한다(추가가 아니라 교체). 높이가 그대로라
 * .app-main 여백·.app-sticky-action bottom 상수를 손대지 않아도 되고, 도크 위 슬롯을
 * 이미 점유한 저장바와 부유 필이 수직으로 충돌하는 일도 없다(계획서 §3.4).
 */
export function SessionSaveBar({
  completedSetsCount,
  totalSetsCount,
  saving,
  isEditingExistingLog,
  onSave,
  locale,
  copy,
  rest,
}: {
  completedSetsCount: number;
  totalSetsCount: number;
  saving: boolean;
  isEditingExistingLog: boolean;
  onSave: () => void;
  locale: string;
  copy: {
    saveInProgress: string;
    saveEdited: string;
    saveCreate: string;
  };
  rest?: SessionSaveBarRest;
}) {
  const complete = completedSetsCount >= totalSetsCount;
  const restActive = Boolean(rest?.active);
  const restDone = restActive && (rest?.remaining ?? 0) <= 0;

  return (
    <StickyActionBar>
      {restActive && rest ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--v2-s-2)",
            paddingBottom: "var(--v2-s-2)",
          }}
          role="timer"
          aria-live="polite"
          aria-label={
            locale === "ko"
              ? `휴식 ${formatRestClock(rest.remaining)} 남음`
              : `Rest ${formatRestClock(rest.remaining)} remaining`
          }
        >
          <span
            className="v2-mono-label"
            style={{
              color: restDone ? "var(--v2-c-success)" : "var(--v2-c-progress)",
              fontVariantNumeric: "tabular-nums",
              flexShrink: 0,
            }}
          >
            {locale === "ko" ? "휴식" : "Rest"} {formatRestClock(rest.remaining)}
          </span>
          <div
            style={{
              flex: 1,
              height: "var(--v2-s-1)",
              borderRadius: "var(--v2-r-pill)",
              background: "var(--v2-paper-2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round((1 - rest.ratio) * 100)}%`,
                height: "100%",
                background: restDone ? "var(--v2-c-success)" : "var(--v2-c-progress)",
                transition: "width var(--v2-d-1) var(--v2-e-out), background var(--v2-d-2) var(--v2-e-out)",
              }}
            />
          </div>
          <RestChipButton
            label={locale === "ko" ? "30초 추가" : "Add 30 seconds"}
            text="+30s"
            onClick={() => rest.onExtend(30)}
          />
          <RestChipButton
            label={locale === "ko" ? "휴식 건너뛰기" : "Skip rest"}
            text={locale === "ko" ? "건너뛰기" : "Skip"}
            onClick={rest.onSkip}
          />
        </div>
      ) : null}
      {!restActive && totalSetsCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--v2-s-2)",
            paddingBottom: "var(--v2-s-2)",
          }}
          aria-label={
            locale === "ko"
              ? `세트 진행률 ${completedSetsCount}/${totalSetsCount}`
              : `Sets progress ${completedSetsCount}/${totalSetsCount}`
          }
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalSetsCount}
          aria-valuenow={completedSetsCount}
        >
          <span
            className="v2-mono-label"
            style={{
              color: complete ? "var(--v2-c-success)" : "var(--v2-ink-3)",
              fontVariantNumeric: "tabular-nums",
              flexShrink: 0,
            }}
          >
            {completedSetsCount}/{totalSetsCount}{" "}
            {locale === "ko" ? "세트" : "sets"}
          </span>
          <div
            style={{
              flex: 1,
              height: "var(--v2-s-1)",
              borderRadius: "var(--v2-r-pill)",
              background: "var(--v2-paper-2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (completedSetsCount / Math.max(1, totalSetsCount)) * 100)}%`,
                height: "100%",
                background: complete ? "var(--v2-c-success)" : "var(--v2-accent)",
                transition: "width 200ms ease, background 200ms ease",
              }}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="v2-font-display"
        style={{
          width: "100%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--v2-s-2)",
          padding: "var(--v2-s-3) var(--v2-s-4)",
          borderRadius: "var(--v2-r-3)",
          background: saving ? "var(--v2-paper-2)" : "var(--v2-c-success)",
          color: saving ? "var(--v2-ink-3)" : "var(--v2-ink-on-accent)",
          border: "none",
          cursor: saving ? "not-allowed" : "pointer",
          fontWeight: 700,
          minHeight: "var(--v2-s-8)",
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "var(--v2-t-18)" }}
          aria-hidden
        >
          done_all
        </span>
        {saving
          ? copy.saveInProgress
          : isEditingExistingLog
            ? copy.saveEdited
            : copy.saveCreate}
      </button>
    </StickyActionBar>
  );
}

/** 휴식 줄의 소형 액션. No-Line Rule에 맞춰 테두리 없이 배경 톤으로만 구분한다. */
function RestChipButton({
  label,
  text,
  onClick,
}: {
  label: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="v2-mono-label v2-tap-44"
      style={{
        position: "relative",
        flexShrink: 0,
        // 세로 패딩 0 — 휴식 줄이 진행률 줄보다 높아지면 저장바가 커져 레이아웃이
        // 흔들린다(계획서 §3.4의 "높이 불변"). 실제 터치 영역은 v2-tap-44의 ::after가 준다.
        padding: "0px var(--v2-s-2)",
        borderRadius: "var(--v2-r-pill)",
        border: "none",
        background: "var(--v2-paper-2)",
        color: "var(--v2-ink-2)",
        cursor: "pointer",
        appearance: "none",
      }}
    >
      {text}
    </button>
  );
}
