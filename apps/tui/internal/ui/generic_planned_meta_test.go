package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func captureGenericSaveRequest(t *testing.T, groups []exGroup) api.CreateLogRequest {
	t.Helper()
	var posted api.CreateLogRequest
	mux := http.NewServeMux()
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("save method = %s, want POST", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&posted); err != nil {
			t.Errorf("decode save request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"log": map[string]any{"id": "saved-log"}})
	})
	mux.HandleFunc("/api/logs/saved-log", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"item": map[string]any{
			"id": "saved-log", "performedAt": "2026-07-14T00:00:00Z", "sets": []any{},
		}})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client, err := api.New(server.URL)
	if err != nil {
		t.Fatal(err)
	}

	msg := saveCmd(
		client, groups, "", time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC),
		"generic-plan", "generic-generated-session", "mutation-planned-meta",
	)()
	result, ok := msg.(saveResultMsg)
	if !ok || result.err != nil {
		t.Fatalf("save result = %#v", msg)
	}
	return posted
}

func decodePlannedRefForTest(t *testing.T, set api.WorkoutSet) (map[string]any, bool) {
	t.Helper()
	if set.Meta == nil || set.Meta.Extra == nil || len(set.Meta.Extra["plannedRef"]) == 0 {
		return nil, false
	}
	var value map[string]any
	if err := json.Unmarshal(set.Meta.Extra["plannedRef"], &value); err != nil {
		t.Fatalf("decode plannedRef: %v", err)
	}
	return value, true
}

func hasTrueExtraForTest(t *testing.T, set api.WorkoutSet, key string) bool {
	t.Helper()
	if set.Meta == nil || len(set.Meta.Extra[key]) == 0 {
		return false
	}
	var value bool
	if err := json.Unmarshal(set.Meta.Extra[key], &value); err != nil {
		t.Fatalf("decode %s: %v", key, err)
	}
	return value
}

func TestGenericSaveMirrorsWebPlannedRefAndAmrapRules(t *testing.T) {
	doneSet := func(reps int, amrap bool) []setEntry {
		return []setEntry{{weight: "100", reps: "4", done: true, tgtReps: reps, setNumber: 1, amrap: amrap}}
	}
	groups := []exGroup{
		{name: "Slotted Squat", progressionKey: "D1_s0", progressionTarget: "SQUAT", sets: doneSet(5, false)},
		{name: "Slotted AMRAP", progressionKey: "D1_s1", progressionTarget: "SQUAT", enforcePlannedReps: true, sets: doneSet(5, true)},
		{name: "Operator Legacy", progressionKey: "EX_BACK_SQUAT", progressionTarget: "SQUAT", sets: doneSet(5, false)},
		{name: "User Exercise", sets: doneSet(10, false)},
		{name: "Operator Enforced", progressionKey: "EX_BENCH_PRESS", progressionTarget: "BENCH", enforcePlannedReps: true, sets: doneSet(5, false)},
		{name: "Uniform AMRAP", progressionTarget: "BENCH", enforcePlannedReps: true, sets: doneSet(5, true)},
	}

	req := captureGenericSaveRequest(t, groups)
	if req.PlanID != "generic-plan" || req.GeneratedSessionID != "generic-generated-session" ||
		req.ClientMutationID != "mutation-planned-meta" || len(req.Sets) != len(groups) {
		t.Fatalf("generic save identity/sets = %#v", req)
	}

	first, ok := decodePlannedRefForTest(t, req.Sets[0])
	if !ok || first["progressionKey"] != "D1_s0" || first["progressionLabel"] != "Slotted Squat" ||
		first["progressionTarget"] != "SQUAT" || first["reps"] != float64(5) || first["amrap"] != nil {
		t.Errorf("non-AMRAP slotted plannedRef = %#v", first)
	}

	second, ok := decodePlannedRefForTest(t, req.Sets[1])
	if !ok || second["progressionKey"] != "D1_s1" || second["progressionLabel"] != "Slotted AMRAP" ||
		second["reps"] != float64(5) || second["amrap"] != true {
		t.Errorf("AMRAP slotted plannedRef = %#v", second)
	}
	if !hasTrueExtraForTest(t, req.Sets[1], "amrap") {
		t.Error("AMRAP set did not receive top-level meta.amrap")
	}

	for _, index := range []int{2, 3} {
		if value, ok := decodePlannedRefForTest(t, req.Sets[index]); ok {
			t.Errorf("legacy/user set[%d] unexpectedly got plannedRef %#v", index, value)
		}
	}

	enforced, ok := decodePlannedRefForTest(t, req.Sets[4])
	if !ok || enforced["reps"] != float64(5) || enforced["progressionTarget"] != "BENCH" ||
		enforced["progressionKey"] != nil || enforced["progressionLabel"] != nil {
		t.Errorf("operator enforced plannedRef = %#v", enforced)
	}

	if value, ok := decodePlannedRefForTest(t, req.Sets[5]); ok {
		t.Errorf("uniform AMRAP must skip reps-only enforcement plannedRef, got %#v", value)
	}
	if !hasTrueExtraForTest(t, req.Sets[5], "amrap") {
		t.Error("uniform AMRAP set did not receive top-level meta.amrap")
	}
}

func TestRef5SavePathDoesNotLeakGenericPlannedMetadata(t *testing.T) {
	l := loadRef5Fixture(t)
	fillRef5Fixture(&l)
	for gi := range l.groups {
		l.groups[gi].progressionKey = "D1_s" + string(rune('0'+gi))
		l.groups[gi].progressionTarget = "SHOULD_NOT_LEAK"
		l.groups[gi].enforcePlannedReps = true
		for si := range l.groups[gi].sets {
			l.groups[gi].sets[si].amrap = true
		}
	}

	next, confirm := l.save()
	if confirm == nil || next.saving {
		t.Fatalf("REF5 save did not stay on its confirmation path: saving=%v cmd=%v", next.saving, confirm != nil)
	}
	if _, ok := confirm().(confirmMsg); !ok {
		t.Fatalf("REF5 save command = %T, want confirmMsg", confirm())
	}
	req, err := buildRef5SaveRequest(next)
	if err != nil {
		t.Fatal(err)
	}
	for index, set := range req.Sets {
		if set.Meta == nil {
			t.Fatalf("REF5 set[%d] lost canonical metadata", index)
		}
		if _, exists := set.Meta.Extra["plannedRef"]; exists {
			t.Errorf("REF5 set[%d] leaked generic plannedRef", index)
		}
		if _, exists := set.Meta.Extra["amrap"]; exists {
			t.Errorf("REF5 set[%d] leaked generic amrap marker", index)
		}
	}
}
