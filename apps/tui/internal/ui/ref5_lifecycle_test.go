package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func writeUITestJSON(t *testing.T, w http.ResponseWriter, value any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		t.Errorf("encode response: %v", err)
	}
}

func newUITestClient(t *testing.T, handler http.Handler) *api.Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client, err := api.New(server.URL)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	return client
}

func ref5DraftFixture(t *testing.T, now time.Time) (todayDraft, api.GeneratedSession) {
	t.Helper()
	session := uiRef5Session("session-draft", now.Add(-2*time.Hour))
	log := NewLog(nil)
	log.ref5 = &ref5SessionState{Plan: uiRef5Plan()}
	if err := log.loadRef5Session(&session); err != nil {
		t.Fatalf("loadRef5Session: %v", err)
	}
	log.ref5.CompletionEventID = "completion:event:stable"
	log.groups[0].ref5.TerminationReason = ref5ReasonSlowdown
	log.groups[0].sets[0].reps = "2"
	log.groups[0].sets[0].done = true
	return draftFromLog(&log, now), session
}

func storeDraftForTest(t *testing.T, store *memDraftStore, draft todayDraft) {
	t.Helper()
	raw, err := json.Marshal(draft)
	if err != nil {
		t.Fatalf("marshal draft: %v", err)
	}
	store.data = raw
}

func TestRef5DraftSurvivesMidnightWhileGenericDraftExpires(t *testing.T) {
	beforeMidnight := time.Date(2026, 7, 14, 23, 59, 0, 0, time.Local)
	afterMidnight := beforeMidnight.Add(2 * time.Minute)

	ref5Draft, _ := ref5DraftFixture(t, beforeMidnight)
	ref5Store := &memDraftStore{}
	storeDraftForTest(t, ref5Store, ref5Draft)
	if restored, ok := loadTodayDraft(ref5Store, afterMidnight); !ok || restored.Ref5 == nil {
		t.Fatalf("started REF5 draft was dropped across midnight: ok=%v draft=%#v", ok, restored.Ref5)
	}

	generic := draftedLog(nil)
	generic.editID = ""
	genericDraft := draftFromLog(&generic, beforeMidnight)
	genericStore := &memDraftStore{}
	storeDraftForTest(t, genericStore, genericDraft)
	if _, ok := loadTodayDraft(genericStore, afterMidnight); ok {
		t.Fatal("ordinary draft from the previous local day must remain stale")
	}
}

func TestRef5DraftRoundTripPreservesFrozenIdentityMetaReasonAndCompletion(t *testing.T) {
	now := time.Date(2026, 7, 14, 20, 0, 0, 0, time.Local)
	draft, session := ref5DraftFixture(t, now)
	store := &memDraftStore{}
	storeDraftForTest(t, store, draft)

	decoded, ok := loadTodayDraft(store, now)
	if !ok {
		t.Fatal("REF5 draft did not decode")
	}
	restored := NewLog(nil)
	restored.loadFromDraft(decoded)

	if restored.ref5 == nil || !restored.ref5.active() {
		t.Fatalf("restored state is not an active REF5 session: %#v", restored.ref5)
	}
	if restored.generatedSessionID != session.ID || restored.ref5.Session.ID != session.ID {
		t.Fatalf("generated-session identity was lost: field=%q snapshot=%q", restored.generatedSessionID, restored.ref5.Session.ID)
	}
	if got := restored.ref5.Session.Snapshot.Ref5.SnapshotID; got != "snapshot-"+session.ID {
		t.Errorf("snapshot identity = %q", got)
	}
	if restored.ref5.CompletionEventID != "completion:event:stable" {
		t.Errorf("completion event = %q", restored.ref5.CompletionEventID)
	}
	if got := restored.groups[0].ref5.TerminationReason; got != ref5ReasonSlowdown {
		t.Errorf("termination reason = %q", got)
	}
	set := restored.groups[0].sets[0]
	if !set.done || set.reps != "2" || set.setNumber != 1 {
		t.Errorf("entered set was not restored: %#v", set)
	}
	if set.originalMeta == nil || set.originalMeta.Ref5["immutableMarker"] != "keep-me" {
		t.Fatalf("original REF5 set meta was lost: %#v", set.originalMeta)
	}
	var future map[string]any
	if err := json.Unmarshal(set.originalMeta.Extra["futureEngineField"], &future); err != nil || future["nested"] == nil {
		t.Fatalf("unknown engine meta was not losslessly restored: raw=%s err=%v", set.originalMeta.Extra["futureEngineField"], err)
	}
	if restored.col != colReps {
		t.Errorf("active REF5 draft selected mutable column %v, want reps", restored.col)
	}
}

func TestRef5UnfinishedSessionFilterExcludesLoggedAndNonRef5AndSortsNewest(t *testing.T) {
	base := time.Date(2026, 7, 14, 10, 0, 0, 0, time.UTC)
	old := uiRef5Session("old", base)
	logged := uiRef5Session("logged", base.Add(time.Hour))
	newest := uiRef5Session("newest", base.Add(2*time.Hour))
	uncommitted := uiRef5Session("upgrade-preview", base.Add(3*time.Hour))
	uncommitted.Snapshot.Ref5.StartCommitted = false
	skipped := uiRef5Session("skipped", base.Add(4*time.Hour))
	skipped.Status = "SKIPPED"
	ordinary := api.GeneratedSession{
		ID: "ordinary", Snapshot: api.SessionSnapshot{SessionKey: "C1W1D1", Plan: api.SnapshotPlan{Name: "5/3/1"}},
	}
	emptyID := uiRef5Session("", base.Add(3*time.Hour))

	got := ref5UnfinishedSessions(
		[]api.GeneratedSession{old, logged, ordinary, newest, uncommitted, skipped, emptyID},
		[]api.LogItem{{ID: "log-finished", GeneratedSessionID: stringPtr(logged.ID)}},
	)
	if len(got) != 2 || got[0].ID != newest.ID || got[1].ID != old.ID {
		t.Fatalf("unfinished sessions = %#v, want newest then old", got)
	}
}

func TestAutoloadRef5CrossMidnightDraftRevalidatesSessionAndKeepsEnteredWork(t *testing.T) {
	beforeMidnight := time.Now().Add(-24 * time.Hour)
	draft, frozen := ref5DraftFixture(t, beforeMidnight)
	store := &memDraftStore{}
	storeDraftForTest(t, store, draft)

	resumeCalls := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/api/plans", func(w http.ResponseWriter, r *http.Request) {
		writeUITestJSON(t, w, map[string]any{"items": []api.Plan{uiRef5Plan()}})
	})
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		writeUITestJSON(t, w, map[string]any{"items": []api.LogItem{}})
	})
	mux.HandleFunc("/api/plans/plan-ref5/generated-sessions/session-draft", func(w http.ResponseWriter, r *http.Request) {
		resumeCalls++
		if r.Method != http.MethodGet {
			t.Errorf("resume method = %s", r.Method)
		}
		resumed := frozen
		resumed.Snapshot.Ref5.RuntimeRevisionAfter = 9
		writeUITestJSON(t, w, map[string]any{"session": resumed})
	})
	client := newUITestClient(t, mux)

	msg := autoloadCmd(client, store)()
	restored, ok := msg.(draftRestoredMsg)
	if !ok {
		t.Fatalf("autoload result = %T, want draftRestoredMsg", msg)
	}
	if resumeCalls != 1 {
		t.Fatalf("resume calls = %d, want 1", resumeCalls)
	}
	if restored.draft.Groups[0].Sets[0].Reps != "2" || !restored.draft.Groups[0].Sets[0].Done {
		t.Fatalf("server revalidation replaced entered reps: %#v", restored.draft.Groups[0].Sets[0])
	}
	if restored.draft.Ref5.Session.Snapshot.Ref5.RuntimeRevisionAfter != 9 {
		t.Error("autoload did not refresh the immutable server snapshot")
	}
	if store.clears != 0 {
		t.Fatalf("valid cross-midnight draft was cleared %d time(s)", store.clears)
	}
}

func TestAutoloadRef5KeepsSameDaySessionsDistinctAndOffersOnlyUnfinished(t *testing.T) {
	now := time.Now()
	completed := uiRef5Session("completed", now.Add(-2*time.Hour))
	unfinished := uiRef5Session("unfinished", now.Add(-time.Hour))
	planID := "plan-ref5"
	completedID := completed.ID
	mux := http.NewServeMux()
	mux.HandleFunc("/api/plans", func(w http.ResponseWriter, r *http.Request) {
		writeUITestJSON(t, w, map[string]any{"items": []api.Plan{uiRef5Plan()}})
	})
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		writeUITestJSON(t, w, map[string]any{"items": []api.LogItem{{
			ID: "same-day-completed-log", PlanID: &planID, GeneratedSessionID: &completedID,
			PerformedAt: now, GeneratedSession: &api.GeneratedSessionRef{ID: completed.ID, SessionKey: completed.SessionKey},
			Sets: uiRef5LoggedSets(completed, "completion-completed"),
		}}})
	})
	mux.HandleFunc("/api/generated-sessions", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("planId") != planID || r.URL.Query().Get("includeSnapshot") != "1" {
			t.Errorf("generated sessions query = %q", r.URL.RawQuery)
		}
		writeUITestJSON(t, w, map[string]any{"items": []api.GeneratedSession{completed, unfinished}})
	})
	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		writeUITestJSON(t, w, map[string]any{"settings": map[string]any{"prefs.bodyweight.kg": 82.5}})
	})
	client := newUITestClient(t, mux)

	msg := autoloadCmd(client, nil)()
	prepared, ok := msg.(ref5PlanPreparedMsg)
	if !ok {
		t.Fatalf("autoload result = %T, want ref5PlanPreparedMsg (completed REF5 log must not auto-edit)", msg)
	}
	if len(prepared.sessions) != 1 || prepared.sessions[0].ID != unfinished.ID {
		t.Fatalf("resume choices = %#v, want only unfinished", prepared.sessions)
	}
	if prepared.bodyweight != 82.5 {
		t.Errorf("bodyweight = %v", prepared.bodyweight)
	}
}

func TestAutoloadOrdinaryPlanStillEditsTodaysLog(t *testing.T) {
	now := time.Now()
	planID, sessionID := "plan-ordinary", "generated-ordinary"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/plans", func(w http.ResponseWriter, r *http.Request) {
		writeUITestJSON(t, w, map[string]any{"items": []api.Plan{{
			ID: planID, Name: "5/3/1 Leader", Type: "SINGLE", Params: map[string]any{}, CreatedAt: now.Add(-24 * time.Hour),
		}}})
	})
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		writeUITestJSON(t, w, map[string]any{"items": []api.LogItem{{
			ID: "ordinary-log", PlanID: &planID, GeneratedSessionID: &sessionID, PerformedAt: now,
			GeneratedSession: &api.GeneratedSessionRef{ID: sessionID, SessionKey: "C2W3D1"},
			Sets:             []api.LoggedSet{{ExerciseName: "Back Squat", WeightKg: 100, Reps: 5}},
		}}})
	})
	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		writeUITestJSON(t, w, map[string]any{"settings": map[string]any{"prefs.bodyweight.kg": 80}})
	})
	client := newUITestClient(t, mux)

	msg := autoloadCmd(client, nil)()
	edit, ok := msg.(editLogMsg)
	if !ok {
		t.Fatalf("ordinary autoload result = %T, want editLogMsg", msg)
	}
	if edit.id != "ordinary-log" || edit.planName != "5/3/1 Leader" || edit.sessionKey != "C2W3D1" {
		t.Fatalf("ordinary edit identity changed: %#v", edit)
	}
	if edit.generatedSession != nil {
		t.Fatal("ordinary log unexpectedly entered the REF5 full-snapshot edit path")
	}
}

func TestAutoloadKeepsTodaysLogWhenPlanListFails(t *testing.T) {
	now := time.Now()
	planID, sessionID := "plan-offline", "generated-offline"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/plans", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "plans unavailable", http.StatusServiceUnavailable)
	})
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, _ *http.Request) {
		writeUITestJSON(t, w, map[string]any{"items": []api.LogItem{{
			ID: "today-offline", PlanID: &planID, GeneratedSessionID: &sessionID,
			PerformedAt: now, Sets: []api.LoggedSet{{ExerciseName: "Back Squat", WeightKg: 100, Reps: 5}},
		}}})
	})
	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, _ *http.Request) {
		writeUITestJSON(t, w, map[string]any{"settings": map[string]any{}})
	})
	client := newUITestClient(t, mux)

	msg := autoloadCmd(client, nil)()
	edit, ok := msg.(editLogMsg)
	if !ok {
		t.Fatalf("autoload result = %T, want today's edit despite plan-list failure", msg)
	}
	if edit.id != "today-offline" || edit.planID != planID || edit.generatedSessionID != sessionID {
		t.Fatalf("today identity changed: %#v", edit)
	}
}

func TestGenericGeneratedSavePreservesEngineMetadataAndIdentity(t *testing.T) {
	var posted api.CreateLogRequest
	mux := http.NewServeMux()
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("save method = %s", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&posted); err != nil {
			t.Errorf("decode save: %v", err)
		}
		writeUITestJSON(t, w, map[string]any{"log": map[string]any{"id": "generic-log"}, "progression": map[string]any{}})
	})
	mux.HandleFunc("/api/logs/generic-log", func(w http.ResponseWriter, _ *http.Request) {
		writeUITestJSON(t, w, map[string]any{"item": map[string]any{
			"id": "generic-log", "performedAt": time.Now(), "sets": []any{},
		}})
	})
	client := newUITestClient(t, mux)
	plannedMeta := &api.SetMeta{Extra: map[string]json.RawMessage{
		"futureEngine": json.RawMessage(`{"keep":true}`),
	}}

	l := NewLog(client)
	l.load, l.planID, l.generatedSessionID = loadIdle, "generic-plan", "generic-session"
	l.loadSnapshot(&api.SessionSnapshot{Exercises: []api.PlannedExercise{{
		ExerciseName: "Back Squat", ProgressionKey: "D1_s0", ProgressionTarget: "SQUAT",
		Sets: []api.PlannedSet{{
			SetNumber: 2, Reps: 5, TargetWeightKg: 100, Amrap: true, Meta: plannedMeta,
		}},
	}, {
		ExerciseName: "Bench Press", ProgressionTarget: "BENCH", EnforcePlannedReps: true,
		Sets: []api.PlannedSet{{SetNumber: 1, Reps: 5, TargetWeightKg: 80}},
	}}}, nil)
	l.groups[0].sets[0].reps, l.groups[0].sets[0].done = "5", true
	l.groups[1].sets[0].reps, l.groups[1].sets[0].done = "4", true
	_, save := l.save()
	if save == nil {
		t.Fatal("generic generated workout did not produce a save command")
	}
	result, ok := save().(saveResultMsg)
	if !ok || result.err != nil {
		t.Fatalf("save result = %#v", result)
	}
	if posted.PlanID != "generic-plan" || posted.GeneratedSessionID != "generic-session" || len(posted.Sets) != 2 {
		t.Fatalf("generated identity changed: %#v", posted)
	}
	set := posted.Sets[0]
	if set.SetNumber != 2 || set.Meta == nil || string(set.Meta.Extra["amrap"]) != "true" || len(set.Meta.Extra["futureEngine"]) == 0 {
		t.Fatalf("generic planned metadata changed: %#v", set)
	}
	var plannedRef map[string]any
	if err := json.Unmarshal(set.Meta.Extra["plannedRef"], &plannedRef); err != nil ||
		plannedRef["progressionKey"] != "D1_s0" || plannedRef["progressionTarget"] != "SQUAT" ||
		plannedRef["reps"] != float64(5) || plannedRef["amrap"] != true {
		t.Fatalf("plannedRef changed: raw=%s err=%v", set.Meta.Extra["plannedRef"], err)
	}
	var enforced map[string]any
	if err := json.Unmarshal(posted.Sets[1].Meta.Extra["plannedRef"], &enforced); err != nil ||
		enforced["reps"] != float64(5) || enforced["progressionTarget"] != "BENCH" || enforced["progressionKey"] != nil {
		t.Fatalf("enforced plannedRef changed: raw=%s parsed=%#v err=%v", posted.Sets[1].Meta.Extra["plannedRef"], enforced, err)
	}
}

func TestHistoryKeepsTwoRef5SessionsOnSameDayDistinct(t *testing.T) {
	firstAt := time.Date(2026, 7, 14, 10, 0, 0, 0, time.Local)
	secondAt := firstAt.Add(3 * time.Hour)
	first := uiRef5Session("same-day-1", firstAt)
	second := uiRef5Session("same-day-2", secondAt)
	planID := "plan-ref5"
	firstID, secondID := first.ID, second.ID

	history := NewHistory(nil)
	history.loaded = true
	history.planNames = map[string]string{planID: "REF5 Adaptive Strength"}
	history.build([]api.LogItem{
		{ID: "log-2", PlanID: &planID, GeneratedSessionID: &secondID, PerformedAt: secondAt, GeneratedSession: &api.GeneratedSessionRef{ID: second.ID, SessionKey: second.SessionKey}, Sets: uiRef5LoggedSets(second, "completion-2")},
		{ID: "log-1", PlanID: &planID, GeneratedSessionID: &firstID, PerformedAt: firstAt, GeneratedSession: &api.GeneratedSessionRef{ID: first.ID, SessionKey: first.SessionKey}, Sets: uiRef5LoggedSets(first, "completion-1")},
	})

	if len(history.rows) != 2 || history.rows[0].generatedSessionID == history.rows[1].generatedSessionID {
		t.Fatalf("same-day REF5 sessions collapsed: %#v", history.rows)
	}
	day := firstAt.Format("2006-01-02")
	if history.dayVol[day] != history.rows[0].volume+history.rows[1].volume {
		t.Errorf("same-day heat volume did not aggregate without collapsing rows")
	}
	out := ansi.Strip(history.Body(72, 16))
	for _, want := range []string{sessionLabel(first.SessionKey), sessionLabel(second.SessionKey)} {
		if want == "" || !strings.Contains(out, want) {
			t.Errorf("history missing distinct session label %q:\n%s", want, out)
		}
	}
}

func TestHistoryRef5EditFetchesFullDetailBeforeOpeningLockedEditor(t *testing.T) {
	startedAt := time.Date(2026, 7, 14, 10, 30, 0, 0, time.UTC)
	session := uiRef5Session("history-edit", startedAt)
	planID, sessionID := session.PlanID, session.ID
	detail := api.LogDetail{
		ID: "log-ref5", PlanID: &planID, GeneratedSessionID: &sessionID, PerformedAt: startedAt,
		Sets: uiRef5LoggedSets(session, "completion:history-edit"), GeneratedSession: &session,
	}
	requests := 0
	client := newUITestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Method != http.MethodGet || r.URL.Path != "/api/logs/log-ref5" {
			t.Errorf("detail request = %s %s", r.Method, r.URL.Path)
		}
		writeUITestJSON(t, w, map[string]any{"item": detail})
	}))

	history := NewHistory(client)
	history.loaded = true
	history.planNames = map[string]string{planID: "REF5 Adaptive Strength"}
	history.plansByID = map[string]api.Plan{planID: {
		ID: planID, Name: "REF5 Adaptive Strength", Params: map[string]any{"timezone": "Asia/Seoul"},
	}}
	history.build([]api.LogItem{{
		ID: detail.ID, PlanID: &planID, GeneratedSessionID: &sessionID, PerformedAt: startedAt,
		GeneratedSession: &api.GeneratedSessionRef{ID: session.ID, SessionKey: session.SessionKey}, Sets: detail.Sets,
	}})

	historyScreen, loadCmd := history.handleKey(tea.KeyPressMsg{Code: 'e', Text: "e"})
	history = historyScreen.(History)
	if loadCmd == nil {
		t.Fatal("REF5 history edit did not request detail")
	}
	loaded, ok := loadCmd().(historyEditLoadedMsg)
	if !ok || loaded.err != nil || loaded.detail == nil {
		t.Fatalf("detail command result = %#v", loaded)
	}
	_, openCmd := history.Update(loaded)
	if openCmd == nil {
		t.Fatal("loaded REF5 detail did not emit editLogMsg")
	}
	edit, ok := openCmd().(editLogMsg)
	if !ok || edit.generatedSession == nil {
		t.Fatalf("edit command lost full generated snapshot: %#v", edit)
	}
	if requests != 1 || edit.generatedSession.ID != session.ID || len(edit.sets) != 4 {
		t.Fatalf("full-detail edit identity changed: requests=%d msg=%#v", requests, edit)
	}

	screen, _ := NewLog(nil).Update(edit)
	log := screen.(Log)
	if log.ref5 == nil || !log.ref5.active() || log.editID != detail.ID {
		t.Fatalf("history detail did not open active locked editor: %#v", log.ref5)
	}
	if log.ref5.CompletionEventID != "completion:history-edit" || log.groups[0].ref5.TerminationReason != ref5ReasonNormal {
		t.Fatalf("canonical completion/reason was not restored: state=%q group=%#v", log.ref5.CompletionEventID, log.groups[0].ref5)
	}
	next, newSessionCmd := log.updateRef5Active(tea.KeyPressMsg{Code: 'n', Text: "n"})
	if newSessionCmd == nil || next.ref5.Phase != ref5Decide || next.ref5.Plan.Params["timezone"] != "Asia/Seoul" {
		t.Fatalf("clean edit lost plan timezone on new session: ref5=%#v cmd=%v", next.ref5, newSessionCmd != nil)
	}
}

func TestHistoryRef5EditDetectsMetadataWhenSessionKeyIsMissing(t *testing.T) {
	history := NewHistory(nil)
	history.rows = []sessionRow{{
		id: "legacy-ref5-log",
		sets: []api.LoggedSet{{
			ExerciseName: "Back Squat",
			Meta:         &api.SetMeta{Ref5: map[string]any{"protocolVersion": "1.1"}},
		}},
	}}

	_, cmd := history.handleKey(tea.KeyPressMsg{Code: 'e', Text: "e"})
	if cmd == nil {
		t.Fatal("REF5 set metadata without a list sessionKey must still trigger full-detail loading")
	}
}

func TestHistoryIgnoresOutOfOrderRef5DetailResponse(t *testing.T) {
	ref5Meta := &api.SetMeta{Ref5: map[string]any{"protocolVersion": "1.1"}}
	history := NewHistory(nil)
	history.rows = []sessionRow{
		{id: "older", sets: []api.LoggedSet{{ExerciseName: "Back Squat", Meta: ref5Meta}}},
		{id: "newer", sets: []api.LoggedSet{{ExerciseName: "Bench Press", Meta: ref5Meta}}},
	}
	first, _ := history.handleKey(tea.KeyPressMsg{Code: 'e', Text: "e"})
	history = first.(History)
	history.sel = 1
	second, _ := history.handleKey(tea.KeyPressMsg{Code: 'e', Text: "e"})
	history = second.(History)

	screen, cmd := history.Update(historyEditLoadedMsg{
		id: "older", detail: &api.LogDetail{ID: "older"},
	})
	got := screen.(History)
	if cmd != nil || got.pendingEditID != "newer" {
		t.Fatalf("stale detail response won: pending=%q cmd=%v", got.pendingEditID, cmd != nil)
	}
}
