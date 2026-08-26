"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { V2Card, V2Chip, V2SecondaryBtn, V2Segmented } from "@/components/v2/primitives";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import { formatProgramDisplayName } from "@/features/program-store/model/view";
import {
  ref5E1rmValidationMessage,
  ref5StartConfigValidationMessage,
  type Ref5StartField,
  type StartProgramDraft,
  type StartRestartMode,
} from "@/features/program-store/model/use-program-store-start-program-controller";
import { Ref5StartSetup } from "@/features/program-store/ui/ref5-start-setup";
import type { Ref5Lift } from "@workout/core/program-engine/ref5";
import { REF5_PROTOCOL_VERSION } from "@workout/core/program-engine/ref5-protocol-version";

const BottomSheet = dynamic(
  () => import("@/components/ui/bottom-sheet").then((mod) => mod.BottomSheet),
  { ssr: false },
);

function formatKg(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatLastPerformed(value: string | null, locale: "ko" | "en") {
  if (!value) return locale === "ko" ? "수행 기록 없음" : "No sessions yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "ko" ? "수행 기록 없음" : "No sessions yet";
  return date.toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US");
}

type StartProgramSheetProps = {
  locale: "ko" | "en";
  draft: StartProgramDraft | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChangeRestartMode: (mode: StartRestartMode) => void;
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
  onChangeRestartMode,
  onChangeOneRmInput,
  onChangeRef5StartingValue,
  onChangeRef5SetupMode,
  onChangeRef5E1rmInput,
  onApplyRecommendation,
}: StartProgramSheetProps) {
  const isRef5 = draft?.mode === "REF5";
  // 이어서 하기는 기존 플랜으로 이동만 하므로 시작 기준을 검증할 필요가 없다.
  const isContinue = draft?.restartMode === "CONTINUE" && Boolean(draft?.existingPlanId);
  const ref5ValidationMessage =
    draft?.ref5Config && !isContinue
      ? draft.ref5SetupMode === "E1RM"
        ? ref5E1rmValidationMessage(draft.ref5E1rmInputs, locale)
        : ref5StartConfigValidationMessage(draft.ref5Config, locale)
      : null;

  return (
    <BottomSheet
      open={Boolean(draft)}
      title={
        isContinue
          ? locale === "ko"
            ? "진행 중인 플랜 이어서 하기"
            : "Continue Your Plan"
          : isRef5
            ? locale === "ko"
              ? "REF5 시작 기준 설정"
              : "Set REF5 Starting Baseline"
            : locale === "ko"
              ? "시작 전 1RM 입력"
              : "Enter 1RM Before Starting"
      }
      description={
        isContinue
          ? locale === "ko"
            ? "이 프로그램의 플랜이 이미 있습니다. 진행한 무게와 주차를 그대로 이어갑니다."
            : "You already have a plan for this program. Your loads and week carry over."
          : isRef5
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
              ariaLabel: isContinue
                ? locale === "ko"
                  ? "이어서 하기"
                  : "Continue"
                : saving
                  ? locale === "ko"
                    ? isRef5
                      ? "새 플랜 시작 중"
                      : "새 플랜 만드는 중"
                    : isRef5
                      ? "Starting new plan"
                      : "Creating new plan"
                  : locale === "ko"
                    ? isRef5
                      ? "새 플랜으로 시작"
                      : "1RM 저장 후 새 플랜 시작"
                    : isRef5
                      ? "Start New Plan"
                      : "Save 1RM and Start New Plan",
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
                  ? `REF5 v${draft.ref5Config?.protocolVersion ?? REF5_PROTOCOL_VERSION}`
                  : `TM ${Math.round(draft.tmPercent * 100)}%`}
              </V2Chip>
            </div>
          </V2Card>

          {draft.existingPlanId ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-3)" }}>
              <V2Segmented<StartRestartMode>
                ariaLabel={locale === "ko" ? "시작 방식" : "Start mode"}
                value={draft.restartMode}
                onChange={onChangeRestartMode}
                options={[
                  {
                    value: "CONTINUE",
                    label: locale === "ko" ? "이어서 하기" : "Continue",
                  },
                  {
                    value: "NEW",
                    label: locale === "ko" ? "새로 시작" : "Start New",
                  },
                ]}
                style={{ alignSelf: "flex-start" }}
              />
              <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
                {draft.restartMode === "CONTINUE"
                  ? locale === "ko"
                    ? `'${draft.existingPlanName ?? ""}'을(를) 그대로 이어갑니다. 무게를 바꾸려면 플랜 관리에서 현재 TM을 조정하세요.`
                    : `Continues '${draft.existingPlanName ?? ""}' as is. To change loads, adjust the current TM in plan management.`
                  : locale === "ko"
                    ? "새 플랜이 만들어지고, 기존 플랜의 기록과 진행 상태는 그대로 남습니다."
                    : "A new plan is created. Your existing plan keeps its logs and progress."}
              </p>
            </div>
          ) : null}

          {isContinue ? (
            // tone="inset" — 시트 패널이 --v2-paper라 기본 톤(paper)이면 ΔE=0으로
            // 카드가 사라진다. 시트 안에서는 사다리를 한 칸 내린다.
            <V2Card padding="var(--v2-s-4)" tone="inset">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
                <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
                  {locale === "ko" ? "현재 진행 상태" : "Current Progress"}
                </span>
                {draft.existingProgressStatus === "loading" ? (
                  <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
                    {locale === "ko" ? "불러오는 중..." : "Loading..."}
                  </span>
                ) : draft.existingProgress?.targets.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
                    {draft.existingProgress.targets.map((target) => (
                      <div
                        key={target.label}
                        style={{ display: "flex", justifyContent: "space-between", gap: "var(--v2-s-2)" }}
                      >
                        <span className="v2-body" style={{ color: "var(--v2-ink-2)" }}>
                          {target.label}
                        </span>
                        <span className="v2-body" style={{ fontWeight: 700, color: "var(--v2-ink)" }}>
                          {formatKg(target.workKg)}kg
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
                    {locale === "ko"
                      ? "아직 진행된 무게가 없습니다. 첫 세션부터 시작합니다."
                      : "No progressed loads yet. You will start from the first session."}
                  </span>
                )}
                <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
                  {locale === "ko" ? "마지막 수행" : "Last session"}
                  {" · "}
                  {formatLastPerformed(draft.existingProgress?.lastPerformedAt ?? null, locale)}
                </span>
              </div>
            </V2Card>
          ) : null}

          {isContinue ? null : isRef5 ? (
            <Ref5StartSetup
              locale={locale}
              draft={draft}
              onChangeSetupMode={onChangeRef5SetupMode}
              onChangeE1rmInput={onChangeRef5E1rmInput}
              onChangeStartingValue={onChangeRef5StartingValue}
            />
          ) : null}
          {!isContinue && !isRef5 && draft.recommendationStatus === "loading" ? (
            <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
              {locale === "ko"
                ? "운동 종목별 1RM 통계 기반 추천값 계산 중..."
                : "Calculating recommendations from your 1RM history..."}
            </p>
          ) : null}
          {!isContinue && !isRef5 && draft.recommendationMessage ? (
            <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
              {draft.recommendationMessage}
            </p>
          ) : null}
          {!isContinue && !isRef5 ? draft.targets.map((target) => (
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
