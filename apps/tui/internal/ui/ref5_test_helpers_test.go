package ui

import (
	"encoding/json"
	"time"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func uiRef5Plan() api.Plan {
	return api.Plan{
		ID:   "plan-ref5",
		Name: "REF5 Adaptive Strength",
		Type: "SINGLE",
		Params: map[string]any{
			"programFamily":   api.Ref5ProgramFamily,
			"protocolVersion": api.Ref5ProtocolVersion,
			"timezone":        "Asia/Seoul",
			"ref5": map[string]any{
				"schemaVersion":   2,
				"protocolVersion": api.Ref5ProtocolVersion,
			},
		},
		CreatedAt: time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC),
	}
}

func uiRef5SetMeta(snapshotID, sessionID, prescriptionID string, setNumber, plannedReps int) *api.SetMeta {
	return &api.SetMeta{
		Ref5: map[string]any{
			"protocolVersion": api.Ref5ProtocolVersion,
			"snapshotId":      snapshotID,
			"sessionId":       sessionID,
			"prescriptionId":  prescriptionID,
			"setNumber":       setNumber,
			"plannedReps":     plannedReps,
			"immutableMarker": "keep-me",
		},
		Extra: map[string]json.RawMessage{
			"futureEngineField": json.RawMessage(`{"nested":[1,"two",true]}`),
		},
	}
}

func uiRef5Session(id string, startedAt time.Time) api.GeneratedSession {
	actualStartAt := startedAt.UTC().Format(time.RFC3339Nano)
	sessionID := "REF5:" + actualStartAt + ":start:event:" + id
	snapshotID := "snapshot-" + id
	startEventID := "start:event:" + id

	decision := api.Ref5SessionDecision{
		SessionType:       "NORMAL",
		Focus:             "PULL",
		SquatPrescription: "H3",
		MicroReasons:      []string{"STAGNATION_BP"},
	}
	startInput := api.Ref5DomainStartInput{
		SessionID:         sessionID,
		SnapshotID:        snapshotID,
		ActualStartAt:     actualStartAt,
		TimeZone:          "Asia/Seoul",
		TodayBodyweightKg: 82.5,
		ManualMicro:       true,
	}
	squatPrescription := api.Ref5ExercisePrescription{
		PrescriptionID: "rx-squat-" + id,
		Lift:           "SQ",
		ExerciseName:   "Back Squat",
		Role:           "HARD",
		Stream:         "H3",
		Sets: []api.Ref5PrescriptionSet{
			{SetNumber: 1, PlannedReps: 3, ExternalLoadKg: 102.5, TotalLoadKg: 102.5},
			{SetNumber: 2, PlannedReps: 3, ExternalLoadKg: 102.5, TotalLoadKg: 102.5},
		},
		ProgressionTargetKg: 102.5,
	}
	pullPrescription := api.Ref5ExercisePrescription{
		PrescriptionID: "rx-pull-" + id,
		Lift:           "PULL",
		ExerciseName:   "Weighted Pull-Up",
		Role:           "FOCUS",
		Stream:         "FOCUS",
		Sets: []api.Ref5PrescriptionSet{
			{SetNumber: 1, PlannedReps: 5, ExternalLoadKg: 7.5, TotalLoadKg: 90},
			{SetNumber: 2, PlannedReps: 5, ExternalLoadKg: 7.5, TotalLoadKg: 90},
		},
		ProgressionTargetKg: 90,
		Pull: &api.Ref5PullPrescriptionMetadata{
			TargetTotalKg: 90, TodayBodyweightKg: 82.5, CalculationBodyweightKg: 82.5,
			LockWindowID: "pull-window-7", LockedAddedKg: 7.5, ActualTotalKg: 90,
		},
	}
	meta := &api.Ref5SessionMetadata{
		ProtocolVersion:       api.Ref5ProtocolVersion,
		StartCommitted:        true,
		SnapshotID:            snapshotID,
		SessionID:             sessionID,
		ActualStartAt:         actualStartAt,
		Timezone:              "Asia/Seoul",
		StartEventID:          startEventID,
		RuntimeRevisionBefore: 6,
		RuntimeRevisionAfter:  7,
		Decision:              decision,
		DomainSnapshot: api.Ref5DomainSnapshot{
			SchemaVersion:    2,
			ProtocolVersion:  api.Ref5ProtocolVersion,
			SnapshotID:       snapshotID,
			SessionID:        sessionID,
			RuntimeRevision:  6,
			ActualStartAt:    actualStartAt,
			TimeZone:         "Asia/Seoul",
			CalendarDate:     startedAt.In(time.FixedZone("KST", 9*60*60)).Format("2006-01-02"),
			StartInput:       startInput,
			Decision:         decision,
			Exercises:        []api.Ref5ExercisePrescription{squatPrescription, pullPrescription},
			TotalWorkingSets: 4,
		},
	}

	return api.GeneratedSession{
		ID:         id,
		PlanID:     "plan-ref5",
		SessionKey: sessionID,
		Status:     "STARTED",
		Snapshot: api.SessionSnapshot{
			SchemaVersion:    4,
			ProtocolVersion:  api.Ref5ProtocolVersion,
			SessionKey:       sessionID,
			SessionDate:      meta.DomainSnapshot.CalendarDate,
			Timezone:         "Asia/Seoul",
			ActualStartAt:    actualStartAt,
			SessionType:      decision.SessionType,
			TotalWorkingSets: 4,
			Plan:             api.SnapshotPlan{ID: "plan-ref5", Type: "SINGLE", Name: "REF5 Adaptive Strength"},
			Program: api.SnapshotProgram{
				Slug: api.Ref5TemplateSlug, Name: "REF5 Adaptive Strength", Type: "LOGIC",
				Kind: api.Ref5ProgramFamily, Family: api.Ref5ProgramFamily, ProtocolVersion: api.Ref5ProtocolVersion,
			},
			Ref5: meta,
			Exercises: []api.PlannedExercise{
				{
					ExerciseName: "Back Squat", Role: "MAIN", RowType: "AUTO", Order: 0,
					ProgressionTarget: "SQUAT",
					Ref5: &api.Ref5ExerciseMetadata{
						ProtocolVersion: api.Ref5ProtocolVersion, SnapshotID: snapshotID, SessionID: sessionID,
						PrescriptionID: squatPrescription.PrescriptionID, Lift: "SQ", Role: "HARD", Stream: "H3",
						ProgressionTargetKg: 102.5,
					},
					Sets: []api.PlannedSet{
						{SetNumber: 1, Reps: 3, PlannedReps: 3, TargetWeightKg: 102.5, ExternalLoadKg: 102.5, TotalLoadKg: 102.5, Meta: uiRef5SetMeta(snapshotID, sessionID, squatPrescription.PrescriptionID, 1, 3)},
						{SetNumber: 2, Reps: 3, PlannedReps: 3, TargetWeightKg: 102.5, ExternalLoadKg: 102.5, TotalLoadKg: 102.5, Meta: uiRef5SetMeta(snapshotID, sessionID, squatPrescription.PrescriptionID, 2, 3)},
					},
				},
				{
					ExerciseName: "Weighted Pull-Up", Role: "MAIN", RowType: "AUTO", Order: 1,
					ProgressionTarget: "PULL",
					Ref5: &api.Ref5ExerciseMetadata{
						ProtocolVersion: api.Ref5ProtocolVersion, SnapshotID: snapshotID, SessionID: sessionID,
						PrescriptionID: pullPrescription.PrescriptionID, Lift: "PULL", Role: "FOCUS", Stream: "FOCUS",
						ProgressionTargetKg: 90, Pull: pullPrescription.Pull,
					},
					Sets: []api.PlannedSet{
						{SetNumber: 1, Reps: 5, PlannedReps: 5, TargetWeightKg: 7.5, ExternalLoadKg: 7.5, TotalLoadKg: 90, Meta: uiRef5SetMeta(snapshotID, sessionID, pullPrescription.PrescriptionID, 1, 5)},
						{SetNumber: 2, Reps: 5, PlannedReps: 5, TargetWeightKg: 7.5, ExternalLoadKg: 7.5, TotalLoadKg: 90, Meta: uiRef5SetMeta(snapshotID, sessionID, pullPrescription.PrescriptionID, 2, 5)},
					},
				},
			},
		},
	}
}

func uiRef5LoggedSets(session api.GeneratedSession, completionEventID string) []api.LoggedSet {
	var out []api.LoggedSet
	for _, exercise := range session.Snapshot.Exercises {
		if exercise.Ref5 == nil {
			continue
		}
		prescription := openJSON(exercise.Ref5)
		for index, planned := range exercise.Sets {
			setNumber := planned.SetNumber
			if setNumber <= 0 {
				setNumber = index + 1
			}
			reps := planned.PlannedReps
			if reps <= 0 {
				reps = planned.Reps
			}
			meta := cloneSetMeta(planned.Meta)
			meta.Ref5 = map[string]any{
				"prescriptionId":    exercise.Ref5.PrescriptionID,
				"prescription":      prescription,
				"terminationReason": ref5ReasonNormal,
				"completionEventId": completionEventID,
				"setNumber":         setNumber,
			}
			out = append(out, api.LoggedSet{
				ExerciseName: exercise.ExerciseName,
				SortOrder:    exercise.Order,
				SetNumber:    setNumber,
				WeightKg:     planned.ExternalLoadKg,
				Reps:         reps,
				Meta:         meta,
			})
		}
	}
	return out
}

func stringPtr(value string) *string { return &value }
