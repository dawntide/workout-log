import { BottomSheet } from "@/components/ui/bottom-sheet";
import { AppTextInput } from "@/components/ui/form-controls";
import {
  V2EmptyState,
  V2Hairline,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2Stack,
} from "@/components/v2/primitives";
import { formatDateTime, planTypeLabel } from "@/features/plans-manage/model/plan-view";

import { CurrentProgressionSection } from "./current-progression-section";
import { PlanDetailRow } from "./detail-rows";
import { IncrementOverridesSection } from "./increment-overrides-section";
import { Ref5StatusPanel } from "./ref5-status-panel";
import { StrengthBaselinesSection } from "./strength-baselines-section";
import type { LocaleKey, PlansManageController, PlansManageCopy } from "./view-types";

/**
 * 플랜 관리 바텀시트 — 컨트롤러 bag을 그대로 받아 섹션에 필요한 조각만 나눠 준다.
 * 섹션 순서·조건은 화면 흐름 자체라 여기서만 읽히면 된다.
 */
export function PlanManageSheet({
  controller,
  copy,
  locale,
}: {
  controller: PlansManageController;
  copy: PlansManageCopy;
  locale: LocaleKey;
}) {
  const {
    managePlanId,
    setManagePlanId,
    managedPlan,
    nameDraft,
    setNameDraft,
    setStrengthDraft,
    strengthRows,
    incrementDraft,
    setIncrementDraft,
    incrementLoading,
    progressPosition,
    lightBlockActive,
    showStartingBaseline,
    setShowStartingBaseline,
    showIncrementSettings,
    setShowIncrementSettings,
    adjustOpen,
    setAdjustOpen,
    adjustDraft,
    setAdjustDraft,
    adjusting,
    saving,
    deleting,
    isAutoProgression,
    isRef5ManagedPlan,
    ref5Status,
    currentProgressRows,
    openAdjustment,
    saveAdjustment,
    savePlanChanges,
    deletePlan,
    toggleArchivePlan,
  } = controller;

  return (
    <BottomSheet
      open={Boolean(managePlanId)}
      onClose={() => {
        if (saving || deleting) return;
        setManagePlanId("");
      }}
      title={copy.plansManage.detailTitle}
      description={copy.plansManage.detailDescription}
      closeLabel={copy.plansManage.close}
    >
      {managedPlan ? (
        <V2Stack gap={5}>
          {/* ── Plan info ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "var(--v2-s-2)",
            }}
          >
            <PlanDetailRow
              label={locale === "ko" ? "타입" : "Type"}
              value={planTypeLabel(managedPlan.type, locale)}
            />
            <PlanDetailRow
              label={copy.plansManage.baseProgram}
              value={managedPlan.baseProgramName ?? "-"}
              // 플랜은 정상 동작하지만 스토어에 원본이 없으면 "이어서 하기" 진입로가
              // 사라진다. 표시가 없으면 사용자가 원인을 짐작할 방법이 없다.
              note={
                managedPlan.baseProgramAccessible === false
                  ? locale === "ko"
                    ? "이 프로그램은 프로그램 스토어에 없습니다(비공개이거나 삭제됨). 기록과 진행에는 영향이 없지만, 스토어에서 이 플랜을 이어서 시작할 수는 없습니다."
                    : "This program is no longer in the program store (private or deleted). Your logs and progress are unaffected, but you cannot resume this plan from the store."
                  : undefined
              }
            />
            <PlanDetailRow
              label={copy.plansManage.createdAt}
              value={formatDateTime(managedPlan.createdAt)}
            />
            <PlanDetailRow
              label={copy.plansManage.lastPerformedAt}
              value={
                managedPlan.lastPerformedAt
                  ? formatDateTime(managedPlan.lastPerformedAt)
                  : copy.plansManage.noRecord
              }
            />
          </div>

          <V2Hairline />

          {/* ── Plan name ── */}
          <V2Stack gap={2} as="div">
            <span
              className="v2-eyebrow"
              style={{ color: "var(--v2-ink-3)" }}
            >
              {copy.plansManage.planName}
            </span>
            <AppTextInput
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={copy.plansManage.planNamePlaceholder}
            />
          </V2Stack>

          {isRef5ManagedPlan ? (
            <Ref5StatusPanel status={ref5Status} locale={locale} loading={incrementLoading} />
          ) : null}

          {/* ── Current progression ── */}
          {!isRef5ManagedPlan && isAutoProgression && currentProgressRows.length > 0 ? (
            <CurrentProgressionSection
              rows={currentProgressRows}
              progressPosition={progressPosition}
              lightBlockActive={lightBlockActive}
              adjustOpen={adjustOpen}
              setAdjustOpen={setAdjustOpen}
              adjustDraft={adjustDraft}
              setAdjustDraft={setAdjustDraft}
              adjusting={adjusting}
              openAdjustment={openAdjustment}
              saveAdjustment={saveAdjustment}
              copy={copy}
              locale={locale}
            />
          ) : null}

          {/* ── Strength baselines ── */}
          {!isRef5ManagedPlan ? (
            <StrengthBaselinesSection
              rows={strengthRows}
              isAutoProgression={isAutoProgression}
              showStartingBaseline={showStartingBaseline}
              setShowStartingBaseline={setShowStartingBaseline}
              setStrengthDraft={setStrengthDraft}
              copy={copy}
            />
          ) : null}

          {/* ── Increment overrides ── */}
          {!isRef5ManagedPlan && Object.keys(incrementDraft).length > 0 ? (
            <IncrementOverridesSection
              incrementDraft={incrementDraft}
              setIncrementDraft={setIncrementDraft}
              showIncrementSettings={showIncrementSettings}
              setShowIncrementSettings={setShowIncrementSettings}
              copy={copy}
              locale={locale}
            />
          ) : !isRef5ManagedPlan && incrementLoading ? (
            <V2EmptyState
              icon="hourglass_empty"
              title={
                locale === "ko"
                  ? "증량/감량 설정 불러오는 중..."
                  : "Loading increment settings..."
              }
              tone="inset"
            />
          ) : null}

          {/* ── Actions ── */}
          <V2Stack gap={2}>
            <V2PrimaryBtn
              full
              disabled={saving || deleting}
              onClick={() => {
                void savePlanChanges();
              }}
            >
              {saving
                ? copy.plansManage.saveInProgress
                : copy.plansManage.saveChanges}
            </V2PrimaryBtn>
            <V2SecondaryBtn
              full
              icon={managedPlan.isArchived ? "unarchive" : "inventory_2"}
              disabled={saving || deleting}
              onClick={() => {
                void toggleArchivePlan();
              }}
            >
              {managedPlan.isArchived
                ? locale === "ko"
                  ? "보관 해제"
                  : "Unarchive"
                : locale === "ko"
                  ? "이 플랜 그만하기(보관)"
                  : "Stop This Plan (Archive)"}
            </V2SecondaryBtn>
            <V2SecondaryBtn
              full
              tone="danger"
              icon="delete"
              disabled={saving || deleting}
              onClick={() => {
                void deletePlan();
              }}
            >
              {deleting
                ? copy.plansManage.deleteInProgress
                : copy.plansManage.deletePlan}
            </V2SecondaryBtn>
          </V2Stack>
        </V2Stack>
      ) : (
        <V2EmptyState
          icon="search_off"
          title={copy.plansManage.notFound}
          tone="inset"
        />
      )}
    </BottomSheet>
  );
}
