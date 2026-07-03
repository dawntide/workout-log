"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { useThemeSkin } from "@/components/use-theme-skin";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import {
  useProgramStoreBootstrapController,
} from "@/features/program-store/model/use-program-store-bootstrap-controller";
import { useProgramStoreDerivedState } from "@/features/program-store/model/use-program-store-derived-state";
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
import { ProgramStoreTuiBrowse } from "@/features/program-store/ui/program-store-tui-browse";
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
  const skin = useThemeSkin();
  const router = useRouter();
  const { confirm } = useAppDialog();

  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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
    categoryOptions,
    listItems,
    filteredListItems,
    categoryFilteredItems,
    publicTemplates,
    manualPublicTemplate,
    detailTarget,
    customProgramCount,
    marketListItems,
    customListItems,
    isOperatorCustomization,
  } = useProgramStoreDerivedState({
    templates,
    locale,
    storeQuery,
    categoryFilter,
    detailTargetId,
    customizeDraft,
  });

  useProgramStoreSheetEntryController({
    queryState,
    listItems,
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
      {skin === "terminal" ? (
        <ProgramStoreTuiBrowse
          locale={locale}
          error={error}
          notice={notice}
          storeQuery={storeQuery}
          categoryFilter={categoryFilter}
          marketListItems={marketListItems}
          customListItems={customListItems}
          categoryOptions={categoryOptions}
          isStoreSettled={isStoreSettled}
          onChangeStoreQuery={setStoreQuery}
          onChangeCategoryFilter={setCategoryFilter}
          onSelectItem={(item) => {
            setDetailTargetId(item.template.id);
          }}
          onOpenCreateSheet={openCreateSheet}
        />
      ) : (
        <ProgramStoreBrowseContent
          locale={locale}
          copy={copy.programStore}
          error={error}
          notice={notice}
          storeQuery={storeQuery}
          categoryFilter={categoryFilter}
          listItems={listItems}
          filteredListItems={filteredListItems}
          categoryFilteredItems={categoryFilteredItems}
          marketListItems={marketListItems}
          customListItems={customListItems}
          customProgramCount={customProgramCount}
          categoryOptions={categoryOptions}
          isStoreSettled={isStoreSettled}
          hasStoreQuery={hasStoreQuery}
          onRetry={() => {
            void loadStore();
          }}
          onChangeStoreQuery={setStoreQuery}
          onChangeCategoryFilter={setCategoryFilter}
          onSelectItem={(item) => {
            setDetailTargetId(item.template.id);
          }}
          onOpenCreateSheet={openCreateSheet}
        />
      )}

      <ProgramDetailSheet
        open={Boolean(detailTarget)}
        onClose={() => setDetailTargetId(null)}
        item={detailTarget}
        saving={saving}
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
