"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import {
  useProgramStoreBootstrapController,
} from "@/features/program-store/model/use-program-store-bootstrap-controller";
import { useProgramStoreDerivedState } from "@/features/program-store/model/use-program-store-derived-state";
import { useProgramStoreDetailHistory } from "@/features/program-store/model/use-program-store-detail-history";
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
  readEditableFacetSelection,
  toggleProgramFacet,
  type ProgramFacetSelection,
} from "@workout/core/program-store/facets";
import {
  EditProgramMetaSheet,
  type EditProgramMetaDraft,
} from "@/features/program-store/ui/edit-program-meta-sheet";
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

  // Detail behaves like a page: opening pushes ?detail=<slug> so back closes it.
  const { openDetail, replaceDetail, closeDetail } = useProgramStoreDetailHistory({
    listItems: templateItems,
    setDetailTargetId,
  });

  const setDetailTargetIdWithHistory = useCallback(
    (value: string | null) => {
      if (value === null) {
        closeDetail();
        return;
      }
      setDetailTargetId(value);
    },
    [closeDetail],
  );

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
    updateRestartMode,
    updateOneRmInput,
    updateRef5StartingValue,
    updateRef5SetupMode,
    updateRef5E1rmInput,
    updateRef5OhpMicroloading,
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
    saveProgramMetaDraft,
  } = useProgramStoreTemplateMutationController({
    locale,
    manualPublicTemplate,
    templates,
    confirm,
    loadStore,
    closeStartProgramDraft,
    setSaving,
    setError,
    setNotice,
    setTemplates,
    // Mutations (delete/customize) close the sheet by clearing the target; route
    // that through the history hook so the ?detail= param goes with it.
    setDetailTargetId: setDetailTargetIdWithHistory,
    setCustomizeDraft,
    setCreateDraft,
  });

  // 커스텀 프로그램의 이름·소개·태그 편집. 태그는 facet 선택으로 다루고, 저장할 때
  // 편집 축 밖의 태그(manual·barbell 등)는 그대로 보존한다.
  const [programMetaDraft, setProgramMetaDraft] = useState<EditProgramMetaDraft | null>(null);
  const programMetaTagsRef = useRef<string[]>([]);
  const openProgramMetaDraft = useCallback((template: ProgramTemplate) => {
    const tags = Array.isArray(template.tags) ? template.tags.map(String) : [];
    programMetaTagsRef.current = tags;
    setError(null);
    setProgramMetaDraft({
      slug: template.slug,
      name: template.name,
      description: template.description ?? "",
      facets: readEditableFacetSelection(tags),
    });
  }, []);
  const submitProgramMetaDraft = useCallback(async () => {
    if (!programMetaDraft) return;
    const ok = await saveProgramMetaDraft(programMetaDraft, programMetaTagsRef.current);
    if (ok) setProgramMetaDraft(null);
  }, [programMetaDraft, saveProgramMetaDraft]);

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
            openDetail(selectedItem);
          }}
          onPrimaryAction={(item) => {
            // The card's trailing button is labelled with its action, so it runs
            // that action directly instead of routing through the detail sheet.
            const selectedItem = resolveProgramStoreSelection(
              item,
              storeQuery,
              locale,
            );
            if (selectedItem.source === "CUSTOM") {
              openCustomizeDraftFromTemplate(selectedItem.template);
              return;
            }
            openStartProgramDraft(selectedItem.template);
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
        onClose={closeDetail}
        item={detailTarget}
        variants={detailVariants}
        saving={saving}
        onSelectVariant={(variant) => {
          // Same history entry — back should close the sheet, not walk variants.
          replaceDetail(variant);
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
        onEditMeta={
          detailTarget?.source === "CUSTOM"
            ? () => {
                openProgramMetaDraft(detailTarget.template);
              }
            : undefined
        }
      />

      <EditProgramMetaSheet
        locale={locale}
        draft={programMetaDraft}
        saving={saving}
        error={error}
        onClose={() => setProgramMetaDraft(null)}
        onChange={(patch) =>
          setProgramMetaDraft((current) => (current ? { ...current, ...patch } : current))
        }
        onSave={() => {
          void submitProgramMetaDraft();
        }}
      />

      <StartProgramSheet
        locale={locale}
        draft={startProgramDraft}
        saving={saving}
        onClose={closeStartProgramDraft}
        onSubmit={() => {
          void submitStartProgram();
        }}
        onChangeRestartMode={updateRestartMode}
        onChangeOneRmInput={updateOneRmInput}
        onChangeRef5StartingValue={updateRef5StartingValue}
        onChangeRef5SetupMode={updateRef5SetupMode}
        onChangeRef5E1rmInput={updateRef5E1rmInput}
        onChangeRef5OhpMicroloading={updateRef5OhpMicroloading}
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
