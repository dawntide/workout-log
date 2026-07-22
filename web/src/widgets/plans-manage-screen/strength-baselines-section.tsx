import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import {
  V2EmptyState,
  V2SecondaryBtn,
  V2Stack,
} from "@/components/v2/primitives";
import { formatKg } from "@/features/plans-manage/model/plan-view";

import { StrengthEditField, StrengthEditRow, StrengthFieldGrid } from "./detail-rows";
import type { PlansManageController, PlansManageCopy } from "./view-types";

type StrengthRow = PlansManageController["strengthRows"][number];

/**
 * 시작 기준(1RM/TM) 섹션.
 * 자동 진행 플랜에서는 시작값이 읽기 전용이고 접힌 상태가 기본 — 현재 무게는 진행 섹션이 보여준다.
 */
export function StrengthBaselinesSection({
  rows,
  isAutoProgression,
  showStartingBaseline,
  setShowStartingBaseline,
  setStrengthDraft,
  copy,
}: {
  rows: StrengthRow[];
  isAutoProgression: boolean;
  showStartingBaseline: boolean;
  setShowStartingBaseline: PlansManageController["setShowStartingBaseline"];
  setStrengthDraft: PlansManageController["setStrengthDraft"];
  copy: PlansManageCopy;
}) {
  return (
    <V2Stack gap={2}>
      <span
        className="v2-eyebrow"
        style={{ color: "var(--v2-ink-3)" }}
      >
        {copy.plansManage.strengthBaselines}
      </span>
      {isAutoProgression ? (
        <p
          className="v2-small"
          style={{ margin: 0, color: "var(--v2-ink-2)" }}
        >
          {copy.plansManage.startingBaselineHint}
        </p>
      ) : null}
      {isAutoProgression ? (
        <V2SecondaryBtn
          full
          icon={showStartingBaseline ? "expand_less" : "expand_more"}
          onClick={() => setShowStartingBaseline((prev) => !prev)}
        >
          {showStartingBaseline
            ? copy.plansManage.hideStartingBaseline
            : copy.plansManage.showStartingBaseline}
        </V2SecondaryBtn>
      ) : null}
      {!isAutoProgression || showStartingBaseline ? (
        rows.length > 0 ? (
          <V2Stack gap={2}>
            {rows.map((row) => (
              <StrengthEditRow key={row.key} label={row.label}>
                <StrengthFieldGrid>
                  <StrengthEditField label={copy.plansManage.oneRepMax}>
                    {isAutoProgression ? (
                      <span className="v2-body" style={{ color: "var(--v2-ink)" }}>
                        {row.oneRepMaxKg > 0 ? `${formatKg(row.oneRepMaxKg)} kg` : "—"}
                      </span>
                    ) : (
                      <NumberKeypadField
                        ariaLabel={`${row.label} ${copy.plansManage.oneRepMax}`}
                        value={row.oneRepMaxKg}
                        min={0}
                        max={500}
                        allowDecimal
                        step={0.5}
                        onChange={(value) => {
                          setStrengthDraft((prev) => ({
                            ...prev,
                            [row.key]: {
                              ...(prev[row.key] ?? { oneRepMaxKg: 0, trainingMaxKg: 0 }),
                              oneRepMaxKg: value,
                            },
                          }));
                        }}
                      />
                    )}
                  </StrengthEditField>
                  <StrengthEditField label={copy.plansManage.trainingMax}>
                    {isAutoProgression ? (
                      <span className="v2-body" style={{ color: "var(--v2-ink)" }}>
                        {row.trainingMaxKg > 0 ? `${formatKg(row.trainingMaxKg)} kg` : "—"}
                      </span>
                    ) : (
                      <NumberKeypadField
                        ariaLabel={`${row.label} ${copy.plansManage.trainingMax}`}
                        value={row.trainingMaxKg}
                        min={0}
                        max={500}
                        allowDecimal
                        step={0.5}
                        onChange={(value) => {
                          setStrengthDraft((prev) => ({
                            ...prev,
                            [row.key]: {
                              ...(prev[row.key] ?? { oneRepMaxKg: 0, trainingMaxKg: 0 }),
                              trainingMaxKg: value,
                            },
                          }));
                        }}
                      />
                    )}
                  </StrengthEditField>
                </StrengthFieldGrid>
              </StrengthEditRow>
            ))}
          </V2Stack>
        ) : (
          <V2EmptyState
            icon="straighten"
            title={copy.plansManage.noStrengthBaselines}
            tone="inset"
          />
        )
      ) : null}
    </V2Stack>
  );
}
