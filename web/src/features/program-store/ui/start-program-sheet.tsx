"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { V2Card, V2Chip, V2SecondaryBtn } from "@/components/v2/primitives";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import { formatProgramDisplayName } from "@/features/program-store/model/view";
import {
  ref5StartConfigValidationMessage,
  type Ref5StartField,
  type StartProgramDraft,
} from "@/features/program-store/model/use-program-store-start-program-controller";
import { deriveRef5AuxiliaryCaps } from "@workout/core/program-engine/ref5";

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
  onApplyRecommendation,
}: StartProgramSheetProps) {
  const isRef5 = draft?.mode === "REF5";
  const ref5Starts = draft?.ref5Config?.startingValuesKg;
  const ref5Refs = draft?.ref5Config?.controlRefsKg;
  const ref5StartingRows: Array<[Ref5StartField, string, number]> = ref5Starts
    ? [
        ["sqH3Kg", locale === "ko" ? "SQ H3 · 3×3" : "SQ H3 · 3×3", ref5Starts.sqH3Kg],
        ["bpFocusKg", locale === "ko" ? "BP 집중 · 3×3" : "BP Focus · 3×3", ref5Starts.bpFocusKg],
        ["pullFocusTotalKg", locale === "ko" ? "PULL 집중 · 총중량 3×3" : "PULL Focus · Total Load 3×3", ref5Starts.pullFocusTotalKg],
        ["deadliftKg", locale === "ko" ? "DL · 2×4" : "DL · 2×4", ref5Starts.deadliftKg],
        ["ohpKg", locale === "ko" ? "OHP · 2×6" : "OHP · 2×6", ref5Starts.ohpKg],
      ]
    : [];
  const ref5Editable = isRef5 && !draft?.existingPlanId;
  const ref5Caps = ref5Starts ? deriveRef5AuxiliaryCaps(ref5Starts) : null;
  const ref5ValidationMessage = draft?.ref5Config
    ? ref5StartConfigValidationMessage(draft.ref5Config, locale)
    : null;

  return (
    <BottomSheet
      open={Boolean(draft)}
      title={
        isRef5
          ? locale === "ko"
            ? "REF5 시작 중량 설정"
            : "Set REF5 Starting Loads"
          : locale === "ko"
            ? "시작 전 1RM 입력"
            : "Enter 1RM Before Starting"
      }
      description={
        isRef5
          ? locale === "ko"
            ? "1RM·TM이 아니라 다섯 종목의 직접 작업 기준을 2.5kg 단위로 정합니다."
            : "Set five direct work baselines on the 2.5 kg grid, not 1RM or training max."
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
                    ? "설정한 중량으로 시작"
                    : "1RM 저장 후 시작"
                  : isRef5
                    ? "Start with These Loads"
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
          {isRef5 && ref5Starts && ref5Refs ? (
            <>
              <V2Card padding="var(--v2-s-4)" tone="inset">
                <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
                  {locale === "ko" ? "시작 작업 기준 (kg)" : "Starting Work Baselines (kg)"}
                </span>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--v2-s-3)",
                    marginTop: "var(--v2-s-2)",
                  }}
                >
                  {ref5StartingRows.map(([field, label, value]) => (
                    <div key={field} style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
                      <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
                        {label}
                      </span>
                      {ref5Editable ? (
                        <NumberKeypadField
                          ariaLabel={`${label} kg`}
                          value={value}
                          min={2.5}
                          max={500}
                          step={2.5}
                          allowDecimal
                          onChange={(next) => onChangeRef5StartingValue(field, next)}
                        />
                      ) : (
                        <strong className="v2-small" style={{ color: "var(--v2-ink)" }}>
                          {formatKg(value)} kg
                        </strong>
                      )}
                    </div>
                  ))}
                </div>
              </V2Card>
              {ref5Caps ? (
                <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
                  {locale === "ko"
                    ? `현재 보조 상한: DL ${formatKg(ref5Caps.deadliftMaxKg)}kg · OHP ${formatKg(ref5Caps.ohpMaxKg)}kg`
                    : `Current auxiliary caps: DL ${formatKg(ref5Caps.deadliftMaxKg)} kg · OHP ${formatKg(ref5Caps.ohpMaxKg)} kg`}
                </p>
              ) : null}
              {ref5ValidationMessage ? (
                <p className="v2-small" role="alert" style={{ color: "var(--v2-danger)", margin: 0 }}>
                  {ref5ValidationMessage}
                </p>
              ) : null}
              {!ref5Editable ? (
                <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
                  {locale === "ko"
                    ? "기존 REF5 계획의 시작 중량은 기록 재계산 기준이므로 변경하지 않습니다."
                    : "An existing REF5 plan keeps its original loads because replay depends on them."}
                </p>
              ) : null}
              <V2Card padding="var(--v2-s-4)" tone="inset">
                <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
                  {locale === "ko" ? "시작 제어 REF (kg)" : "Starting Control REF (kg)"}
                </span>
                <p className="v2-small" style={{ color: "var(--v2-ink)", margin: "var(--v2-s-2) 0 0" }}>
                  SQ {formatKg(ref5Refs.sqKg)} · PULL {formatKg(ref5Refs.pullTotalKg)} · BP{" "}
                  {formatKg(ref5Refs.bpKg)} · DL {formatKg(ref5Refs.deadliftKg)} · OHP{" "}
                  {formatKg(ref5Refs.ohpKg)}
                </p>
              </V2Card>
              <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
                {locale === "ko"
                  ? "PULL은 체중+추가중량의 총중량입니다. 값은 정본으로 저장되며 1RM·e1RM·TM을 계산하지 않습니다."
                  : "PULL is total load: bodyweight plus added load. Values are canonical; no 1RM, e1RM, or TM is calculated."}
              </p>
            </>
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
