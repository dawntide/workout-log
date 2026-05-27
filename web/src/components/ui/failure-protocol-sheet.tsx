"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import {
  V2Card,
  V2Hairline,
  V2IconBtn,
  V2Inline,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2Segmented,
  V2Stack,
} from "@/components/v2/primitives";
import { BottomSheet } from "./bottom-sheet";

export type FailureProtocolMode = "increase" | "hold" | "reset";

export type FailureProtocolTarget = {
  key: string;
  label: string;
  currentWorkKg: number;
  recommendedIncreaseKg: number;
  recommendedResetKg: number;
  recommendedMode: FailureProtocolMode;
  reasonLabel: string;
};

export type FailureProtocolDecision = {
  mode: FailureProtocolMode;
  workKg: number;
};

export type FailureProtocolResult =
  | { choice: "cancel" }
  | { choice: "save"; decisions: Record<string, FailureProtocolDecision> };

type FailureProtocolSheetProps = {
  open: boolean;
  title: string;
  description: string;
  /** block-completion: Operator/531 사이클 완료 / greyskull-reset: 연속 실패 임계 도달 */
  mode: "block-completion" | "greyskull-reset";
  targets: FailureProtocolTarget[];
  onSelect: (result: FailureProtocolResult) => void;
};

const STEP_KG = 2.5;

function snapTo2p5(value: number) {
  return Math.max(0, Math.round(value / STEP_KG) * STEP_KG);
}

function formatKg(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, "");
}

function recommendedNextKg(target: FailureProtocolTarget, mode: FailureProtocolMode) {
  if (mode === "increase") return snapTo2p5(target.currentWorkKg + target.recommendedIncreaseKg);
  if (mode === "reset") return snapTo2p5(target.recommendedResetKg);
  return snapTo2p5(target.currentWorkKg);
}

function buildDefaultDecisions(
  targets: FailureProtocolTarget[],
): Record<string, FailureProtocolDecision> {
  const out: Record<string, FailureProtocolDecision> = {};
  for (const t of targets) {
    out[t.key] = {
      mode: t.recommendedMode,
      workKg: recommendedNextKg(t, t.recommendedMode),
    };
  }
  return out;
}

export function FailureProtocolSheet({
  open,
  title,
  description,
  mode,
  targets,
  onSelect,
}: FailureProtocolSheetProps) {
  const { locale } = useLocale();
  const isBlockCompletion = mode === "block-completion";

  const [decisions, setDecisions] = useState<Record<string, FailureProtocolDecision>>(() =>
    buildDefaultDecisions(targets),
  );

  useEffect(() => {
    if (!open) return;
    setDecisions(buildDefaultDecisions(targets));
  }, [open, targets]);

  const setTargetMode = (target: FailureProtocolTarget, nextMode: FailureProtocolMode) => {
    setDecisions((prev) => ({
      ...prev,
      [target.key]: {
        mode: nextMode,
        workKg: recommendedNextKg(target, nextMode),
      },
    }));
  };

  const adjustTarget = (key: string, delta: number) => {
    setDecisions((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: { ...current, workKg: snapTo2p5(current.workKg + delta) },
      };
    });
  };

  const resetTarget = (target: FailureProtocolTarget) => {
    setDecisions((prev) => {
      const current = prev[target.key];
      const currentMode = current?.mode ?? target.recommendedMode;
      return {
        ...prev,
        [target.key]: { mode: currentMode, workKg: recommendedNextKg(target, currentMode) },
      };
    });
  };

  const handleSave = () => {
    onSelect({ choice: "save", decisions });
  };

  const modeOptions = useMemo(
    () =>
      [
        {
          value: "increase" as const,
          label: locale === "ko" ? "증량" : "Increase",
          ariaLabel: locale === "ko" ? "증량" : "Increase",
        },
        {
          value: "hold" as const,
          label: locale === "ko" ? "유지" : "Hold",
          ariaLabel: locale === "ko" ? "유지" : "Hold",
        },
        {
          value: "reset" as const,
          label: locale === "ko" ? "감소" : "Reduce",
          ariaLabel: locale === "ko" ? "감소" : "Reduce",
        },
      ],
    [locale],
  );

  return (
    <BottomSheet
      open={open}
      title={title}
      description=""
      onClose={() => onSelect({ choice: "cancel" })}
      closeLabel={locale === "ko" ? "닫기" : "Close"}
      footer={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-1)",
            width: "100%",
          }}
        >
          <V2PrimaryBtn full onClick={handleSave}>
            {locale === "ko" ? "저장" : "Save"}
          </V2PrimaryBtn>
          <V2SecondaryBtn full onClick={() => onSelect({ choice: "cancel" })}>
            {locale === "ko" ? "취소" : "Cancel"}
          </V2SecondaryBtn>
        </div>
      }
    >
      <V2Stack gap={4}>
        {description || targets.length > 0 ? (
          <V2Card tone={isBlockCompletion ? "inset" : "danger"} padding="var(--v2-s-4)">
            <V2Stack gap={2}>
              {description ? (
                <p className="v2-body" style={{ whiteSpace: "pre-line", margin: 0 }}>
                  {description}
                </p>
              ) : null}
              {targets.length > 0 ? (
                <V2Stack gap={1}>
                  {targets.map((target) => {
                    const recommendedNext = recommendedNextKg(target, target.recommendedMode);
                    const delta = recommendedNext - target.currentWorkKg;
                    const modeLabel =
                      target.recommendedMode === "increase"
                        ? locale === "ko"
                          ? "증량"
                          : "Increase"
                        : target.recommendedMode === "reset"
                          ? locale === "ko"
                            ? "감소"
                            : "Reduce"
                          : locale === "ko"
                            ? "유지"
                            : "Hold";
                    const deltaText =
                      delta === 0
                        ? locale === "ko"
                          ? "유지"
                          : "hold"
                        : `${delta > 0 ? "+" : ""}${formatKg(delta)}kg`;
                    return (
                      <p
                        key={target.key}
                        className="v2-small"
                        style={{ margin: 0, color: "var(--v2-ink-2)" }}
                      >
                        • {target.label}: {formatKg(target.currentWorkKg)}kg → {formatKg(recommendedNext)}kg ({deltaText}, {modeLabel} {locale === "ko" ? "권장" : "recommended"}
                        {target.reasonLabel ? ` · ${target.reasonLabel}` : ""})
                      </p>
                    );
                  })}
                </V2Stack>
              ) : null}
            </V2Stack>
          </V2Card>
        ) : null}

        <V2Stack gap={2}>
          {targets.map((target, index) => {
            const current = decisions[target.key] ?? {
              mode: target.recommendedMode,
              workKg: recommendedNextKg(target, target.recommendedMode),
            };
            const recommendedWorkKg = recommendedNextKg(target, current.mode);
            const delta = current.workKg - target.currentWorkKg;
            const isRecommended =
              current.mode === target.recommendedMode &&
              current.workKg === recommendedNextKg(target, target.recommendedMode);

            const deltaLabel =
              delta === 0
                ? locale === "ko"
                  ? "유지"
                  : "Hold"
                : `${delta > 0 ? "+" : ""}${formatKg(delta)}kg`;

            const recommendedDeltaForMode = recommendedWorkKg - target.currentWorkKg;
            const recommendedDeltaLabel =
              recommendedDeltaForMode === 0
                ? locale === "ko"
                  ? "유지"
                  : "hold"
                : `${recommendedDeltaForMode > 0 ? "+" : ""}${formatKg(recommendedDeltaForMode)}kg`;

            const deltaColor =
              delta > 0
                ? "var(--v2-success)"
                : delta < 0
                  ? "var(--v2-danger)"
                  : "var(--v2-ink-3)";

            return (
              <div key={target.key}>
                {index > 0 ? <V2Hairline /> : null}
                <V2Card tone="paper" padding="var(--v2-s-3)">
                  <V2Stack gap={3}>
                    <V2Inline justify="space-between" align="baseline">
                      <span className="v2-label" style={{ color: "var(--v2-ink)" }}>
                        {target.label}
                      </span>
                      <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
                        {locale === "ko" ? "현재" : "Current"} {formatKg(target.currentWorkKg)}kg
                      </span>
                    </V2Inline>

                    <V2Inline justify="center">
                      <V2Segmented<FailureProtocolMode>
                        options={modeOptions}
                        value={current.mode}
                        onChange={(nextMode) => setTargetMode(target, nextMode)}
                        ariaLabel={`${target.label} ${locale === "ko" ? "모드" : "mode"}`}
                        size="sm"
                      />
                    </V2Inline>

                    <V2Inline justify="space-between" align="center">
                      <V2IconBtn
                        icon="remove"
                        label={locale === "ko" ? "2.5kg 감소" : "Decrease 2.5kg"}
                        tone="neutral"
                        onClick={() => adjustTarget(target.key, -STEP_KG)}
                      />
                      <V2Stack gap={1} align="center" style={{ flex: 1 }}>
                        <span className="v2-num-lg" style={{ color: "var(--v2-ink)" }}>
                          {formatKg(current.workKg)}
                          <span
                            className="v2-small"
                            style={{ color: "var(--v2-ink-3)", marginLeft: "var(--v2-s-1)" }}
                          >
                            kg
                          </span>
                        </span>
                        <span className="v2-small" style={{ color: deltaColor }}>
                          {deltaLabel}
                        </span>
                      </V2Stack>
                      <V2IconBtn
                        icon="add"
                        label={locale === "ko" ? "2.5kg 증가" : "Increase 2.5kg"}
                        tone="neutral"
                        onClick={() => adjustTarget(target.key, STEP_KG)}
                      />
                    </V2Inline>

                    <V2Inline justify="space-between" align="center">
                      <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
                        {locale === "ko" ? "추천" : "Recommended"}: {recommendedDeltaLabel}
                      </span>
                      {!isRecommended ? (
                        <button
                          type="button"
                          className="v2-pressable v2-small"
                          onClick={() => resetTarget(target)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--v2-accent)",
                            cursor: "pointer",
                            padding: "var(--v2-s-1) var(--v2-s-2)",
                            minHeight: "var(--v2-s-7)",
                          }}
                        >
                          {locale === "ko" ? "추천값으로" : "Use recommended"}
                        </button>
                      ) : null}
                    </V2Inline>
                  </V2Stack>
                </V2Card>
              </div>
            );
          })}
        </V2Stack>
      </V2Stack>
    </BottomSheet>
  );
}
