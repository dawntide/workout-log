package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/config"
)

func TestGeneratedGenericSaveRequiresEveryPrescription(t *testing.T) {
	l := NewLog(nil)
	l.load, l.generatedSessionID = loadIdle, "generated-1"
	l.groups = []exGroup{{name: "Back Squat", sets: []setEntry{
		{weight: "100", reps: "5", done: true, prescribed: true},
		{weight: "100", prescribed: true},
	}}}

	next, cmd := l.save()
	if cmd != nil || !next.statusErr || !strings.Contains(next.status, "모든 세트") {
		t.Fatalf("partial generated save was not blocked: status=%q err=%v cmd=%v", next.status, next.statusErr, cmd != nil)
	}
	next.groups[0].sets[1].reps, next.groups[0].sets[1].done = "0", true
	next, cmd = next.save()
	if cmd == nil || !next.saving {
		t.Fatalf("explicit zero-rep failure should be saveable: status=%q cmd=%v", next.status, cmd != nil)
	}
}

func TestPrescribedSetCannotBeDeletedAndExtraRoundTrips(t *testing.T) {
	store := &memDraftStore{}
	l := NewLog(nil).withDrafts(store)
	l.load = loadIdle
	l.groups = []exGroup{{name: "Back Squat", sets: []setEntry{
		{weight: "100", prescribed: true, setNumber: 1},
		{weight: "20", reps: "10", done: true, isExtra: true, setNumber: 2},
	}}}

	next, _ := l.deleteSet()
	if len(next.groups[0].sets) != 2 || !next.statusErr {
		t.Fatalf("prescribed set deletion changed buffer: %#v", next.groups[0].sets)
	}
	next.persistDraft()
	draft, ok := loadTodayDraft(store, time.Now())
	if !ok || !draft.Groups[0].Sets[0].Prescribed || !draft.Groups[0].Sets[1].IsExtra {
		t.Fatalf("draft lost prescription/extra identity: %#v", draft.Groups)
	}
	restored := NewLog(nil)
	restored.loadFromDraft(draft)
	if !restored.groups[0].sets[0].prescribed || !restored.groups[0].sets[1].isExtra {
		t.Fatalf("restored set identity = %#v", restored.groups[0].sets)
	}

	req := captureGenericSaveRequest(t, []exGroup{{
		name: "Back Squat", progressionKey: "D1_s0", progressionTarget: "SQUAT",
		sets: []setEntry{{weight: "20", reps: "10", done: true, isExtra: true, setNumber: 9, tgtReps: 5}},
	}})
	if len(req.Sets) != 1 || !req.Sets[0].IsExtra || req.Sets[0].SetNumber != 9 {
		t.Fatalf("extra serialization = %#v", req.Sets)
	}
	if planned, ok := decodePlannedRefForTest(t, req.Sets[0]); ok {
		t.Fatalf("extra set unexpectedly received progression metadata: %#v", planned)
	}
}

func TestGeneratedBodyweightPrescriptionUsesActualTotalAndRequiresBodyweight(t *testing.T) {
	snapshot := &api.SessionSnapshot{Exercises: []api.PlannedExercise{{
		ExerciseName: "Weighted Pull-Up",
		Sets:         []api.PlannedSet{{SetNumber: 1, Reps: 5, TargetWeightKg: 75}},
	}}}
	l := NewLog(nil)
	l.load, l.generatedSessionID, l.bodyweight = loadIdle, "generated-bw", 80
	l.loadSnapshot(snapshot, nil)
	set := l.groups[0].sets[0]
	if set.weight != "0" || set.total != 80 || !set.prescribed {
		t.Fatalf("bodyweight-above-target conversion = %#v, want external 0 total 80", set)
	}

	missing := NewLog(nil)
	missing.load, missing.generatedSessionID = loadIdle, "generated-bw"
	missing.loadSnapshot(snapshot, nil)
	missing.groups[0].sets[0].reps, missing.groups[0].sets[0].done = "5", true
	next, cmd := missing.save()
	if cmd != nil || !next.statusErr || !strings.Contains(next.status, "체중") {
		t.Fatalf("missing bodyweight save was not blocked: status=%q cmd=%v", next.status, cmd != nil)
	}
}

func TestHistoryBodyweightEditRestoresMetaBodyweight(t *testing.T) {
	l := NewLog(nil)
	l.loadForEdit(editLogMsg{
		id: "log-bw", generatedSessionID: "generated-bw", performedAt: time.Now(),
		sets: []api.LoggedSet{{
			ExerciseName: "Weighted Pull-Up", WeightKg: 10, Reps: 5,
			Meta: &api.SetMeta{BodyweightKg: 80, TotalLoadKg: 90},
		}},
	})
	if l.bodyweight != 80 || l.groups[0].sets[0].total != 90 || !l.groups[0].sets[0].prescribed {
		t.Fatalf("history bodyweight reconstruction = bw %v set %#v", l.bodyweight, l.groups[0].sets[0])
	}
	l.groups[0].sets[0].weight = "12.5"
	l.recomputeTotal(0, 0)
	if l.groups[0].sets[0].total != 92.5 {
		t.Fatalf("edited total = %v, want 92.5", l.groups[0].sets[0].total)
	}
}

func TestSaveWriteSuccessSurvivesDetailRefreshFailure(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s", r.Method)
		}
		writeUITestJSON(t, w, map[string]any{"log": map[string]any{"id": "log-written"}})
	})
	mux.HandleFunc("/api/logs/log-written", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "refresh down", http.StatusServiceUnavailable)
	})
	client := newUITestClient(t, mux)
	store := &memDraftStore{}
	l := NewLog(client).withDrafts(store)
	l.load, l.genericDirty = loadIdle, true
	l.groups = []exGroup{{name: "Back Squat", sets: []setEntry{{weight: "100", reps: "5", done: true}}}}
	l.persistDraft()
	msg := saveCmd(client, l.groups, "", time.Now(), "", "", "mutation-refresh")().(saveResultMsg)
	if msg.err != nil || msg.refreshErr == nil || msg.savedID != "log-written" {
		t.Fatalf("write/read boundary result = %#v", msg)
	}
	screen, _ := l.Update(msg)
	saved := screen.(Log)
	if saved.editID != "log-written" || saved.genericDirty || store.data != nil || saved.statusErr ||
		!strings.Contains(saved.status, "저장은 완료됨") {
		t.Fatalf("successful write was not finalized: id=%q dirty=%v draft=%v status=%q err=%v",
			saved.editID, saved.genericDirty, store.data != nil, saved.status, saved.statusErr)
	}
}

func TestGenericSessionResultsAreOneShotAndResetOldEditIdentity(t *testing.T) {
	snapshot := &api.SessionSnapshot{Exercises: []api.PlannedExercise{{
		ExerciseName: "Back Squat", Sets: []api.PlannedSet{{Reps: 5, TargetWeightKg: 100}},
	}}}
	l := NewLog(nil)
	l.planID = "plan-a"
	screen, _ := l.Update(sessionLoadedMsg{snapshot: snapshot, planID: "plan-a", generatedSessionID: "session-a"})
	loaded := screen.(Log)
	loaded.groups[0].sets[0].reps, loaded.genericDirty = "3", true
	screen, cmd := loaded.Update(sessionLoadedMsg{snapshot: snapshot, planID: "plan-a", generatedSessionID: "duplicate"})
	duplicate := screen.(Log)
	if cmd != nil || duplicate.generatedSessionID != "session-a" || duplicate.groups[0].sets[0].reps != "3" {
		t.Fatalf("duplicate session result replaced input: %#v", duplicate)
	}

	cleanEdit := NewLog(nil)
	cleanEdit.load, cleanEdit.editID, cleanEdit.generatedSessionID = loadIdle, "old-log", "old-session"
	cleanEdit.performedAt = time.Now().Add(-24 * time.Hour)
	cleanEdit.groups = []exGroup{{name: "Bench Press", sets: []setEntry{{weight: "80", reps: "5", done: true}}}}
	screen, cmd = cleanEdit.Update(planActivatedMsg{id: "plan-b", name: "B", plan: api.Plan{ID: "plan-b"}})
	loading := screen.(Log)
	if cmd == nil || loading.editID != "" || !loading.performedAt.IsZero() || loading.generatedSessionID != "" ||
		len(loading.groups) != 0 || loading.planID != "plan-b" || loading.load != loadPending {
		t.Fatalf("plan activation retained old PATCH identity: %#v", loading)
	}
}

func TestOverrideResultIsCorrelatedAndLocksInput(t *testing.T) {
	l := NewLog(nil)
	l.load, l.planID, l.pendingOverride, l.overridePlanID = loadIdle, "plan-b", false, ""
	l.groups = []exGroup{{name: "Bench Press", sets: []setEntry{{reps: "2"}}}}
	screen, cmd := l.Update(overrideDoneMsg{planID: "plan-a", desc: "stale"})
	stale := screen.(Log)
	if cmd != nil || stale.planID != "plan-b" || stale.groups[0].sets[0].reps != "2" {
		t.Fatalf("stale override replaced current plan: %#v", stale)
	}

	pending := NewLog(nil)
	pending.load, pending.planID, pending.pendingOverride, pending.overridePlanID = loadIdle, "plan-a", true, "plan-a"
	pending.groups = []exGroup{{name: "Back Squat", sets: []setEntry{{reps: ""}}}}
	locked, keyCmd := pending.updateNormal(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if keyCmd != nil || locked.groups[0].sets[0].done {
		t.Fatal("input mutated while override request was in flight")
	}
	screen, cmd = pending.Update(overrideDoneMsg{planID: "plan-a", desc: "ok"})
	current := screen.(Log)
	if cmd == nil || current.pendingOverride || current.planID != "plan-a" || current.load != loadPending || len(current.groups) != 0 {
		t.Fatalf("current override did not enter correlated reload: %#v", current)
	}
}

func TestDirtyGenericHasExplicitDiscardAndBlocksDestructiveConfirm(t *testing.T) {
	store := &memDraftStore{}
	l := NewLog(nil).withDrafts(store)
	l.load, l.planID, l.genericDirty = loadIdle, "plan-a", true
	l.groups = []exGroup{{name: "Back Squat", sets: []setEntry{{weight: "100", reps: "3", done: true}}}}
	l.persistDraft()

	next, cmd := l.updateNormal(tea.KeyPressMsg{Code: 'D', Text: "D"})
	if cmd == nil || !next.genericDirty {
		t.Fatal("dirty generic buffer has no explicit discard confirmation")
	}
	if _, ok := cmd().(confirmMsg); !ok {
		t.Fatalf("discard command = %#v", cmd())
	}

	f := NewFrame(nil, nil)
	f.views[vToday] = l
	model, _ := f.Update(confirmMsg{prompt: "delete", planID: "plan-a", onYes: func() tea.Msg { return nil }})
	blocked := model.(Frame)
	if blocked.overlay != overlayNone || blocked.active != vToday {
		t.Fatalf("destructive confirmation was not blocked: overlay=%v active=%v", blocked.overlay, blocked.active)
	}

	screen, reload := l.Update(genericDiscardConfirmedMsg{})
	discarded := screen.(Log)
	if reload == nil || discarded.genericDirty || len(discarded.groups) != 0 || store.data != nil {
		t.Fatalf("discard did not clear/reload buffer: %#v draft=%v", discarded, store.data != nil)
	}
}

func TestDeleteSuccessResetsMatchingCleanTodayIdentity(t *testing.T) {
	f := NewFrame(nil, nil)
	today := NewLog(nil)
	today.load, today.planID, today.editID, today.generatedSessionID = loadIdle, "plan-a", "log-a", "session-a"
	today.groups = []exGroup{{name: "Back Squat", sets: []setEntry{{done: true}}}}
	f.views[vToday] = today

	model, _ := f.Update(logDeletedMsg{id: "log-a"})
	afterLog := model.(Frame).views[vToday].(Log)
	if afterLog.editID != "" || afterLog.generatedSessionID != "" || len(afterLog.groups) != 0 {
		t.Fatalf("deleted log identity remained in Today: %#v", afterLog)
	}

	f = NewFrame(nil, nil)
	today.planID, today.editID, today.generatedSessionID = "plan-a", "", "session-a"
	f.views[vToday] = today
	model, _ = f.Update(planDeletedMsg{id: "plan-a"})
	afterPlan := model.(Frame).views[vToday].(Log)
	if afterPlan.planID != "" || afterPlan.generatedSessionID != "" || len(afterPlan.groups) != 0 {
		t.Fatalf("deleted plan identity remained in Today: %#v", afterPlan)
	}
}

func TestStatsExercisePickerKeepsStatsOwnership(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/exercises", func(w http.ResponseWriter, _ *http.Request) {
		writeUITestJSON(t, w, map[string]any{"items": []map[string]any{{"id": "squat", "name": "Back Squat"}}})
	})
	msg, ok := openStatsExercisePickerCmd(newUITestClient(t, mux))().(openPickerMsg)
	if !ok || !msg.owned || msg.owner != vStats || msg.tag != "exercise" {
		t.Fatalf("stats picker ownership = %#v", msg)
	}
}

func TestOwnerBoundDraftAndFrameGeneration(t *testing.T) {
	store := &memDraftStore{}
	l := NewLog(nil).withDrafts(store).withOwner("user-a")
	l.load, l.groups = loadIdle, []exGroup{{name: "Back Squat", sets: []setEntry{{done: true}}}}
	l.persistDraft()
	if _, ok := loadTodayDraft(store, time.Now(), "user-b"); ok {
		t.Fatal("another account loaded user-a's draft")
	}
	if _, ok := loadTodayDraft(store, time.Now(), "user-a"); !ok {
		t.Fatal("draft owner could not reload its own draft")
	}

	a := App{state: stateFrame, authGeneration: 2, frame: NewFrame(nil, nil)}
	today := a.frame.views[vToday].(Log)
	today.groups = []exGroup{{name: "sentinel"}}
	a.frame.views[vToday] = today
	model, _ := a.Update(frameScopedMsg{generation: 1, msg: sessionLoadedMsg{noPlan: true}})
	if got := model.(App).frame.views[vToday].(Log); len(got.groups) != 1 || got.groups[0].name != "sentinel" {
		t.Fatalf("stale account generation mutated fresh frame: %#v", got.groups)
	}

	a = model.(App)
	model, _ = a.Update(authCheckedMsg{user: &api.User{ID: "user-b"}})
	fresh := model.(App)
	if fresh.authGeneration != 3 || fresh.frame.views[vToday].(Log).ownerID != "user-b" ||
		len(fresh.frame.views[vToday].(Log).groups) != 0 {
		t.Fatalf("auth success reused old frame: generation=%d today=%#v", fresh.authGeneration, fresh.frame.views[vToday])
	}
}

func TestFrameScopePreservesQuitAndPersistsRotatedToken(t *testing.T) {
	if _, ok := scopeFrameCmd(1, tea.Quit)().(tea.QuitMsg); !ok {
		t.Fatal("frame auth scoping swallowed tea.Quit")
	}

	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	client := newUITestClient(t, http.NewServeMux())
	client.SetSessionToken("rotated-token")
	a := App{cfg: cfg, client: client, state: stateFrame, authGeneration: 1, frame: NewFrame(client, cfg)}
	a.Update(accountActionMsg{ok: "changed", tokenRotated: true})
	if got := cfg.SessionToken(); got != "rotated-token" {
		t.Fatalf("rotated token persisted as %q", got)
	}

	next, _ := a.Update(loggedOutMsg{err: errors.New("offline")})
	if got := next.(App); got.state != stateFrame || !strings.Contains(got.frame.flash, "로그아웃 실패") {
		t.Fatalf("failed remote logout left authenticated UI: state=%v flash=%q", got.state, got.frame.flash)
	}
}

func TestImportCannotReplaceDirtyTodayAndSuccessRebuildsFrame(t *testing.T) {
	store := &memDraftStore{}
	l := NewLog(nil).withDrafts(store).withOwner("user-a")
	l.load, l.genericDirty = loadIdle, true
	l.groups = []exGroup{{name: "Back Squat", sets: []setEntry{{done: true}}}}
	l.persistDraft()
	f := NewFrame(nil, store, "user-a")
	f.views[vToday] = l
	model, cmd := f.runCommand("import /tmp/export.json")
	blocked := model.(Frame)
	if cmd != nil || blocked.flash == "" || blocked.active != vToday {
		t.Fatalf("dirty import was not blocked: flash=%q cmd=%v", blocked.flash, cmd != nil)
	}

	f.pendingImportID = 1
	model, _ = f.Update(importDryRunMsg{requestID: 1, data: json.RawMessage(`{"version":1}`)})
	if got := model.(Frame); got.overlay != overlayNone {
		t.Fatalf("late dry-run opened replacement confirm over dirty Today: overlay=%v", got.overlay)
	}

	l.genericDirty = false
	f.views[vToday] = l
	f.pendingImportID, f.importing = 2, true
	model, cmd = f.Update(importDoneMsg{requestID: 2})
	rebuilt := model.(Frame)
	newToday := rebuilt.views[vToday].(Log)
	if cmd == nil || len(newToday.groups) != 0 || newToday.ownerID != "user-a" || store.data != nil {
		t.Fatalf("successful import retained stale state: today=%#v draft=%v cmd=%v", newToday, store.data != nil, cmd != nil)
	}
}

func TestGenericHistoryDraftKeepsExactPatchIdentity(t *testing.T) {
	store := &memDraftStore{}
	l := draftedLog(store)
	l.editID = "older-edit"
	l.persistDraft()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/plans", func(w http.ResponseWriter, _ *http.Request) {
		writeUITestJSON(t, w, map[string]any{"items": []any{}})
	})
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, _ *http.Request) {
		writeUITestJSON(t, w, map[string]any{"items": []map[string]any{{
			"id": "different-today", "performedAt": time.Now(), "sets": []any{},
		}}})
	})
	mux.HandleFunc("/api/logs/older-edit", func(w http.ResponseWriter, _ *http.Request) {
		writeUITestJSON(t, w, map[string]any{"item": map[string]any{
			"id": "older-edit", "performedAt": time.Now().Add(-24 * time.Hour), "sets": []any{},
		}})
	})
	msg := autoloadCmd(newUITestClient(t, mux), store)()
	restored, ok := msg.(draftRestoredMsg)
	if !ok || restored.draft.EditID != "older-edit" {
		t.Fatalf("exact history edit draft became drop/POST: %#v", msg)
	}
}

func TestSetMetaExtraJSONStillDecodesAfterSafetyRoundTrip(t *testing.T) {
	// Small sentinel ensuring the extra-set branch above does not mutate shared
	// RawMessage maps while adding metadata to a sibling set.
	original := &api.SetMeta{Extra: map[string]json.RawMessage{"future": json.RawMessage(`{"keep":true}`)}}
	groups := []exGroup{{name: "Back Squat", progressionKey: "D1_s0", sets: []setEntry{
		{weight: "100", reps: "5", done: true, prescribed: true, tgtReps: 5, originalMeta: original},
		{weight: "20", reps: "10", done: true, isExtra: true, originalMeta: original},
	}}}
	req := captureGenericSaveRequest(t, groups)
	if string(req.Sets[0].Meta.Extra["future"]) != `{"keep":true}` || string(req.Sets[1].Meta.Extra["future"]) != `{"keep":true}` {
		t.Fatalf("lossless metadata changed: %#v", req.Sets)
	}
}
