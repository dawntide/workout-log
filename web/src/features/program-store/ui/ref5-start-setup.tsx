"use client";

import { V2Card, V2Segmented } from "@/components/v2/primitives";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import {
  ref5E1rmValidationMessage,
  ref5StartConfigValidationMessage,
  type Ref5StartField,
  type StartProgramDraft,
} from "@/features/program-store/model/use-program-store-start-program-controller";
import { deriveRef5AuxiliaryCaps, type Ref5Lift } from "@workout/core/program-engine/ref5";

type Ref5StartSetupProps = {
  locale: "ko" | "en";
  draft: StartProgramDraft;
  onChangeSetupMode: (mode: "E1RM" | "DIRECT") => void;
  onChangeE1rmInput: (lift: Ref5Lift, value: number) => void;
  onChangeStartingValue: (field: Ref5StartField, value: number) => void;
};

const E1RM_ROWS = [
  ["SQ", "SQ", "Squat"],
  ["BP", "BP", "Bench Press"],
  ["PULL", "PULL 총중량", "PULL Total Load"],
  ["DL", "DL", "Deadlift"],
  ["OHP", "OHP", "Overhead Press"],
] as const satisfies ReadonlyArray<readonly [Ref5Lift, string, string]>;

function formatKg(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function Ref5StartSetup({
  locale,
  draft,
  onChangeSetupMode,
  onChangeE1rmInput,
  onChangeStartingValue,
}: Ref5StartSetupProps) {
  const config = draft.ref5Config;
  if (!config) return null;

  const starts = config.startingValuesKg;
  const refs = config.controlRefsKg;
  const editable = !draft.existingPlanId;
  const caps = deriveRef5AuxiliaryCaps(starts);
  const directRows: Array<[Ref5StartField, string, number]> = [
    ["sqH3Kg", "SQ · 3×3", starts.sqH3Kg],
    ["bpFocusKg", locale === "ko" ? "BP 집중 · 3×3" : "BP Focus · 3×3", starts.bpFocusKg],
    [
      "pullFocusTotalKg",
      locale === "ko" ? "PULL 집중 · 총중량 3×3" : "PULL Focus · Total Load 3×3",
      starts.pullFocusTotalKg,
    ],
    ["deadliftKg", "DL · 2×4", starts.deadliftKg],
    ["ohpKg", "OHP · 2×6", starts.ohpKg],
  ];
  const calibrationMessage = ref5E1rmValidationMessage(draft.ref5E1rmInputs, locale);
  const directMessage = ref5StartConfigValidationMessage(config, locale);

  if (!editable) {
    return (
      <>
        <V2Card padding="var(--v2-s-4)" tone="inset">
          <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
            {locale === "ko" ? "이 계획의 최초 처방" : "This Plan's Initial Prescription"}
          </span>
          <p className="v2-small" style={{ color: "var(--v2-ink)", margin: "var(--v2-s-2) 0 0" }}>
            {directRows.map(([, label, value]) => `${label} ${formatKg(value)}kg`).join(" · ")}
          </p>
        </V2Card>
        <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
          {locale === "ko"
            ? "기존 계획의 최초 중량은 기록 재계산 기준이므로 변경하지 않습니다."
            : "Existing initial loads remain immutable because replay depends on them."}
        </p>
      </>
    );
  }

  return (
    <>
      <V2Segmented
        ariaLabel={locale === "ko" ? "REF5 시작 기준 입력 방식" : "REF5 starting input method"}
        value={draft.ref5SetupMode}
        onChange={onChangeSetupMode}
        options={[
          {
            value: "E1RM",
            label: locale === "ko" ? "최근 기록 · 추정 1RM" : "Recent Records · e1RM",
          },
          {
            value: "DIRECT",
            label: locale === "ko" ? "직접 입력 · 고급" : "Direct · Advanced",
          },
        ]}
        size="sm"
        style={{ width: "100%" }}
      />

      {draft.ref5SetupMode === "E1RM" ? (
        <>
          <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
            {draft.recommendationStatus === "loading"
              ? locale === "ko"
                ? "최근 8주 기록을 확인하는 중..."
                : "Checking the last 8 weeks of training records..."
              : draft.recommendationMessage}
          </p>
          <V2Card padding="var(--v2-s-4)" tone="inset">
            <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
              {locale === "ko" ? "추정 1RM (e1RM, kg)" : "Baseline e1RM (kg)"}
            </span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--v2-s-3)",
                marginTop: "var(--v2-s-2)",
              }}
            >
              {E1RM_ROWS.map(([lift, koLabel, enLabel]) => {
                const recommendation = draft.ref5RecommendationItems[lift];
                const label = locale === "ko" ? koLabel : enLabel;
                return (
                  <div key={lift} style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
                    <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
                      {label}
                    </span>
                    <NumberKeypadField
                      ariaLabel={`${label} ${locale === "ko" ? "추정 1RM (e1RM)" : "baseline e1RM"}`}
                      value={draft.ref5E1rmInputs[lift]}
                      min={0}
                      max={1000}
                      step={0.1}
                      decimals={1}
                      allowDecimal
                      onChange={(next) => onChangeE1rmInput(lift, next)}
                    />
                    <span className="v2-caption" style={{ color: "var(--v2-ink-3)" }}>
                      {recommendation
                        ? locale === "ko"
                          ? `최근 8주 최고 · ${formatKg(recommendation.recordWeightKg)}kg×${recommendation.recordReps} → e1RM ${formatKg(recommendation.e1rmKg)}kg · ${recommendation.recordDate}`
                          : `8-week best · ${formatKg(recommendation.recordWeightKg)}kg×${recommendation.recordReps} → e1RM ${formatKg(recommendation.e1rmKg)}kg · ${recommendation.recordDate}`
                        : locale === "ko"
                          ? "사용할 기록이 없으면 알고 있는 추정 1RM(e1RM)을 입력하세요."
                          : "Enter your known estimated 1RM when no eligible record is available."}
                    </span>
                  </div>
                );
              })}
            </div>
          </V2Card>

          {draft.recommendationStatus !== "loading" && calibrationMessage ? (
            <p className="v2-small" role="alert" style={{ color: "var(--v2-danger)", margin: 0 }}>
              {calibrationMessage}
            </p>
          ) : null}

          {draft.ref5Calibration ? (
            <V2Card padding="var(--v2-s-4)" tone="accent">
              <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
                {locale === "ko" ? "계산된 첫 처방" : "Calculated First Prescription"}
              </span>
              <p className="v2-small" style={{ color: "var(--v2-ink)", margin: "var(--v2-s-2) 0 0" }}>
                {directRows.map(([, label, value]) => `${label} ${formatKg(value)}kg`).join(" · ")}
              </p>
              {Object.entries(draft.ref5Calibration.capAdjustments).map(([lift, adjustment]) => (
                <p key={lift} className="v2-caption" style={{ color: "var(--v2-ink-2)", margin: "var(--v2-s-2) 0 0" }}>
                  {locale === "ko"
                    ? `${lift}는 보조 상한에 따라 ${formatKg(adjustment.fromKg)}→${formatKg(adjustment.toKg)}kg로 조정됩니다.`
                    : `${lift} is adjusted from ${formatKg(adjustment.fromKg)} to ${formatKg(adjustment.toKg)} kg by the auxiliary cap.`}
                </p>
              ))}
            </V2Card>
          ) : null}

          <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
            {locale === "ko"
              ? "e1RM은 최초 중량 추천에만 사용합니다. 실측 1RM 테스트나 TM 상태를 만들지 않으며, 시작 후에는 실제 수행 결과만으로 진행합니다."
              : "e1RM is used only for the initial recommendation. It creates no tested 1RM or TM state; progression uses actual outcomes after start."}
          </p>
        </>
      ) : (
        <>
          <V2Card padding="var(--v2-s-4)" tone="inset">
            <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
              {locale === "ko" ? "첫 작업중량 직접 입력 (kg)" : "Direct First Work Loads (kg)"}
            </span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--v2-s-3)",
                marginTop: "var(--v2-s-2)",
              }}
            >
              {directRows.map(([field, label, value]) => (
                <div key={field} style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
                  <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
                    {label}
                  </span>
                  <NumberKeypadField
                    ariaLabel={`${label} kg`}
                    value={value}
                    min={2.5}
                    max={500}
                    step={2.5}
                    allowDecimal
                    onChange={(next) => onChangeStartingValue(field, next)}
                  />
                </div>
              ))}
            </div>
          </V2Card>
          <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0 }}>
            {locale === "ko"
              ? `보조 상한: DL ${formatKg(caps.deadliftMaxKg)}kg · OHP ${formatKg(caps.ohpMaxKg)}kg. PULL은 체중+추가중량의 총중량입니다.`
              : `Auxiliary caps: DL ${formatKg(caps.deadliftMaxKg)} kg · OHP ${formatKg(caps.ohpMaxKg)} kg. PULL uses bodyweight plus added load.`}
          </p>
          {directMessage ? (
            <p className="v2-small" role="alert" style={{ color: "var(--v2-danger)", margin: 0 }}>
              {directMessage}
            </p>
          ) : null}
          <details>
            <summary className="v2-small" style={{ color: "var(--v2-ink-2)", cursor: "pointer" }}>
              {locale === "ko" ? "내부 제어 REF 보기" : "Show internal control REFs"}
            </summary>
            <p className="v2-caption" style={{ color: "var(--v2-ink-3)", margin: "var(--v2-s-2) 0 0" }}>
              SQ {formatKg(refs.sqKg)} · BP {formatKg(refs.bpKg)} · PULL {formatKg(refs.pullTotalKg)} · DL{" "}
              {formatKg(refs.deadliftKg)} · OHP {formatKg(refs.ohpKg)}
            </p>
          </details>
        </>
      )}
    </>
  );
}
