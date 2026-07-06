import type { ProgramTemplate } from "@workout/core/program-store/model";

export type PlanItem = {
  id: string;
  name: string;
  type: "SINGLE" | "COMPOSITE" | "MANUAL";
  rootProgramVersionId: string | null;
  params: Record<string, unknown> | null;
};

export type ExerciseOption = {
  id: string;
  name: string;
  category: string | null;
};

export type TemplatesResponse = {
  items: ProgramTemplate[];
};

export type PlansResponse = {
  items: PlanItem[];
};

export type ExerciseResponse = {
  items: ExerciseOption[];
};

export type ProgramStoreQueryState = {
  detail: string;
  customize: string;
  create: string;
};
