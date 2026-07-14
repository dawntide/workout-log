package api

import (
	"encoding/json"
	"testing"
)

func TestSessionSnapshotDecodesGenericProgressionMetadata(t *testing.T) {
	var snapshot SessionSnapshot
	err := json.Unmarshal([]byte(`{
		"sessionKey":"D1",
		"plan":{"name":"GZCLP"},
		"exercises":[{
			"exerciseId":"exercise-1",
			"exerciseName":"Back Squat",
			"progressionKey":"D1_s0",
			"progressionTarget":"SQUAT",
			"enforcePlannedReps":true,
			"sets":[{
				"setNumber":3,
				"reps":5,
				"targetWeightKg":"102.5",
				"amrap":true
			}]
		}]
	}`), &snapshot)
	if err != nil {
		t.Fatalf("decode generated snapshot: %v", err)
	}
	if len(snapshot.Exercises) != 1 {
		t.Fatalf("exercises = %d, want 1", len(snapshot.Exercises))
	}
	exercise := snapshot.Exercises[0]
	if exercise.ExerciseID == nil || *exercise.ExerciseID != "exercise-1" {
		t.Errorf("exerciseId = %#v", exercise.ExerciseID)
	}
	if exercise.ProgressionKey != "D1_s0" || exercise.ProgressionTarget != "SQUAT" || !exercise.EnforcePlannedReps {
		t.Errorf("progression metadata = key %q target %q enforce %v", exercise.ProgressionKey, exercise.ProgressionTarget, exercise.EnforcePlannedReps)
	}
	if len(exercise.Sets) != 1 {
		t.Fatalf("sets = %d, want 1", len(exercise.Sets))
	}
	set := exercise.Sets[0]
	if !set.Amrap || set.SetNumber != 3 || set.Reps != 5 || float64(set.TargetWeightKg) != 102.5 {
		t.Errorf("planned set = %#v", set)
	}
}
