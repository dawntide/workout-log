"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import {
  useProgramStoreBootstrapController,
} from "@/features/program-store/model/use-program-store-bootstrap-controller";
import { useProgramStoreDerivedState } from "@/features/program-store/model/use-program-store-derived-state";
import { resolveProgramStoreSelection } from "@/features/program-store/model/view";
import {
  useProgramStoreSheetEntryController,
  type ProgramStoreCreateDraft as CreateDraft,
  type ProgramStoreCustomizeDraft as CustomizeDraft,
} from "@/features/program-store/model/use-program-store-sheet-entry-controller";
import type { ExerciseOption, PlanItem } from "@/features/program-store/model/types";
import { useProgramStoreStartProgramController } from "@/features/program-store/model/use-program-store-start-program-controller";
import { useProgramStoreTemplateMutationController } from "@/features/program-store/model/use-program-store-template-mutation-controller";
import { useProgramStoreEditorController } from "@/features/program-store/model/use-program-store-editor-controller";
import { StartProgramSheet } from "@/features/program-store/ui/start-program-sheet";
import { CustomizeProgramSheet } from "@/features/program-store/ui/customize-program-sheet";
import { CreateProgramSheet } from "@/features/program-store/ui/create-program-sheet";
import { ProgramStoreBrowseContent } from "@/features/program-store/ui/program-store-browse-content";
import { ProgramFilterSheet } from "@/features/program-store/ui/program-filter-sheet";
import {
  toggleProgramFacet,
  type ProgramFacetSelection,
} from "@workout/core/program-store/facets";
import type { ProgramTemplate } from "@workout/core/program-store/model";

const ProgramDetailSheet = dynamic(
  () =>
    import("@/features/program-store/ui/program-detail-sheet").then(
      (mod) => mod.ProgramDetailSheet,
    ),
  { ssr: false },
);

type ProgramStoreScreenProps = {
  initialTemplates?: ProgramTemplate[] | null;
  initialPlans?: PlanItem[] | null;
  initialExercises?: ExerciseOption[] | null;
};

export function ProgramStoreScreen({
  initialTemplates,
  initialPlans,
  initialExercises,
}: ProgramStoreScreenProps = {}) {
  const { locale, copy } = useLocale();
  const router = useRouter();
  const { confirm } = useAppDialog();

  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");
  const [facetSelection, setFacetSelection] = useState<ProgramFacetSelection>({});
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [detailTargetId, setDetailTargetId] = useState<string | null>(null);
  const [customizeDraft, setCustomizeDraft] = useState<CustomizeDraft | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);

  const {
    loading,
    storeLoadKey,
    exerciseOptionsLoading,
    queryState,
    loadStore,
  } = useProgramStoreBootstrapController({
    locale,
    initialTemplates,
    initialPlans,
    initialExercises,
    setTemplates,
    setPlans,
    setExerciseOptions,
    setError,
  });

  const {
    facetGroups,
    selectedFacetCount,
    templateItems,
    listItems,
    filteredListItems,
    facetFilteredItems,
    publicTemplates,
    manualPublicTemplate,
    detailTarget,
    detailVariants,
    customProgramCount,
    marketListItems,
    customListItems,
    isOperatorCustomization,
  } = useProgramStoreDerivedState({
    templates,
    locale,
    storeQuery,
    facetSelection,
    detailTargetId,
    customizeDraft,
  });

  useProgramStoreSheetEntryController({
    queryState,
    listItems: templateItems,
    templates,
    locale,
    setDetailTargetId,
    setCustomizeDraft,
    setCreateDraft,
  });

  const {
    recentlyAddedCustomizeExerciseId,
    registerCustomizeExerciseRef,
    openCreateSheet,
    openCustomizeDraftFromTemplate,
    changeCustomizeName,
    patchCustomizeExercise,
    moveCustomizeExercise,
    deleteCustomizeExercise,
    addCustomizeExercise,
    changeCreateName,
    changeCreateMode,
    changeCreateSourceTemplate,
    changeCreateSessionCount,
    patchCreateExercise,
    moveCreateExercise,
    deleteCreateExercise,
    addCreateExercise,
    startExerciseDrag,
    dropExerciseOnTarget,
    dropCustomizeExerciseAtSessionEnd,
    dropCreateExerciseAtSessionEnd,
  } = useProgramStoreEditorController({
    locale,
    templates,
    setError,
    setCustomizeDraft,
    setCreateDraft,
  });

  const {
    startProgramDraft,
    closeStartProgramDraft,
    openStartProgramDraft,
    updateOneRmInput,
    updateRef5StartingValue,
    updateRef5SetupMode,
    updateRef5E1rmInput,
    applyRecommendation,
    submitStartProgram,
  } = useProgramStoreStartProgramController({
    locale,
    plans,
    loadStore,
    setError,
    setNotice,
    setSaving,
    onStarted: (planId, date) => {
      router.push(
        `/workout/log?planId=${encodeURIComponent(planId)}&date=${date}&context=today`,
      );
    },
  });

  const {
    deleteCustomTemplate,
    saveCustomizationDraft,
    saveCreateDraft,
  } = useProgramStoreTemplateMutationController({
    locale,
    manualPublicTemplate,
    confirm,
    loadStore,
    closeStartProgramDraft,
    setSaving,
    setError,
    setNotice,
    setTemplates,
    setDetailTargetId,
    setCustomizeDraft,
    setCreateDraft,
  });

  const isStoreSettled = useQuerySettled(storeLoadKey, loading);
  const hasStoreQuery = storeQuery.trim().length > 0;

  return (
    <>
      <ProgramStoreBrowseContent
          locale={locale}
          copy={copy.programStore}
          error={error}
          notice={notice}
          storeQuery={storeQuery}
          listItems={listItems}
          filteredListItems={filteredListItems}
          facetFilteredItems={facetFilteredItems}
          marketListItems={marketListItems}
          customListItems={customListItems}
          customProgramCount={customProgramCount}
          facetGroups={facetGroups}
          facetSelection={facetSelection}
          selectedFacetCount={selectedFacetCount}
          isStoreSettled={isStoreSettled}
          hasStoreQuery={hasStoreQuery}
          onRetry={() => {
            void loadStore();
          }}
          onChangeStoreQuery={setStoreQuery}
          onOpenFilterSheet={() => setFilterSheetOpen(true)}
          onToggleFacet={(key, value) =>
            setFacetSelection((current) => toggleProgramFacet(current, key, value))
          }
          onResetFacets={() => setFacetSelection({})}
          onSelectItem={(item) => {
            const selectedItem = resolveProgramStoreSelection(
              item,
              storeQuery,
              locale,
            );
            setDetailTargetId(selectedItem.template.id);
          }}
          onOpenCreateSheet={openCreateSheet}
      />

      <ProgramFilterSheet
        open={filterSheetOpen}
        locale={locale}
        groups={facetGroups}
        selection={facetSelection}
        resultCount={facetFilteredItems.length}
        hasSelection={selectedFacetCount > 0}
        onToggle={(key, value) =>
          setFacetSelection((current) => toggleProgramFacet(current, key, value))
        }
        onReset={() => setFacetSelection({})}
        onClose={() => setFilterSheetOpen(false)}
      />

      <ProgramDetailSheet
        open={Boolean(detailTarget)}
        onClose={() => setDetailTargetId(null)}
        item={detailTarget}
        variants={detailVariants}
        saving={saving}
        onSelectVariant={(variant) => {
          setDetailTargetId(variant.template.id);
        }}
        onStart={() => {
          if (detailTarget) openStartProgramDraft(detailTarget.template);
        }}
        onCustomize={() => {
          if (detailTarget) {
            openCustomizeDraftFromTemplate(detailTarget.template);
          }
        }}
        onDelete={
          detailTarget?.source === "CUSTOM"
            ? () => {
                void deleteCustomTemplate(detailTarget);
              }
            : undefined
        }
      />

      <StartProgramSheet
        locale={locale}
        draft={startProgramDraft}
        saving={saving}
        onClose={closeStartProgramDraft}
        onSubmit={() => {
          void submitStartProgram();
        }}
        onChangeOneRmInput={updateOneRmInput}
        onChangeRef5StartingValue={updateRef5StartingValue}
        onChangeRef5SetupMode={updateRef5SetupMode}
        onChangeRef5E1rmInput={updateRef5E1rmInput}
        onApplyRecommendation={applyRecommendation}
      />

      <CustomizeProgramSheet
        locale={locale}
        draft={customizeDraft}
        saving={saving}
        error={error}
        isOperatorCustomization={isOperatorCustomization}
        publicTemplates={publicTemplates}
        exerciseOptions={exerciseOptions}
        exerciseOptionsLoading={exerciseOptionsLoading}
        recentlyAddedCustomizeExerciseId={recentlyAddedCustomizeExerciseId}
        onClose={() => setCustomizeDraft(null)}
        onSave={() => {
          if (customizeDraft) {
            void saveCustomizationDraft(customizeDraft);
          }
        }}
        onChangeName={changeCustomizeName}
        onSessionDrop={dropCustomizeExerciseAtSessionEnd}
        onRegisterExerciseRef={registerCustomizeExerciseRef}
        onPatchExercise={patchCustomizeExercise}
        onMoveExercise={moveCustomizeExercise}
        onDeleteExercise={deleteCustomizeExercise}
        onDragStartExercise={startExerciseDrag}
        onDropExercise={dropExerciseOnTarget}
        onAddExercise={addCustomizeExercise}
      />

      <CreateProgramSheet
        locale={locale}
        draft={createDraft}
        saving={saving}
        error={error}
        publicTemplates={publicTemplates}
        exerciseOptions={exerciseOptions}
        exerciseOptionsLoading={exerciseOptionsLoading}
        onClose={() => setCreateDraft(null)}
        onSave={() => {
          if (createDraft) {
            void saveCreateDraft(createDraft);
          }
        }}
        onChangeName={changeCreateName}
        onChangeMode={changeCreateMode}
        onChangeSourceTemplate={(sourceTemplateSlug) => {
          changeCreateSourceTemplate(sourceTemplateSlug, templates);
        }}
        onChangeSessionCount={changeCreateSessionCount}
        onSessionDrop={dropCreateExerciseAtSessionEnd}
        onPatchExercise={patchCreateExercise}
        onMoveExercise={moveCreateExercise}
        onDeleteExercise={deleteCreateExercise}
        onDragStartExercise={startExerciseDrag}
        onDropExercise={dropExerciseOnTarget}
        onAddExercise={addCreateExercise}
      />
    </>
  );
}
