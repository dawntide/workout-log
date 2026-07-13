export type {
  ExistingWorkoutLogLike,
  GeneratedSessionLike,
  SeedExerciseEditPatch,
  WorkoutExerciseBadge,
  WorkoutExerciseModel,
  WorkoutExerciseSource,
  WorkoutExerciseRef5Meta,
  WorkoutExerciseViewModel,
  WorkoutLogPayload,
  WorkoutNoteModel,
  WorkoutPlannedSetMeta,
  WorkoutRecordDraft,
  WorkoutRecordValidation,
  WorkoutSessionModel,
  WorkoutSessionRef5Meta,
  Ref5TerminationReason,
  WorkoutSetModel,
  WorkoutWorkflowState,
} from "@/lib/workout-record/model";

export {
  addUserExercise,
  createWorkoutRecordDraft,
  createWorkoutRecordDraftFromLog,
  hasWorkoutEdits,
  materializeWorkoutExercises,
  migrateWorkoutRecordDraft,
  patchSeedExercise,
  removeSeedExercise,
  removeUserExercise,
  toWorkoutLogPayload,
  updateUserExercise,
  validateWorkoutDraft,
} from "@/lib/workout-record/model";

export type {
  WorkoutProgramExerciseEntryState,
  WorkoutProgramExerciseEntryStateMap,
} from "@/lib/workout-record/entry-state";

export {
  prepareWorkoutRecordDraftForEntry,
  validateWorkoutRecordEntryState,
} from "@/lib/workout-record/entry-state";
