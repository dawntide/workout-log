"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { V2Card, V2Chip, V2SecondaryBtn } from "@/components/v2/primitives";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import { formatProgramDisplayName } from "@/features/program-store/model/view";
import {
  ref5E1rmValidationMessage,
  ref5StartConfigValidationMessage,
  type Ref5StartField,
  type StartProgramDraft,
} from "@/features/program-store/model/use-program-store-start-program-controller";
import { Ref5StartSetup } from "@/features/program-store/ui/ref5-start-setup";
import type { Ref5Lift } from "@workout/core/program-engine/ref5";

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
  onChangeRef5StartingValue: (field: Ref5StartField, value: number) => void;
  onChangeRef5SetupMode: (mode: "E1RM" | "DIRECT") => void;
  onChangeRef5E1rmInput: (lift: Ref5Lift, value: number) => void;
  onApplyRecommendation: (targetKey: string) => void;
};

export const StartProgramSheet = memo(function StartProgramSheet({
  locale,
  draft,
  saving,
  onClose,
  onSubmit,
  onChangeOneRmInput,
  onChangeRef5StartingValue,
  onChangeRef5SetupMode,
  onChangeRef5E1rmInput,
  onApplyRecommendation,
}: StartProgramSheetProps) {
  const isRef5 = draft?.mode === "REF5";
  const ref5ValidationMessage = draft?.ref5Config
    ? draft.ref5SetupMode === "E1RM" && !draft.existingPlanId
      ? ref5E1rmValidationMessage(draft.ref5E1rmInputs, locale)
      : ref5StartConfigValidationMessage(draft.ref5Config, locale)
    : null;

  return (
    <BottomSheet
      open={Boolean(draft)}
      title={
        isRef5
          ? locale === "ko"
            ? "REF5 시작 기준 설정"
            : "Set REF5 Starting Baseline"
          : locale === "ko"
            ? "시작 전 1RM 입력"
            : "Enter 1RM Before Starting"
      }
      description={
        isRef5
          ? locale === "ko"
            ? "최근 기록이나 e1RM으로 첫 작업중량을 정합니다. 실측 1RM 테스트는 필요 없습니다."
            : "Use recent records or e1RM to set the first work loads. No tested 1RM is required."
          : locale === "ko"
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
                  ? isRef5
                    ? "REF5 시작 중"
                    : "1RM 저장 후 시작 중"
                  : isRef5
                    ? "Starting REF5"
                    : "Saving 1RM and starting"
                : locale === "ko"
                  ? isRef5
                    ? "첫 처방으로 시작"
                    : "1RM 저장 후 시작"
                  : isRef5
                    ? "Start First Prescription"
                    : "Save 1RM and Start",
              onPress: onSubmit,
              disabled: saving || Boolean(ref5ValidationMessage),
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
                className="v2-body"
                style={{ fontWeight: 700, color: "var(--v2-ink)" }}
              >
                {formatProgramDisplayName(draft.template.name)}
              </strong>
              <V2Chip tone="weight">
                {isRef5
                  ? `REF5 v${draft.ref5Config?.protocolVersion ?? "1.2"}`
                  : `TM ${Math.round(draft.tmPercent * 100)}%`}
              </V2Chip>
            </div>
          </V2Card>
          {isRef5 ? (
            <Ref5StartSetup
              locale={locale}
              draft={draft}
              onChangeSetupMode={onChangeRef5SetupMode}
              onChangeE1rmInput={onChangeRef5E1rmInput}
              onChangeStartingValue={onChangeRef5StartingValue}
            />
          ) : null}
          {!isRef5 && draft.recommendationStatus === "loading" ? (
            <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
              {locale === "ko"
                ? "운동 종목별 1RM 통계 기반 추천값 계산 중..."
                : "Calculating recommendations from your 1RM history..."}
            </p>
          ) : null}
          {!isRef5 && draft.recommendationMessage ? (
            <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
              {draft.recommendationMessage}
            </p>
          ) : null}
          {!isRef5 ? draft.targets.map((target) => (
            <div
              key={target.key}
              style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}
            >
              <span
                className="v2-eyebrow"
                style={{
                  color: "var(--v2-ink-2)",
                }}
              >
                {target.label} 1RM (kg)
              </span>
              <NumberKeypadField
                ariaLabel={`${target.label} 1RM`}
                value={Number(draft.oneRmInputs[target.key]) || 0}
                min={0}
                max={500}
                step={0.5}
                allowDecimal
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
                  <V2SecondaryBtn onClick={() => onApplyRecommendation(target.key)}>
                    {locale === "ko" ? "추천값 적용" : "Apply Recommendation"}
                  </V2SecondaryBtn>
                </div>
              ) : null}
            </div>
          )) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
});
