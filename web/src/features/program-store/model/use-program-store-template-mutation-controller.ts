"use client";
import { errorMessage } from "@/lib/error-message";

import { useCallback } from "react";
import type { AppConfirmOptions } from "@/components/ui/app-dialog-provider";
import { apiDelete, apiPatch, apiPost, apiPut } from "@/lib/api";
import { applyEditableFacetSelection } from "@workout/core/program-store/facets";
import type { EditProgramMetaDraft } from "@/features/program-store/ui/edit-program-meta-sheet";
import {
  hasAtLeastOneExercise,
  isOperatorTemplate,
  isRef5Template,
  makeForkSlug,
  resolveProgramFamily,
  toManualDefinition,
  type ProgramListItem,
  type ProgramSessionDraft,
  type ProgramTemplate,
} from "@workout/core/program-store/model";
import type {
  ProgramStoreCreateDraft,
  ProgramStoreCustomizeDraft,
} from "./use-program-store-sheet-entry-controller";
import { formatProgramDisplayName } from "./view";

type ForkResponse = {
  template: ProgramTemplate;
  version: {
    id: string;
    version: number;
  };
};

type DeleteTemplateResponse = {
  deleted: boolean;
  template: {
    id: string;
    slug: string;
    name: string;
  };
  deletedPlanCount: number;
};

/**
 * 커스텀 프로그램이 물려받을 태그. 결과물은 항상 세션 고정(MANUAL)이므로 "manual"을
 * 보장하고, 나머지는 사용자가 고른 기반 프로그램의 성격을 따른다. 기반이 없으면
 * 빈 채로 두는 편이 낫다 — 없는 성격을 지어내면 스토어 필터가 거짓말을 한다.
 */
function customProgramTags(baseTemplate: ProgramTemplate | null | undefined): string[] {
  const inherited = Array.isArray(baseTemplate?.tags) ? baseTemplate.tags : [];
  return [
    ...new Set(
      ["manual", ...inherited.map((tag) => String(tag).trim().toLowerCase())].filter(Boolean),
    ),
  ];
}

function validateCustomSessions(
  sessions: ProgramSessionDraft[],
  locale: "ko" | "en",
) {
  const errors: string[] = [];
  if (!hasAtLeastOneExercise(sessions)) {
    errors.push(
      locale === "ko"
        ? "최소 1개 운동을 추가해야 합니다."
        : "Add at least one exercise.",
    );
  }
  sessions.forEach((session) => {
    session.exercises.forEach((exercise, index) => {
      const isValid =
        exercise.exerciseName.trim().length > 0 &&
        exercise.sets > 0 &&
        exercise.reps > 0;
      if (!isValid) {
        errors.push(
          locale === "ko"
            ? `세션 ${session.key}의 ${index + 1}번째 운동 입력값을 확인해 주세요.`
            : `Review the inputs for exercise ${index + 1} in session ${session.key}.`,
        );
      }
    });
  });
  return errors;
}

async function putProgramVersionDefinition(versionId: string, definition: unknown) {
  await apiPut(`/api/program-versions/${encodeURIComponent(versionId)}`, {
    definition,
  });
}

type UseProgramStoreTemplateMutationControllerInput = {
  locale: "ko" | "en";
  manualPublicTemplate: ProgramTemplate | null;
  /** 새 프로그램이 물려받을 성격(태그)을 기반 프로그램에서 읽기 위해 필요하다. */
  templates: ProgramTemplate[];
  confirm: (input: string | AppConfirmOptions) => Promise<boolean | null>;
  loadStore: (options?: { isRefresh?: boolean }) => void | Promise<void>;
  closeStartProgramDraft: () => void;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setTemplates: React.Dispatch<React.SetStateAction<ProgramTemplate[]>>;
  // Mutations only ever clear (or re-point) the detail target, so a plain setter
  // is enough — and it lets the screen pass a history-aware wrapper.
  setDetailTargetId: (value: string | null) => void;
  setCustomizeDraft: React.Dispatch<
    React.SetStateAction<ProgramStoreCustomizeDraft | null>
  >;
  setCreateDraft: React.Dispatch<
    React.SetStateAction<ProgramStoreCreateDraft | null>
  >;
};

export function useProgramStoreTemplateMutationController({
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
  setDetailTargetId,
  setCustomizeDraft,
  setCreateDraft,
}: UseProgramStoreTemplateMutationControllerInput) {
  const deleteCustomTemplate = useCallback(
    async (item: ProgramListItem) => {
      if (item.source !== "CUSTOM") return;

      const confirmed = await confirm({
        title: locale === "ko" ? "커스텀 프로그램 삭제" : "Delete Custom Program",
        message:
          locale === "ko"
            ? `커스텀 프로그램 "${item.template.name}"을(를) 삭제할까요?\n연결된 내 플랜도 함께 삭제됩니다.`
            : `Delete custom program "${item.template.name}"?\nConnected plans will also be deleted.`,
        confirmText: locale === "ko" ? "삭제" : "Delete",
        cancelText: locale === "ko" ? "취소" : "Cancel",
        tone: "danger",
      });
      if (!confirmed) return;

      try {
        setSaving(true);
        setError(null);
        setNotice(null);
        setTemplates((prev) => prev.filter((template) => template.id !== item.template.id));

        const response = await apiDelete<DeleteTemplateResponse>(
          `/api/templates/${encodeURIComponent(item.template.slug)}`,
        );
        const deletedPlanSuffix =
          Number(response.deletedPlanCount) > 0
            ? locale === "ko"
              ? ` (연결 플랜 ${response.deletedPlanCount}개 삭제)`
              : ` (${response.deletedPlanCount} linked plan${response.deletedPlanCount === 1 ? "" : "s"} deleted)`
            : "";

        setDetailTargetId(null);
        setCustomizeDraft(null);
        closeStartProgramDraft();
        void loadStore({ isRefresh: true });
        setNotice(
          locale === "ko"
            ? `커스텀 프로그램을 삭제했습니다: ${formatProgramDisplayName(item.template.name)}${deletedPlanSuffix}`
            : `Deleted custom program: ${formatProgramDisplayName(item.template.name)}${deletedPlanSuffix}`,
        );
      } catch (error) {
        setError(
          errorMessage(error) ??
            (locale === "ko"
              ? "커스텀 프로그램을 삭제하지 못했습니다."
              : "Could not delete the custom program."),
        );
        void loadStore({ isRefresh: true });
      } finally {
        setSaving(false);
      }
    },
    [
      closeStartProgramDraft,
      confirm,
      loadStore,
      locale,
      setDetailTargetId,
      setCustomizeDraft,
      setError,
      setNotice,
      setSaving,
      setTemplates,
    ],
  );

  const saveCustomizationDraft = useCallback(
    async (draft: ProgramStoreCustomizeDraft) => {
      if (isRef5Template(draft.baseTemplate)) {
        setError(
          locale === "ko"
            ? "REF5는 일반 프로그램으로 포크할 수 없습니다."
            : "REF5 cannot be forked into a general program.",
        );
        return;
      }
      const errors = validateCustomSessions(draft.sessions, locale);
      if (!draft.name.trim()) {
        errors.push(
          locale === "ko"
            ? "커스터마이징 프로그램 이름을 입력하세요."
            : "Enter a name for the customized program.",
        );
      }
      if (errors.length > 0) {
        setError(errors[0]);
        return;
      }

      try {
        setSaving(true);
        setError(null);
        const forkSourceTemplate =
          draft.baseTemplate.type === "MANUAL"
            ? draft.baseTemplate
            : manualPublicTemplate;
        if (!forkSourceTemplate) {
          throw new Error(
            locale === "ko"
              ? "세션 커스터마이징용 Manual 템플릿을 찾지 못했습니다."
              : "Could not find a Manual template for session customization.",
          );
        }

        const fork = await apiPost<ForkResponse>(
          `/api/templates/${encodeURIComponent(forkSourceTemplate.slug)}/fork`,
          {
            newName: draft.name.trim(),
            newSlug: makeForkSlug(draft.name),
            // fork 소스는 세션을 담을 기술적 껍데기(Manual)일 뿐이고, 결과물의 정체성은
            // 사용자가 고른 baseTemplate이다. 소스의 소개·태그를 물려받으면 Operator
            // 구성에 "AMRAP LP" 설명이 붙는 식으로 어긋난다.
            description: "",
            tags: customProgramTags(draft.baseTemplate),
          },
        );

        const definition = toManualDefinition(draft.sessions, {
          operatorStyle: isOperatorTemplate(draft.baseTemplate),
          programFamily: resolveProgramFamily(draft.baseTemplate),
        });
        await putProgramVersionDefinition(fork.version.id, definition);

        setTemplates((prev) => [fork.template, ...prev]);
        setNotice(
          locale === "ko"
            ? `커스터마이징 프로그램을 만들었습니다: ${formatProgramDisplayName(fork.template.name)}`
            : `Created customized program: ${formatProgramDisplayName(fork.template.name)}`,
        );
        setCustomizeDraft(null);
        setDetailTargetId(null);
        void loadStore({ isRefresh: true });
      } catch (error) {
        setError(
          errorMessage(error) ??
            (locale === "ko"
              ? "커스터마이징을 저장하지 못했습니다."
              : "Could not save the customization."),
        );
      } finally {
        setSaving(false);
      }
    },
    [
      loadStore,
      locale,
      manualPublicTemplate,
      setCustomizeDraft,
      setDetailTargetId,
      setError,
      setNotice,
      setSaving,
      setTemplates,
    ],
  );

  /**
   * 커스텀 프로그램의 이름·소개·태그 저장. definition(운동 구성)은 커스터마이징이
   * 담당하므로 여기서는 건드리지 않는다.
   */
  const saveProgramMetaDraft = useCallback(
    async (draft: EditProgramMetaDraft, currentTags: string[]) => {
      const name = draft.name.trim();
      if (!name) {
        setError(
          locale === "ko" ? "프로그램 이름을 입력하세요." : "Enter a program name.",
        );
        return false;
      }

      try {
        setSaving(true);
        setError(null);
        const res = await apiPatch<{ template: ProgramTemplate }>(
          `/api/templates/${encodeURIComponent(draft.slug)}`,
          {
            name,
            description: draft.description.trim(),
            tags: applyEditableFacetSelection(currentTags, draft.facets),
          },
          { invalidateCachePrefixes: ["/api/templates", "/api/plans"] },
        );
        const updated = res?.template;
        if (updated) {
          setTemplates((prev) =>
            prev.map((template) => (template.id === updated.id ? updated : template)),
          );
        }
        setNotice(
          locale === "ko"
            ? `프로그램 정보를 저장했습니다: ${formatProgramDisplayName(name)}`
            : `Saved program info: ${formatProgramDisplayName(name)}`,
        );
        void loadStore({ isRefresh: true });
        return true;
      } catch (error) {
        setError(
          errorMessage(error) ??
            (locale === "ko"
              ? "프로그램 정보를 저장하지 못했습니다."
              : "Could not save the program info."),
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [loadStore, locale, setError, setNotice, setSaving, setTemplates],
  );

  const saveCreateDraft = useCallback(
    async (draft: ProgramStoreCreateDraft) => {
      const errors = validateCustomSessions(draft.sessions, locale);
      if (!draft.name.trim()) {
        errors.push(
          locale === "ko"
            ? "프로그램 이름을 입력하세요."
            : "Enter a program name.",
        );
      }

      let sourceSlug: string | null = null;
      if (draft.mode === "MARKET_BASED") {
        sourceSlug = draft.sourceTemplateSlug;
      } else {
        sourceSlug = manualPublicTemplate?.slug ?? null;
      }

      if (String(sourceSlug ?? "").trim().toLowerCase() === "ref5-adaptive-strength") {
        errors.push(
          locale === "ko"
            ? "REF5는 일반 프로그램으로 포크할 수 없습니다."
            : "REF5 cannot be forked into a general program.",
        );
      }

      if (!sourceSlug) {
        errors.push(
          locale === "ko"
            ? "기반 프로그램을 찾지 못했습니다."
            : "Could not find the base program.",
        );
      }
      if (errors.length > 0) {
        setError(errors[0]);
        return;
      }

      try {
        setSaving(true);
        setError(null);
        const sourceTemplate =
          templates.find((template) => template.slug === sourceSlug) ?? null;
        const fork = await apiPost<ForkResponse>(
          `/api/templates/${encodeURIComponent(sourceSlug!)}/fork`,
          {
            newName: draft.name.trim(),
            newSlug: makeForkSlug(draft.name),
            description: "",
            tags: customProgramTags(sourceTemplate),
          },
        );

        const definition = toManualDefinition(draft.sessions);
        await putProgramVersionDefinition(fork.version.id, definition);

        setTemplates((prev) => [fork.template, ...prev]);
        setNotice(
          locale === "ko"
            ? `커스텀 프로그램을 만들었습니다: ${formatProgramDisplayName(fork.template.name)}`
            : `Created custom program: ${formatProgramDisplayName(fork.template.name)}`,
        );
        setCreateDraft(null);
        void loadStore({ isRefresh: true });
      } catch (error) {
        setError(
          errorMessage(error) ??
            (locale === "ko"
              ? "커스텀 프로그램을 만들지 못했습니다."
              : "Could not create the custom program."),
        );
      } finally {
        setSaving(false);
      }
    },
    [
      loadStore,
      locale,
      manualPublicTemplate?.slug,
      templates,
      setCreateDraft,
      setError,
      setNotice,
      setSaving,
      setTemplates,
    ],
  );

  return {
    deleteCustomTemplate,
    saveCustomizationDraft,
    saveCreateDraft,
    saveProgramMetaDraft,
  };
}
