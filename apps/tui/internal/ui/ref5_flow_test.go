package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

const (
	ref5FixtureStart      = "2026-07-14T01:02:03.456Z"
	ref5FixtureStartEvent = "start-event-1"
	ref5FixtureCompletion = "start-event-1:completion"
)

func ref5PlanFixture() api.Plan {
	return api.Plan{
		ID: "plan-ref5", Name: "REF5 Adaptive Strength", Type: "SINGLE",
		Params: map[string]any{
			"programFamily": api.Ref5ProgramFamily,
			"timezone":      "Asia/Seoul",
			"ref5":          map[string]any{"protocolVersion": api.Ref5ProtocolVersion},
		},
	}
}

func ref5PullFixture() *api.Ref5PullPrescriptionMetadata {
	average := api.Float64(79.5)
	return &api.Ref5PullPrescriptionMetadata{
		TargetTotalKg: 100, TodayBodyweightKg: 80,
		Recent7DayMeasurementCount: 3, Recent7DayAverageKg: &average,
		CalculationBodyweightKg: 80, LockWindowID: "pull-lock-1",
		LockedAddedKg: 20, ActualTotalKg: 100,
	}
}

func ref5PlannedSetMetaFixture(prescriptionID, stream, role string, setNumber, reps int, external, total float64, pull *api.Ref5PullPrescriptionMetadata) *api.SetMeta {
	ref5 := map[string]any{
		"protocolVersion": api.Ref5ProtocolVersion,
		"snapshotId":      "snapshot-1",
		"sessionId":       "REF5:session-1",
		"prescriptionId":  prescriptionID,
		"stream":          stream,
		"role":            role,
		"setNumber":       setNumber,
		"plannedReps":     reps,
		"externalLoadKg":  external,
		"totalLoadKg":     total,
		"pull":            pull,
	}
	return &api.SetMeta{
		Ref5: ref5,
		Extra: map[string]json.RawMessage{
			"futureSetMeta": json.RawMessage(`{"mustSurvive":true}`),
		},
	}
}

func ref5SessionFixture() *api.GeneratedSession {
	pull := ref5PullFixture()
	squatPrescription := api.Ref5ExercisePrescription{
		PrescriptionID: "rx-sq-1", Lift: "SQ", ExerciseName: "Back Squat",
		Role: "H3", Stream: "HARD", ProgressionTargetKg: 122.5,
		Sets: []api.Ref5PrescriptionSet{
			{SetNumber: 1, PlannedReps: 3, ExternalLoadKg: 120, TotalLoadKg: 120},
			{SetNumber: 2, PlannedReps: 3, ExternalLoadKg: 122.5, TotalLoadKg: 122.5},
		},
	}
	pullPrescription := api.Ref5ExercisePrescription{
		PrescriptionID: "rx-pull-1", Lift: "PULL", ExerciseName: "Weighted Pull-Up",
		Role: "FOCUS", Stream: "HARD", ProgressionTargetKg: 100, Pull: pull,
		Sets: []api.Ref5PrescriptionSet{
			{SetNumber: 1, PlannedReps: 5, ExternalLoadKg: 20, TotalLoadKg: 100},
		},
	}
	omittedPrescription := api.Ref5ExercisePrescription{
		PrescriptionID: "rx-pull-volume-omitted", Lift: "PULL", ExerciseName: "Pull-Up Volume",
		Role: "VOLUME", Stream: "HARD", Omitted: true, Pull: pull,
	}
	decision := api.Ref5SessionDecision{
		SessionType: "HARD", Focus: "PULL", SquatPrescription: "H3",
		MicroReasons: []string{"MANUAL_MICRO"},
	}
	domain := api.Ref5DomainSnapshot{
		SchemaVersion: 1, ProtocolVersion: api.Ref5ProtocolVersion,
		SnapshotID: "snapshot-1", SessionID: "REF5:session-1", RuntimeRevision: 8,
		ActualStartAt: ref5FixtureStart, TimeZone: "Asia/Seoul", CalendarDate: "2026-07-14",
		StartInput: api.Ref5DomainStartInput{
			SessionID: "REF5:session-1", SnapshotID: "snapshot-1",
			ActualStartAt: ref5FixtureStart, TimeZone: "Asia/Seoul",
			TodayBodyweightKg: 80, ManualMicro: true,
		},
		Decision:         decision,
		Exercises:        []api.Ref5ExercisePrescription{squatPrescription, pullPrescription, omittedPrescription},
		TotalWorkingSets: 3,
	}
	return &api.GeneratedSession{
		ID: "generated-ref5-1", PlanID: "plan-ref5",
		SessionKey: "REF5:" + ref5FixtureStart + ":" + ref5FixtureStartEvent,
		Status:     "STARTED",
		Snapshot: api.SessionSnapshot{
			SchemaVersion: 4, ProtocolVersion: api.Ref5ProtocolVersion,
			SessionKey:  "REF5:" + ref5FixtureStart + ":" + ref5FixtureStartEvent,
			SessionDate: "2026-07-14", Timezone: "Asia/Seoul",
			ActualStartAt: ref5FixtureStart, SessionType: "HARD", TotalWorkingSets: 3,
			Plan: api.SnapshotPlan{ID: "plan-ref5", Type: "SINGLE", Name: "REF5 Adaptive Strength"},
			Program: api.SnapshotProgram{
				Slug: api.Ref5TemplateSlug, Kind: api.Ref5ProgramFamily,
				Family: api.Ref5ProgramFamily, ProtocolVersion: api.Ref5ProtocolVersion,
			},
			Ref5: &api.Ref5SessionMetadata{
				ProtocolVersion: api.Ref5ProtocolVersion,
				SnapshotID:      "snapshot-1", SessionID: "REF5:session-1",
				ActualStartAt: ref5FixtureStart, Timezone: "Asia/Seoul",
				StartEventID:          ref5FixtureStartEvent,
				RuntimeRevisionBefore: 8, RuntimeRevisionAfter: 9,
				Decision: decision, DomainSnapshot: domain,
			},
			Exercises: []api.PlannedExercise{
				{
					ExerciseName: "Back Squat", Role: "MAIN",
					Ref5: &api.Ref5ExerciseMetadata{
						ProtocolVersion: api.Ref5ProtocolVersion,
						SnapshotID:      "snapshot-1", SessionID: "REF5:session-1",
						PrescriptionID: "rx-sq-1", Lift: "SQ", Role: "H3", Stream: "HARD",
						ProgressionTargetKg: 122.5,
					},
					Sets: []api.PlannedSet{
						{Reps: 3, PlannedReps: 3, TargetWeightKg: 120, ExternalLoadKg: 120, TotalLoadKg: 120,
							Meta: ref5PlannedSetMetaFixture("rx-sq-1", "HARD", "H3", 1, 3, 120, 120, nil)},
						{Reps: 3, PlannedReps: 3, TargetWeightKg: 122.5, ExternalLoadKg: 122.5, TotalLoadKg: 122.5,
							Meta: ref5PlannedSetMetaFixture("rx-sq-1", "HARD", "H3", 2, 3, 122.5, 122.5, nil)},
					},
				},
				{
					ExerciseName: "Weighted Pull-Up", Role: "MAIN",
					Ref5: &api.Ref5ExerciseMetadata{
						ProtocolVersion: api.Ref5ProtocolVersion,
						SnapshotID:      "snapshot-1", SessionID: "REF5:session-1",
						PrescriptionID: "rx-pull-1", Lift: "PULL", Role: "FOCUS", Stream: "HARD",
						ProgressionTargetKg: 100, Pull: pull,
					},
					Sets: []api.PlannedSet{
						{Reps: 5, PlannedReps: 5, TargetWeightKg: 20, ExternalLoadKg: 20, TotalLoadKg: 100,
							Meta: ref5PlannedSetMetaFixture("rx-pull-1", "HARD", "FOCUS", 1, 5, 20, 100, pull)},
					},
				},
			},
		},
	}
}

func loadRef5Fixture(t *testing.T) Log {
	t.Helper()
	l := NewLog(nil)
	l.load = loadIdle
	l.ref5 = &ref5SessionState{Plan: ref5PlanFixture()}
	if err := l.loadRef5Session(ref5SessionFixture()); err != nil {
		t.Fatalf("loadRef5Session: %v", err)
	}
	return l
}

func fillRef5Fixture(l *Log) {
	for gi := range l.groups {
		for si := range l.groups[gi].sets {
			set := &l.groups[gi].sets[si]
			set.reps = strconv.Itoa(set.tgtReps)
			set.done = true
		}
		l.groups[gi].ref5.TerminationReason = ref5ReasonNormal
	}
	// One missed SQ rep with FORCE_OR_TECHNIQUE is a valid HOLD.
	l.groups[0].sets[1].reps = "2"
	l.groups[0].ref5.TerminationReason = ref5ReasonForce
}

func keyRune(value rune) tea.KeyPressMsg { return tea.KeyPressMsg{Code: value} }

func TestLoadRef5SessionFreezesPrescriptionAndPullLoad(t *testing.T) {
	session := ref5SessionFixture()
	originalPullMeta := session.Snapshot.Exercises[1].Sets[0].Meta
	l := NewLog(nil)
	l.load = loadIdle
	l.ref5 = &ref5SessionState{Plan: ref5PlanFixture()}
	if err := l.loadRef5Session(session); err != nil {
		t.Fatalf("loadRef5Session: %v", err)
	}
	if len(l.groups) != 2 {
		t.Fatalf("groups = %d, want 2 non-omitted prescriptions", len(l.groups))
	}
	if l.generatedSessionID != "generated-ref5-1" || l.planID != "plan-ref5" {
		t.Fatalf("session identity = plan %q / generated %q", l.planID, l.generatedSessionID)
	}
	if got := l.performedAt.UTC().Format(time.RFC3339Nano); got != ref5FixtureStart {
		t.Errorf("performedAt = %q, want immutable actualStartAt %q", got, ref5FixtureStart)
	}
	if l.ref5.CompletionEventID != ref5FixtureCompletion {
		t.Errorf("completion event = %q, want %q", l.ref5.CompletionEventID, ref5FixtureCompletion)
	}

	squat, pull := l.groups[0], l.groups[1]
	if squat.name != "Back Squat" || len(squat.sets) != 2 || squat.sets[1].weight != "122.5" {
		t.Fatalf("frozen squat prescription = %#v", squat)
	}
	if pull.ref5 == nil || pull.ref5.Lift != "PULL" || len(pull.sets) != 1 {
		t.Fatalf("frozen PULL prescription = %#v", pull)
	}
	if pull.sets[0].weight != "20" || pull.sets[0].total != 100 {
		t.Errorf("PULL load = external %q / total %.2f, want +20 / 100", pull.sets[0].weight, pull.sets[0].total)
	}
	if !strings.Contains(pull.tgt, "+20/100") {
		t.Errorf("PULL target label = %q, want added and actual total", pull.tgt)
	}
	if pull.sets[0].originalMeta == originalPullMeta {
		t.Error("planned set metadata must be cloned, not aliased")
	}
	if _, ok := pull.sets[0].originalMeta.Extra["futureSetMeta"]; !ok {
		t.Errorf("future set metadata was lost: %#v", pull.sets[0].originalMeta)
	}
}

func TestRef5PreviewAndStartReuseExactStartEnvelope(t *testing.T) {
	var requests []api.Ref5GenerateRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/plans/plan-ref5/generate" || r.Method != http.MethodPost {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		var req api.Ref5GenerateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode request: %v", err)
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		requests = append(requests, req)
		_ = json.NewEncoder(w).Encode(map[string]any{"session": ref5SessionFixture()})
	}))
	t.Cleanup(server.Close)
	client, err := api.New(server.URL)
	if err != nil {
		t.Fatal(err)
	}

	start := ref5StartValues{
		ActualStartAt: ref5FixtureStart, BodyweightKg: 80,
		ManualMicro: true, ClimbingWithin48h: false,
		StartEventID: ref5FixtureStartEvent,
	}
	l := NewLog(client)
	l.load = loadIdle
	l.ref5 = &ref5SessionState{Phase: ref5Decide, Plan: ref5PlanFixture(), Start: start}

	l, previewCmd := l.requestRef5Preview()
	if previewCmd == nil || l.ref5.Phase != ref5Previewing {
		t.Fatalf("preview did not enter PREVIEW phase: %#v", l.ref5)
	}
	screen, _ := l.Update(previewCmd())
	l = screen.(Log)
	if l.ref5.Phase != ref5PreviewReady || !l.ref5.previewCurrent() {
		t.Fatalf("preview result is not current: %#v", l.ref5)
	}

	l, confirmCmd := l.confirmRef5Start()
	if confirmCmd == nil {
		t.Fatal("confirmRef5Start returned no confirmation command")
	}
	confirm, ok := confirmCmd().(confirmMsg)
	if !ok || confirm.onYes == nil {
		t.Fatalf("confirmation message = %#v", confirm)
	}
	confirmed, ok := confirm.onYes().(ref5StartConfirmedMsg)
	if !ok {
		t.Fatalf("confirmed start message = %#v", confirmed)
	}
	screen, startCmd := l.Update(confirmed)
	l = screen.(Log)
	if l.ref5.Phase != ref5Starting || startCmd == nil {
		t.Fatalf("confirmed start did not enter STARTING before I/O: phase=%v cmd=%v", l.ref5.Phase, startCmd != nil)
	}
	startMsg, ok := startCmd().(ref5StartResultMsg)
	if !ok || startMsg.err != nil {
		t.Fatalf("start result = %#v", startMsg)
	}
	if startMsg.values != start {
		t.Errorf("captured start values changed:\n got  %#v\n want %#v", startMsg.values, start)
	}
	screen, _ = l.Update(startMsg)
	l = screen.(Log)
	if l.ref5 == nil || !l.ref5.active() || l.ref5.Start != start {
		t.Fatalf("active session did not retain start envelope: %#v", l.ref5)
	}

	if len(requests) != 2 {
		t.Fatalf("generate requests = %d, want preview + start", len(requests))
	}
	if !requests[0].Preview || requests[1].Preview {
		t.Errorf("preview flags = %v, %v", requests[0].Preview, requests[1].Preview)
	}
	if requests[0].Ref5 != requests[1].Ref5 {
		t.Errorf("preview/start REF5 envelopes differ:\n preview %#v\n start   %#v", requests[0].Ref5, requests[1].Ref5)
	}
}

func TestRef5PreviewResultWithStaleEnvelopeIsIgnored(t *testing.T) {
	start := ref5StartValues{ActualStartAt: ref5FixtureStart, BodyweightKg: 80, StartEventID: ref5FixtureStartEvent}
	l := NewLog(nil)
	l.ref5 = &ref5SessionState{Phase: ref5Previewing, Plan: ref5PlanFixture(), Start: start}
	staleSignature := start.signature()
	l.ref5.Start.BodyweightKg = 81
	screen, _ := l.Update(ref5PreviewResultMsg{session: ref5SessionFixture(), signature: staleSignature})
	l = screen.(Log)
	if l.ref5.Preview != nil || l.ref5.Phase != ref5Previewing {
		t.Fatalf("stale preview mutated current state: %#v", l.ref5)
	}
}

func TestRef5ActiveKeysCannotMutateFrozenPrescription(t *testing.T) {
	l := loadRef5Fixture(t)
	wantName := l.groups[0].name
	wantWeight := l.groups[0].sets[0].weight
	wantTotal := l.groups[0].sets[0].total
	wantSetCount := len(l.groups[0].sets)
	wantGroupCount := len(l.groups)

	for _, key := range []rune{'h', 'l', 'e', 'o', 'd', 'u', 'a', 'c'} {
		var cmd tea.Cmd
		l, cmd = l.updateNormal(keyRune(key))
		if cmd != nil {
			t.Errorf("locked key %q emitted a command", key)
		}
	}
	if len(l.groups) != wantGroupCount || len(l.groups[0].sets) != wantSetCount {
		t.Fatalf("locked keys changed prescription shape: %#v", l.groups)
	}
	if l.groups[0].name != wantName || l.groups[0].sets[0].weight != wantWeight || l.groups[0].sets[0].total != wantTotal {
		t.Errorf("locked keys changed immutable prescription: %#v", l.groups[0])
	}
	if l.col != colReps {
		t.Errorf("REF5 column = %v, want reps-only", l.col)
	}
}

func TestValidRef5RepsIncludesZeroAndPlannedBound(t *testing.T) {
	for _, tc := range []struct {
		value   string
		planned int
		want    bool
	}{
		{"0", 3, true}, {"1", 3, true}, {"3", 3, true},
		{"-1", 3, false}, {"4", 3, false}, {"1.5", 3, false}, {"", 3, false},
	} {
		if got := validRef5Reps(tc.value, tc.planned); got != tc.want {
			t.Errorf("validRef5Reps(%q, %d) = %v, want %v", tc.value, tc.planned, got, tc.want)
		}
	}
}

func TestRef5RepsEditorAcceptsZeroAndRejectsOverPlan(t *testing.T) {
	t.Run("zero", func(t *testing.T) {
		l := loadRef5Fixture(t)
		l, _ = l.beginEdit(editCell)
		l.edit.SetValue("0")
		l, _ = l.updateEditing(tea.KeyPressMsg{Code: tea.KeyEnter})
		if l.editing || !l.groups[0].sets[0].done || l.groups[0].sets[0].reps != "0" {
			t.Fatalf("zero reps was not recorded: %#v", l.groups[0].sets[0])
		}
	})
	t.Run("over planned", func(t *testing.T) {
		l := loadRef5Fixture(t)
		l, _ = l.beginEdit(editCell)
		l.edit.SetValue("4")
		l, _ = l.updateEditing(tea.KeyPressMsg{Code: tea.KeyEnter})
		if !l.editing || l.groups[0].sets[0].done || !l.statusErr {
			t.Fatalf("over-plan reps was accepted: %#v", l.groups[0].sets[0])
		}
	})
}

func ref5OutcomeGroup(reason string, planned, actual []int) exGroup {
	g := exGroup{name: "Fixture", ref5: &ref5ExerciseEntry{TerminationReason: reason}}
	for i := range planned {
		g.sets = append(g.sets, setEntry{tgtReps: planned[i], reps: strconv.Itoa(actual[i]), done: true})
	}
	return g
}

func TestRef5TerminationClassification(t *testing.T) {
	for _, tc := range []struct {
		name   string
		reason string
		actual []int
		want   string
	}{
		{"normal pass", ref5ReasonNormal, []int{3, 3}, "PASS"},
		{"slowdown full hold", ref5ReasonSlowdown, []int{3, 3}, "HOLD"},
		{"slowdown one short hold", ref5ReasonSlowdown, []int{3, 2}, "HOLD"},
		{"slowdown two short fail", ref5ReasonSlowdown, []int{3, 1}, "FAIL"},
		{"force one short hold", ref5ReasonForce, []int{3, 2}, "HOLD"},
		{"force two short fail", ref5ReasonForce, []int{3, 1}, "FAIL"},
		{"safety invalid", ref5ReasonSafety, []int{3, 3}, "INVALID"},
		{"external invalid", ref5ReasonExternal, []int{0, 0}, "INVALID"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ref5Outcome(ref5OutcomeGroup(tc.reason, []int{3, 3}, tc.actual))
			if err != nil || got != tc.want {
				t.Fatalf("outcome = %q, %v; want %q", got, err, tc.want)
			}
		})
	}
}

func TestRef5TerminationRejectsContradictoryOrIncompleteInput(t *testing.T) {
	for _, tc := range []struct {
		name   string
		reason string
		actual []int
	}{
		{"normal deficit", ref5ReasonNormal, []int{3, 2}},
		{"force without deficit", ref5ReasonForce, []int{3, 3}},
		{"missing reason", "", []int{3, 3}},
		{"over planned", ref5ReasonSlowdown, []int{3, 4}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got, err := ref5Outcome(ref5OutcomeGroup(tc.reason, []int{3, 3}, tc.actual)); err == nil {
				t.Fatalf("outcome = %q, want validation error", got)
			}
		})
	}
	g := ref5OutcomeGroup(ref5ReasonSlowdown, []int{3}, []int{2})
	g.sets[0].done = false
	if _, err := ref5Outcome(g); err == nil {
		t.Fatal("unfinished set must require explicit reps")
	}
}

func metaAsMap(t *testing.T, meta *api.SetMeta) map[string]any {
	t.Helper()
	b, err := json.Marshal(meta)
	if err != nil {
		t.Fatalf("marshal set meta: %v", err)
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("unmarshal set meta: %v", err)
	}
	return out
}

func requireJSONNumber(t *testing.T, object map[string]any, key string, want float64) {
	t.Helper()
	got, ok := object[key].(float64)
	if !ok || got != want {
		t.Errorf("%s = %#v, want %v", key, object[key], want)
	}
}

func TestBuildRef5SaveRequestUsesCanonicalSessionIdentityAndMetadata(t *testing.T) {
	l := loadRef5Fixture(t)
	fillRef5Fixture(&l)
	req, err := buildRef5SaveRequest(l)
	if err != nil {
		t.Fatalf("buildRef5SaveRequest: %v", err)
	}
	if req.PlanID != "plan-ref5" || req.GeneratedSessionID != "generated-ref5-1" {
		t.Errorf("request identity = plan %q / generated %q", req.PlanID, req.GeneratedSessionID)
	}
	if got := req.PerformedAt.UTC().Format(time.RFC3339Nano); got != ref5FixtureStart {
		t.Errorf("performedAt = %q, want %q", got, ref5FixtureStart)
	}
	if req.Timezone != "Asia/Seoul" {
		t.Errorf("timezone = %q, want Asia/Seoul", req.Timezone)
	}
	if len(req.Sets) != 3 {
		t.Fatalf("sets = %d, want every prescribed set", len(req.Sets))
	}

	wantWeights := []float64{120, 122.5, 20}
	wantSetNumbers := []int{1, 2, 1}
	wantPrescriptionIDs := []string{"rx-sq-1", "rx-sq-1", "rx-pull-1"}
	wantRoles := []string{"H3", "H3", "FOCUS"}
	wantReasons := []string{ref5ReasonForce, ref5ReasonForce, ref5ReasonNormal}
	for i, set := range req.Sets {
		if set.WeightKg != wantWeights[i] || set.SetNumber != wantSetNumbers[i] || set.IsExtra {
			t.Errorf("set[%d] immutable fields = %#v", i, set)
		}
		meta := metaAsMap(t, set.Meta)
		if _, ok := meta["futureSetMeta"]; !ok {
			t.Errorf("set[%d] lost unknown original metadata: %#v", i, meta)
		}
		ref5, ok := meta["ref5"].(map[string]any)
		if !ok {
			t.Fatalf("set[%d].meta.ref5 = %#v", i, meta["ref5"])
		}
		for key, want := range map[string]string{
			"protocolVersion":   api.Ref5ProtocolVersion,
			"snapshotId":        "snapshot-1",
			"sessionId":         "REF5:session-1",
			"prescriptionId":    wantPrescriptionIDs[i],
			"stream":            "HARD",
			"role":              wantRoles[i],
			"terminationReason": wantReasons[i],
			"actualStartAt":     ref5FixtureStart,
			"startEventId":      ref5FixtureStartEvent,
			"completionEventId": ref5FixtureCompletion,
		} {
			if got := anyString(ref5, key); got != want {
				t.Errorf("set[%d] %s = %q, want %q", i, key, got, want)
			}
		}
		requireJSONNumber(t, ref5, "setNumber", float64(set.SetNumber))
		requireJSONNumber(t, ref5, "plannedReps", float64([]int{3, 3, 5}[i]))
		requireJSONNumber(t, ref5, "actualReps", float64([]int{3, 2, 5}[i]))
		requireJSONNumber(t, ref5, "externalLoadKg", wantWeights[i])
		requireJSONNumber(t, ref5, "totalLoadKg", []float64{120, 122.5, 100}[i])
		requireJSONNumber(t, ref5, "runtimeRevisionBefore", 8)
		requireJSONNumber(t, ref5, "runtimeRevisionAfter", 9)
		requireJSONNumber(t, ref5, "setIndex", float64([]int{0, 1, 0}[i]))

		prescription, ok := ref5["prescription"].(map[string]any)
		if !ok {
			t.Fatalf("set[%d] prescription identity = %#v", i, ref5["prescription"])
		}
		for key, want := range map[string]string{
			"prescriptionId": wantPrescriptionIDs[i],
			"snapshotId":     "snapshot-1",
			"sessionId":      "REF5:session-1",
		} {
			if got := anyString(prescription, key); got != want {
				t.Errorf("set[%d] prescription.%s = %q, want %q", i, key, got, want)
			}
		}
	}

	pullMeta := metaAsMap(t, req.Sets[2].Meta)
	pullRef5 := pullMeta["ref5"].(map[string]any)
	if pullRef5["pull"] == nil {
		t.Error("PULL lock/calculation metadata is missing")
	}
}

func TestRef5FirstSavePreflightIsDurableAndLocksExactRetry(t *testing.T) {
	store := &memDraftStore{}
	l := loadRef5Fixture(t).withDrafts(store).withOwner("user-a")
	fillRef5Fixture(&l)
	want, err := buildRef5SaveRequest(l)
	if err != nil {
		t.Fatal(err)
	}

	confirmedLog, confirmCmd := l.confirmRef5Save()
	if confirmCmd == nil {
		t.Fatal("valid REF5 completion did not request confirmation")
	}
	confirmation, ok := confirmCmd().(confirmMsg)
	if !ok || confirmation.onYes == nil {
		t.Fatalf("confirmation command = %#v", confirmCmd())
	}
	confirmed, ok := confirmation.onYes().(ref5SaveConfirmedMsg)
	if !ok {
		t.Fatalf("confirmation result = %T", confirmation.onYes())
	}

	screen, cmd := confirmedLog.Update(confirmed)
	got := screen.(Log)
	if cmd == nil || !got.saving || !got.saveUncertain || len(store.data) == 0 {
		t.Fatalf("first REF5 save was not durably locked: saving=%v uncertain=%v draft=%q cmd=%v",
			got.saving, got.saveUncertain, store.data, cmd != nil)
	}
	draft, ok := loadTodayDraft(store, time.Now().Add(48*time.Hour), "user-a")
	if !ok || !draft.SaveUncertain || draft.Ref5 == nil || draft.Ref5.Session == nil {
		t.Fatalf("first save draft = %#v, ok=%v", draft, ok)
	}

	screen, _ = got.Update(saveResultMsg{
		err: errors.New("response lost after commit"), uncertain: true,
		performedAt: want.PerformedAt,
	})
	got = screen.(Log)
	if got.saving || !got.saveUncertain || got.Mode().Label != "VERIFY" {
		t.Fatalf("unknown completion result unlocked input: saving=%v uncertain=%v mode=%q",
			got.saving, got.saveUncertain, got.Mode().Label)
	}
	before, err := buildRef5SaveRequest(got)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, want) {
		t.Fatalf("unknown result changed exact payload:\n got  %#v\n want %#v", before, want)
	}

	blocked, discardCmd := got.updateNormal(tea.KeyPressMsg{Code: 'D', Text: "D"})
	if discardCmd != nil || !blocked.saveUncertain || !blocked.statusErr {
		t.Fatalf("uncertain REF5 save was discardable: uncertain=%v status=%q cmd=%v",
			blocked.saveUncertain, blocked.status, discardCmd != nil)
	}
	retry, confirmCmd := got.updateNormal(tea.KeyPressMsg{Code: 's', Text: "s"})
	if confirmCmd == nil || !retry.saveUncertain {
		t.Fatalf("uncertain REF5 save did not offer exact retry: uncertain=%v cmd=%v", retry.saveUncertain, confirmCmd != nil)
	}
	if confirmation, ok := confirmCmd().(confirmMsg); !ok || confirmation.onYes == nil {
		t.Fatalf("retry command = %#v", confirmCmd())
	}
}

func TestRef5SaveConfirmationRejectsChangedOrStalePayload(t *testing.T) {
	base := loadRef5Fixture(t)
	fillRef5Fixture(&base)
	confirmedLog, confirmCmd := base.confirmRef5Save()
	if confirmCmd == nil {
		t.Fatal("valid REF5 completion did not request confirmation")
	}
	confirmation := confirmCmd().(confirmMsg)
	confirmed := confirmation.onYes().(ref5SaveConfirmedMsg)
	want := confirmed.request

	t.Run("input changed after prompt", func(t *testing.T) {
		l := confirmedLog
		l.groups[0].sets[0].reps = "1"
		screen, cmd := l.Update(confirmed)
		got := screen.(Log)
		if cmd != nil || got.saving || got.saveUncertain || !got.statusErr ||
			!strings.Contains(got.status, "변경") {
			t.Fatalf("changed input used stale confirmation: saving=%v uncertain=%v status=%q cmd=%v",
				got.saving, got.saveUncertain, got.status, cmd != nil)
		}
		if !reflect.DeepEqual(confirmed.request, want) {
			t.Fatal("captured confirmation payload aliased the mutable buffer")
		}
	})

	t.Run("session identity changed after prompt", func(t *testing.T) {
		l := confirmedLog
		l.ref5.CompletionEventID = "different-completion-event"
		screen, cmd := l.Update(confirmed)
		got := screen.(Log)
		if cmd != nil || got.saving || !got.statusErr || !strings.Contains(got.status, "만료") {
			t.Fatalf("stale identity used confirmation: saving=%v status=%q cmd=%v",
				got.saving, got.status, cmd != nil)
		}
	})
}

func TestRef5SaveErrorClassifiesOnlyFirstPostAsUncertain(t *testing.T) {
	l := loadRef5Fixture(t)
	fillRef5Fixture(&l)
	req, err := buildRef5SaveRequest(l)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name      string
		status    int
		editID    string
		uncertain bool
	}{
		{name: "post 500", status: http.StatusInternalServerError, uncertain: true},
		{name: "post 400", status: http.StatusBadRequest, uncertain: false},
		{name: "patch 500", status: http.StatusInternalServerError, editID: "log-ref5", uncertain: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				http.Error(w, "failure", tc.status)
			}))
			defer server.Close()
			client, clientErr := api.New(server.URL)
			if clientErr != nil {
				t.Fatal(clientErr)
			}
			msg := saveRef5Cmd(client, req, tc.editID)().(saveResultMsg)
			if msg.err == nil || msg.uncertain != tc.uncertain {
				t.Fatalf("save result = err %v uncertain %v, want %v", msg.err, msg.uncertain, tc.uncertain)
			}
		})
	}
}

func loggedSetsFromRequest(req api.CreateLogRequest, completionID string) []api.LoggedSet {
	sets := make([]api.LoggedSet, 0, len(req.Sets))
	for _, set := range req.Sets {
		meta := cloneSetMeta(set.Meta)
		meta.Ref5["completionEventId"] = completionID
		sets = append(sets, api.LoggedSet{
			ExerciseName: set.ExerciseName, SortOrder: set.SortOrder,
			SetNumber: set.SetNumber, Reps: set.Reps, WeightKg: api.Float64(set.WeightKg),
			Meta: meta,
		})
	}
	return sets
}

func TestRef5EditPreservesCompletionEventID(t *testing.T) {
	original := loadRef5Fixture(t)
	fillRef5Fixture(&original)
	req, err := buildRef5SaveRequest(original)
	if err != nil {
		t.Fatal(err)
	}
	const existingCompletion = "completion-from-server"
	performedAt := time.Date(2026, 7, 14, 1, 2, 3, 456000000, time.UTC)

	l := NewLog(nil)
	l.loadForEdit(editLogMsg{
		id: "log-ref5-1", performedAt: performedAt,
		sets:     loggedSetsFromRequest(req, existingCompletion),
		planName: "REF5 Adaptive Strength", planID: "plan-ref5",
		generatedSessionID: "generated-ref5-1", generatedSession: ref5SessionFixture(),
	})
	if l.ref5 == nil || l.ref5.CompletionEventID != existingCompletion {
		t.Fatalf("completion event after edit load = %#v", l.ref5)
	}
	if l.editID != "log-ref5-1" {
		t.Errorf("edit id = %q", l.editID)
	}

	updated, err := buildRef5SaveRequest(l)
	if err != nil {
		t.Fatalf("build edit request: %v", err)
	}
	for i, set := range updated.Sets {
		if got := anyString(set.Meta.Ref5, "completionEventId"); got != existingCompletion {
			t.Errorf("set[%d] completion event = %q, want existing %q", i, got, existingCompletion)
		}
	}
}

func TestRef5SavedSessionCanStartAnotherSameDayEvent(t *testing.T) {
	l := loadRef5Fixture(t)
	l.editID = "log-ref5-1"
	oldStartEventID := l.ref5.Start.StartEventID

	next, cmd := l.updateRef5Active(keyRune('n'))
	if next.ref5 == nil || next.ref5.Phase != ref5Decide {
		t.Fatalf("new session state = %#v", next.ref5)
	}
	if next.ref5.Start.StartEventID == "" || next.ref5.Start.StartEventID == oldStartEventID {
		t.Errorf("new same-day start event = %q, old %q", next.ref5.Start.StartEventID, oldStartEventID)
	}
	if next.editID != "" || next.generatedSessionID != "" || next.ref5.Session != nil {
		t.Errorf("new event retained completed session identity: edit=%q generated=%q session=%#v", next.editID, next.generatedSessionID, next.ref5.Session)
	}
	if next.ref5.Plan.ID != "plan-ref5" || next.ref5.Start.BodyweightKg != 80 {
		t.Errorf("new event lost plan/bodyweight defaults: %#v", next.ref5)
	}
	if cmd == nil {
		t.Fatal("new event did not open terminal start-time input")
	}
	opened, ok := cmd().(openPickerMsg)
	if !ok || opened.tag != "ref5-start-at" {
		t.Errorf("new event command = %#v", opened)
	}
}

func TestRef5FixtureIsIndependentAcrossTests(t *testing.T) {
	// Guard the shared helper itself: fixture mutation in one test must not leak
	// into another test and create order-dependent results.
	a, b := ref5SessionFixture(), ref5SessionFixture()
	a.Snapshot.Ref5.StartEventID = "changed"
	a.Snapshot.Exercises[0].Sets[0].Meta.Ref5["plannedReps"] = 99
	if reflect.DeepEqual(a, b) || b.Snapshot.Ref5.StartEventID != ref5FixtureStartEvent {
		t.Fatal("REF5 fixture instances unexpectedly share mutable state")
	}
}
