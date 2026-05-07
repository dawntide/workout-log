import { useCallback, useState } from "react";
import type {
  ExerciseRowAction,
  InlinePickerRequest,
} from "./editor-actions";

type UseWorkoutLogInlinePickerControllerInput = {
  onExerciseAction: (exerciseId: string, action: ExerciseRowAction) => void;
};

export function useWorkoutLogInlinePickerController({
  onExerciseAction,
}: UseWorkoutLogInlinePickerControllerInput) {
  const [inlinePickerRequest, setInlinePickerRequest] =
    useState<InlinePickerRequest | null>(null);

  const openInlinePicker = useCallback((request: InlinePickerRequest) => {
    setInlinePickerRequest(request);
  }, []);

  const closeInlinePicker = useCallback(() => {
    setInlinePickerRequest(null);
  }, []);

  const handleInlinePickerChange = useCallback(
    (value: number) => {
      if (!inlinePickerRequest) return;
      if (inlinePickerRequest.type === "CHANGE_WEIGHT") {
        onExerciseAction(inlinePickerRequest.exerciseId, {
          type: "CHANGE_WEIGHT",
          value,
        });
        return;
      }
      if (inlinePickerRequest.type === "CHANGE_SET_RPE") {
        onExerciseAction(inlinePickerRequest.exerciseId, {
          type: "CHANGE_SET_RPE",
          setIndex: inlinePickerRequest.setIndex,
          value,
        });
        return;
      }

      onExerciseAction(inlinePickerRequest.exerciseId, {
        type: "CHANGE_SET_REPS",
        setIndex: inlinePickerRequest.setIndex,
        value,
      });
    },
    [inlinePickerRequest, onExerciseAction],
  );

  return {
    inlinePickerRequest,
    openInlinePicker,
    closeInlinePicker,
    handleInlinePickerChange,
  };
}
