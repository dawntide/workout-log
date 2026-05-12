"use client";

import { useState, useEffect, memo } from "react";
import { useWorkoutActions, useSet } from "@/store/workoutStore";

interface SetItemProps {
  exerciseIndex: number;
  setIndex: number;
}

/**
 * SetItem Component
 * PERF: Uses local state for inputs to ensure zero-lag typing.
 * Syncs with the global store only on blur or when completion is toggled.
 * Uses atomic selector 'useSet' to only re-render when its specific set changes.
 */
export const SetItem = memo(function SetItem({ exerciseIndex, setIndex }: SetItemProps) {
  const set = useSet(exerciseIndex, setIndex);
  const actions = useWorkoutActions();
  
  // Local state for snappy input response
  const [localWeight, setLocalWeight] = useState(set?.weight?.toString() ?? "");
  const [localReps, setLocalReps] = useState(set?.reps?.toString() ?? "");

  // Keep local state in sync if global state changes externally (e.g. session restore)
  useEffect(() => {
    if (set) {
      setLocalWeight(set.weight.toString());
      setLocalReps(set.reps.toString());
    }
  }, [set, set?.weight, set?.reps]);

  if (!set) return null;

  const handleWeightBlur = () => {
    const val = Number(localWeight);
    if (!isNaN(val) && val !== set.weight) {
      actions.updateSet(exerciseIndex, setIndex, { weight: val });
    }
  };

  const handleRepsBlur = () => {
    const val = Number(localReps);
    if (!isNaN(val) && val !== set.reps) {
      actions.updateSet(exerciseIndex, setIndex, { reps: val });
    }
  };

  const handleToggleComplete = () => {
    // Sync local state first if needed
    handleWeightBlur();
    handleRepsBlur();
    
    actions.toggleSetCompletion(exerciseIndex, setIndex);
  };

  return (
    <div 
      className={`p-3 border rounded-xl transition-all duration-200 ${
        set.completed 
          ? "bg-surface-2 border-transparent opacity-80" 
          : "bg-surface-1 border-border shadow-sm"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-text-secondary">Set {setIndex + 1}</span>
        {set.completed && (
           <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full font-medium">
             Completed
           </span>
        )}
      </div>
      
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-text-tertiary mb-1 ml-1">Weight (kg)</label>
          <input
            type="number"
            inputMode="decimal"
            value={localWeight}
            onChange={(e) => setLocalWeight(e.target.value)}
            onBlur={handleWeightBlur}
            className="w-full bg-surface-base border border-border rounded-lg p-2 text-lg font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            placeholder="0"
          />
        </div>
        
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-text-tertiary mb-1 ml-1">Reps</label>
          <input
            type="number"
            inputMode="numeric"
            value={localReps}
            onChange={(e) => setLocalReps(e.target.value)}
            onBlur={handleRepsBlur}
            className="w-full bg-surface-base border border-border rounded-lg p-2 text-lg font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            placeholder="0"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={handleToggleComplete}
            className={`h-[46px] px-4 rounded-lg font-bold transition-all active:scale-95 ${
              set.completed
                ? "bg-surface-3 text-text-secondary"
                : "bg-primary text-white shadow-lg shadow-primary/20"
            }`}
          >
            {set.completed ? "Undo" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
});
