import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import {
  V2Chip,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2Stack,
} from "@/components/v2/primitives";
import { TargetWeightChip } from "@/components/v2/target-weight-chip";

import { StrengthEditField, StrengthFieldGrid } from "./detail-rows";
import type { LocaleKey, PlansManageController, PlansManageCopy } from "./view-types";

type ProgressRow = PlansManageController["currentProgressRows"][number];

/** 현재 진행(작업 무게) 칩 목록 + TM 조정 인라인 폼. 자동 진행 플랜에서만 렌더된다. */
export function CurrentProgressionSection({
  rows,
  progressPosition,
  lightBlockActive,
  adjustOpen,
  setAdjustOpen,
  adjustDraft,
  setAdjustDraft,
  adjusting,
  openAdjustment,
  saveAdjustment,
  copy,
  locale,
}: {
  rows: ProgressRow[];
  progressPosition: PlansManageController["progressPosition"];
  lightBlockActive: boolean;
  adjustOpen: boolean;
  setAdjustOpen: PlansManageController["setAdjustOpen"];
  adjustDraft: Record<string, number>;
  setAdjustDraft: PlansManageController["setAdjustDraft"];
  adjusting: boolean;
  openAdjustment: () => void;
  saveAdjustment: () => Promise<void>;
  copy: PlansManageCopy;
  locale: LocaleKey;
}) {
  return (
    <V2Stack gap={2}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--v2-s-2)",
        }}
      >
        <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
          {copy.plansManage.currentProgress}
        </span>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: "var(--v2-s-2)" }}>
          {lightBlockActive ? (
            // v0.5.1 F4: 라이트 블록(회복) 지속 배지 — 플래그 해제 시 자동 소멸.
            <V2Chip tone="info">
              {locale === "ko" ? "🌙 라이트 블록" : "🌙 Light block"}
            </V2Chip>
          ) : null}
          {progressPosition ? (
            <span
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)", fontSize: "var(--v2-t-eyebrow)" }}
            >
              {`C${progressPosition.cycle}W${progressPosition.week}D${progressPosition.day}`}
            </span>
          ) : null}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--v2-s-2)",
        }}
      >
        {rows.map((row) => (
          <TargetWeightChip
            key={row.key}
            label={row.label}
            weightKg={row.weightKg}
            weightSuffix={row.weightSuffix}
            lastDeltaKg={row.lastDeltaKg}
            lastEventType={row.lastEventType}
          />
        ))}
      </div>
      {adjustOpen ? (
        <V2Stack gap={2}>
          <p
            className="v2-small"
            style={{ margin: 0, color: "var(--v2-ink-2)" }}
          >
            {copy.plansManage.adjustHint}
          </p>
          <StrengthFieldGrid>
            {rows.map((row) => (
              <StrengthEditField key={row.key} label={row.label}>
                <NumberKeypadField
                  ariaLabel={`${row.label} TM`}
                  value={adjustDraft[row.key] ?? 0}
                  min={0}
                  max={500}
                  allowDecimal
                  step={2.5}
                  onChange={(value) =>
                    setAdjustDraft((prev) => ({ ...prev, [row.key]: value }))
                  }
                />
              </StrengthEditField>
            ))}
          </StrengthFieldGrid>
          <div style={{ display: "flex", gap: "var(--v2-s-2)" }}>
            <V2PrimaryBtn
              full
              disabled={adjusting}
              onClick={() => {
                void saveAdjustment();
              }}
            >
              {adjusting ? copy.plansManage.saveInProgress : copy.plansManage.adjustSave}
            </V2PrimaryBtn>
            <V2SecondaryBtn
              full
              disabled={adjusting}
              onClick={() => setAdjustOpen(false)}
            >
              {copy.plansManage.adjustCancel}
            </V2SecondaryBtn>
          </div>
        </V2Stack>
      ) : (
        <V2SecondaryBtn full icon="tune" onClick={openAdjustment}>
          {copy.plansManage.adjustCurrentTm}
        </V2SecondaryBtn>
      )}
    </V2Stack>
  );
}
