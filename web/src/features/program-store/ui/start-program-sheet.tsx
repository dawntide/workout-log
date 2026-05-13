"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { V2Card } from "@/components/v2/primitives";
import { NumberPickerField } from "@/components/ui/number-picker-sheet";
import { formatProgramDisplayName } from "@/features/program-store/model/view";
import type { StartProgramDraft } from "@/features/program-store/model/use-program-store-start-program-controller";

const BottomSheet = dynamic(
  () => import("@/components/ui/bottom-sheet").then((mod) => mod.BottomSheet),
  { ssr: false },
);

function formatKg(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

type StartProgramSheetProps = {
  locale: "ko" | "en";
  draft: StartProgramDraft | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChangeOneRmInput: (targetKey: string, value: number) => void;
  onApplyRecommendation: (targetKey: string) => void;
};

export const StartProgramSheet = memo(function StartProgramSheet({
  locale,
  draft,
  saving,
  onClose,
  onSubmit,
  onChangeOneRmInput,
  onApplyRecommendation,
}: StartProgramSheetProps) {
  return (
    <BottomSheet
      open={Boolean(draft)}
      title={locale === "ko" ? "시작 전 1RM 입력" : "Enter 1RM Before Starting"}
      description={
        locale === "ko"
          ? "모든 종목의 1RM 입력이 필수입니다."
          : "A 1RM entry is required for each lift."
      }
      onClose={onClose}
      closeLabel={locale === "ko" ? "닫기" : "Close"}
      primaryAction={
        draft
          ? {
              ariaLabel: saving
                ? locale === "ko"
                  ? "1RM 저장 후 시작 중"
                  : "Saving 1RM and starting"
                : locale === "ko"
                  ? "1RM 저장 후 시작"
                  : "Save 1RM and Start",
              onPress: onSubmit,
              disabled: saving,
            }
          : null
      }
      footer={null}
    >
      {draft ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-4)",
          }}
        >
          <V2Card padding="var(--v2-s-4)" tone="accent">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--v2-s-2)",
              }}
            >
              <strong
                style={{
                  fontFamily: "var(--font-headline-family)",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "var(--v2-ink)",
                }}
              >
                {formatProgramDisplayName(draft.template.name)}
              </strong>
              <span className="label label-tag-progression label-sm">
                TM {Math.round(draft.tmPercent * 100)}%
              </span>
            </div>
          </V2Card>
          {draft.recommendationStatus === "loading" ? (
            <p
              style={{
                fontSize: "13px",
                color: "var(--v2-ink-2)",
                margin: 0,
              }}
            >
              {locale === "ko"
                ? "운동 종목별 1RM 통계 기반 추천값 계산 중..."
                : "Calculating recommendations from your 1RM history..."}
            </p>
          ) : null}
          {draft.recommendationMessage ? (
            <p
              style={{
                fontSize: "13px",
                color: "var(--v2-ink-2)",
                margin: 0,
              }}
            >
              {draft.recommendationMessage}
            </p>
          ) : null}
          {draft.targets.map((target) => (
            <div
              key={target.key}
              style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}
            >
              <span
                style={{
                  fontFamily: "var(--font-label-family)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--v2-ink-2)",
                }}
              >
                {target.label} 1RM (kg)
              </span>
              <NumberPickerField
                label={`${target.label} 1RM`}
                value={Number(draft.oneRmInputs[target.key]) || 0}
                min={0}
                max={500}
                step={0.5}
                unit="kg"
                variant="workout-number"
                formatValue={(value) => value.toFixed(1)}
                onChange={(value) => onChangeOneRmInput(target.key, value)}
              />
              {draft.recommendations[target.key] ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    marginTop: "6px",
                  }}
                >
                  <span style={{ fontSize: "0.85rem", color: "var(--v2-ink-2)" }}>
                    {locale === "ko" ? "추천" : "Recommended"}{" "}
                    {formatKg(draft.recommendations[target.key].recommendedKg)}kg
                    {" · "}
                    {locale === "ko" ? "최근 e1RM" : "Latest e1RM"}{" "}
                    {formatKg(draft.recommendations[target.key].latestE1rmKg)}kg
                  </span>
                  <button
                    type="button"
                    className="btn btn-inline-action btn-inline-action-primary"
                    onClick={() => onApplyRecommendation(target.key)}
                  >
                    {locale === "ko" ? "추천값 적용" : "Apply Recommendation"}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </BottomSheet>
  );
});
