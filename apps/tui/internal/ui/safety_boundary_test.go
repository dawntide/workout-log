package ui

import (
	"errors"
	"net/http"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/config"
	"github.com/sharru0701/workout-log/apps/tui/internal/securefile"
)

func validGenericGroups() []exGroup {
	return []exGroup{{name: "Back Squat", sets: []setEntry{{
		weight: "100", reps: "5", rpe: "8", done: true, setNumber: 1,
	}}}}
}

func TestGenericSaveRejectsMalformedDoneSets(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*exGroup, *setEntry)
	}{
		{name: "blank exercise", mutate: func(g *exGroup, _ *setEntry) { g.name = "  " }},
		{name: "nan weight", mutate: func(_ *exGroup, s *setEntry) { s.weight = "NaN" }},
		{name: "infinite weight", mutate: func(_ *exGroup, s *setEntry) { s.weight = "+Inf" }},
		{name: "negative reps", mutate: func(_ *exGroup, s *setEntry) { s.reps = "-1" }},
		{name: "fractional reps", mutate: func(_ *exGroup, s *setEntry) { s.reps = "2.5" }},
		{name: "zero rpe", mutate: func(_ *exGroup, s *setEntry) { s.rpe = "0" }},
		{name: "high rpe", mutate: func(_ *exGroup, s *setEntry) { s.rpe = "11" }},
		{name: "fractional rpe", mutate: func(_ *exGroup, s *setEntry) { s.rpe = "8.5" }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			l := NewLog(nil)
			l.load, l.groups = loadIdle, validGenericGroups()
			tc.mutate(&l.groups[0], &l.groups[0].sets[0])
			next, cmd := l.save()
			if cmd != nil || !next.statusErr {
				t.Fatalf("malformed set reached save command: status=%q cmd=%v", next.status, cmd != nil)
			}
		})
	}
}

func TestGenericPostIdentityIsDurableBeforeNetworkCommandRuns(t *testing.T) {
	store := &memDraftStore{}
	l := NewLog(nil).withDrafts(store).withOwner("user-a")
	l.load, l.groups, l.genericDirty = loadIdle, validGenericGroups(), true
	next, cmd := l.save()
	if cmd == nil || !next.saving || !next.saveUncertain || next.clientMutationID == "" ||
		next.performedAt.IsZero() {
		t.Fatalf("POST preflight identity was not established: %#v cmd=%v", next, cmd != nil)
	}
	draft, ok := loadTodayDraft(store, time.Now(), "user-a")
	if !ok || !draft.SaveUncertain || draft.ClientMutationID != next.clientMutationID ||
		!draft.PerformedAt.Equal(next.performedAt) {
		t.Fatalf("durable POST marker = %#v, ok=%v", draft, ok)
	}

	// A retry of a keyed unknown outcome goes straight back to the idempotent
	// POST with the same identity; it never unlocks the payload after one
	// potentially stale list read.
	next.saving = false
	retry, retryCmd := next.save()
	if retryCmd == nil || !retry.saveUncertain || retry.clientMutationID != next.clientMutationID {
		t.Fatalf("keyed retry changed identity/unlocked input: %#v cmd=%v", retry, retryCmd != nil)
	}
}

func TestWritePreflightsStopWhenDraftCannotBePersisted(t *testing.T) {
	t.Run("generic first POST", func(t *testing.T) {
		store := &failingDraftStore{err: errors.New("disk full")}
		l := NewLog(nil).withDrafts(store)
		l.load, l.groups, l.genericDirty = loadIdle, validGenericGroups(), true

		next, cmd := l.save()
		if cmd != nil || next.saving || next.saveUncertain || !next.statusErr || store.saves != 1 {
			t.Fatalf("failed draft launched generic POST: saving=%v uncertain=%v status=%q saves=%d cmd=%v",
				next.saving, next.saveUncertain, next.status, store.saves, cmd != nil)
		}
	})

	t.Run("REF5 initial start", func(t *testing.T) {
		store := &failingDraftStore{err: errors.New("permission denied")}
		l := ref5PreviewReadyLog().withDrafts(store)
		confirmed := ref5StartConfirmedMsg{
			planID: l.ref5.Plan.ID, values: l.ref5.Start, signature: l.ref5.Start.signature(),
		}

		screen, cmd := l.Update(confirmed)
		got := screen.(Log)
		if cmd != nil || got.ref5.Phase != ref5PreviewReady || got.ref5.StartUncertain ||
			got.ref5.StartRequestInFlight || !got.statusErr || store.saves != 1 {
			t.Fatalf("failed draft launched REF5 start: ref5=%#v status=%q saves=%d cmd=%v",
				got.ref5, got.status, store.saves, cmd != nil)
		}
	})

	t.Run("REF5 first completion", func(t *testing.T) {
		store := &failingDraftStore{err: errors.New("read-only filesystem")}
		l := loadRef5Fixture(t).withDrafts(store)
		fillRef5Fixture(&l)
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
		if cmd != nil || got.saving || got.saveUncertain || !got.statusErr || store.saves != 1 {
			t.Fatalf("failed draft launched REF5 completion: saving=%v uncertain=%v status=%q saves=%d cmd=%v",
				got.saving, got.saveUncertain, got.status, store.saves, cmd != nil)
		}
	})
}

func TestGenericSaveCanonicalizesDatabaseScale(t *testing.T) {
	req := captureGenericSaveRequest(t, []exGroup{{
		name: "Back Squat",
		sets: []setEntry{{weight: "100.123", reps: "5", done: true}},
	}})
	if len(req.Sets) != 1 || req.Sets[0].WeightKg != 100.12 {
		t.Fatalf("barbell weight was not canonicalized: %#v", req.Sets)
	}

	req = captureGenericSaveRequest(t, []exGroup{{
		name: "Weighted Pull-Up",
		sets: []setEntry{{weight: "10.123", reps: "5", done: true, total: 90.123}},
	}})
	set := req.Sets[0]
	if set.WeightKg != 10.12 || set.Meta == nil || float64(set.Meta.BodyweightKg) != 80 ||
		float64(set.Meta.TotalLoadKg) != 90.12 {
		t.Fatalf("bodyweight load canonicalization = %#v", set)
	}
}

func TestUncertainSaveReconciliationNeedsAConclusiveRead(t *testing.T) {
	postCount := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			postCount++
		}
		http.Error(w, "offline", http.StatusServiceUnavailable)
	})
	client := newUITestClient(t, mux)
	msg := saveCmd(client, validGenericGroups(), "", time.Now(), "", "", "mutation-verify", true)().(saveResultMsg)
	if !msg.uncertain || msg.retryReady || msg.err == nil || postCount != 0 {
		t.Fatalf("failed verification authorized retry: %#v posts=%d", msg, postCount)
	}
}

func TestUncertainSaveReconciliationMatchAndNoMatch(t *testing.T) {
	at := time.Now().Truncate(time.Millisecond)
	t.Run("match finalizes without post", func(t *testing.T) {
		postCount := 0
		mux := http.NewServeMux()
		mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				postCount++
			}
			writeUITestJSON(t, w, map[string]any{"items": []map[string]any{{
				"id": "existing", "planId": "plan-a", "generatedSessionId": "session-a",
				"performedAt": at, "sets": []map[string]any{{
					"exerciseName": "Back Squat", "weightKg": 100, "reps": 5, "rpe": 8,
				}},
			}}})
		})
		mux.HandleFunc("/api/logs/existing", func(w http.ResponseWriter, _ *http.Request) {
			writeUITestJSON(t, w, map[string]any{"item": map[string]any{
				"id": "existing", "performedAt": at, "sets": []any{},
			}})
		})
		msg := saveCmd(newUITestClient(t, mux), validGenericGroups(), "", at, "plan-a", "session-a", "mutation-match", true)().(saveResultMsg)
		if msg.err != nil || msg.savedID != "existing" || msg.retryReady || postCount != 0 {
			t.Fatalf("matching commit was not reconciled: %#v posts=%d", msg, postCount)
		}
	})

	t.Run("successful no-match permits a later retry", func(t *testing.T) {
		postCount := 0
		mux := http.NewServeMux()
		mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				postCount++
			}
			writeUITestJSON(t, w, map[string]any{"items": []any{}})
		})
		msg := saveCmd(newUITestClient(t, mux), validGenericGroups(), "", at, "", "", "mutation-no-match", true)().(saveResultMsg)
		if msg.err != nil || !msg.retryReady || msg.uncertain || postCount != 0 {
			t.Fatalf("conclusive no-match result = %#v posts=%d", msg, postCount)
		}
	})
}

func TestServerWriteErrorsKeepUnknownOutcomesLocked(t *testing.T) {
	for _, tc := range []struct {
		name      string
		status    int
		uncertain bool
	}{
		{name: "gateway", status: http.StatusBadGateway, uncertain: true},
		{name: "timeout", status: http.StatusRequestTimeout, uncertain: true},
		{name: "rate limit", status: http.StatusTooManyRequests, uncertain: true},
		{name: "validation", status: http.StatusBadRequest, uncertain: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mux := http.NewServeMux()
			mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodPost {
					http.Error(w, "write failed", tc.status)
					return
				}
				writeUITestJSON(t, w, map[string]any{"items": []any{}})
			})
			msg := saveCmd(newUITestClient(t, mux), validGenericGroups(), "", time.Now(), "", "", "mutation-error")().(saveResultMsg)
			if msg.uncertain != tc.uncertain || msg.err == nil {
				t.Fatalf("status %d result = %#v", tc.status, msg)
			}
		})
	}
}

func TestGenericBootDropsOnlyAnExactCommittedDraft(t *testing.T) {
	for _, exact := range []bool{false, true} {
		t.Run(map[bool]string{false: "reused session id", true: "exact commit"}[exact], func(t *testing.T) {
			at := time.Now().Truncate(time.Millisecond)
			store := &memDraftStore{}
			l := NewLog(nil).withDrafts(store)
			l.load, l.groups = loadIdle, validGenericGroups()
			l.planID, l.generatedSessionID, l.performedAt = "plan-a", "session-a", at
			l.persistDraft()
			loggedAt := at.Add(-time.Minute)
			if exact {
				loggedAt = at
			}
			mux := http.NewServeMux()
			mux.HandleFunc("/api/plans", func(w http.ResponseWriter, _ *http.Request) {
				writeUITestJSON(t, w, map[string]any{"items": []any{}})
			})
			mux.HandleFunc("/api/logs", func(w http.ResponseWriter, _ *http.Request) {
				writeUITestJSON(t, w, map[string]any{"items": []map[string]any{{
					"id": "server-log", "planId": "plan-a", "generatedSessionId": "session-a",
					"performedAt": loggedAt, "sets": []map[string]any{{
						"exerciseName": "Back Squat", "weightKg": 100, "reps": 5, "rpe": 8,
					}},
				}}})
			})
			mux.HandleFunc("/api/settings", func(w http.ResponseWriter, _ *http.Request) {
				writeUITestJSON(t, w, map[string]any{"settings": map[string]any{}})
			})
			msg := autoloadCmd(newUITestClient(t, mux), store)()
			_, restored := msg.(draftRestoredMsg)
			if exact && (restored || store.data != nil) {
				t.Fatalf("exact server commit retained draft: msg=%T draft=%v", msg, store.data != nil)
			}
			if !exact && (!restored || store.data == nil) {
				t.Fatalf("reused generated session discarded distinct draft: msg=%T draft=%v", msg, store.data != nil)
			}
		})
	}
}

func TestLoadingTodayIgnoresKeysAndPickerResults(t *testing.T) {
	l := NewLog(nil)
	for _, key := range []string{"e", "i", "x", "s"} {
		next, cmd := l.updateNormal(tea.KeyPressMsg{Code: rune(key[0]), Text: key})
		if cmd != nil || len(next.groups) != 0 || next.load != loadPending {
			t.Fatalf("key %q mutated loading Today: %#v cmd=%v", key, next, cmd != nil)
		}
	}
	screen, cmd := l.Update(pickedMsg{tag: "exercise", value: "Back Squat"})
	if got := screen.(Log); cmd != nil || len(got.groups) != 0 || got.load != loadPending {
		t.Fatalf("late picker mutated loading Today: %#v cmd=%v", got, cmd != nil)
	}
}

func TestConfirmationRequiresExplicitDecisionAndAccountDeleteLocksFrame(t *testing.T) {
	f := NewFrame(nil, nil)
	f.confirmPrompt = "legacy"
	f.confirmCmd = func() tea.Msg { return "yes" }
	f.confirmNoCmd = func() tea.Msg { return "no" }
	f.confirmCancelCmd = func() tea.Msg { return "cancel" }
	f.overlay = overlayConfirm

	model, cmd := f.handleConfirmKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if got := model.(Frame); cmd != nil || got.overlay != overlayConfirm {
		t.Fatalf("unrelated key decided confirmation: overlay=%v cmd=%v", got.overlay, cmd != nil)
	}
	model, cmd = model.(Frame).handleConfirmKey(tea.KeyPressMsg{Code: tea.KeyEscape})
	if got := model.(Frame); cmd == nil || cmd() != "cancel" || got.overlay != overlayNone {
		t.Fatalf("escape did not preserve/cancel explicitly: overlay=%v cmd=%v", got.overlay, cmd != nil)
	}

	f = NewFrame(nil, nil)
	model, _ = f.Update(confirmMsg{
		prompt: "delete account", accountDelete: true,
		onYes: func() tea.Msg { return accountActionMsg{err: errors.New("offline"), accountDelete: true} },
	})
	model, cmd = model.(Frame).handleConfirmKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	locked := model.(Frame)
	if cmd == nil || !locked.deletingAccount {
		t.Fatalf("account deletion did not lock frame: %#v cmd=%v", locked, cmd != nil)
	}
	_, blockedCmd := locked.handleKey(tea.KeyPressMsg{Code: 'q', Text: "q"})
	if blockedCmd != nil {
		t.Fatal("quit escaped account-delete lock")
	}
	model, _ = locked.Update(cmd())
	if model.(Frame).deletingAccount {
		t.Fatal("failed account deletion did not unlock frame")
	}
}

func TestAccountDeleteCannotRaceUnsettledTodayMutation(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*Log)
	}{
		{name: "saving", mutate: func(l *Log) { l.saving = true }},
		{name: "unknown save", mutate: func(l *Log) { l.saveUncertain = true }},
		{name: "override", mutate: func(l *Log) { l.pendingOverride = true }},
		{name: "ref5 start", mutate: func(l *Log) {
			l.ref5 = newRef5StartState(ref5PlanFixture(), 80, time.Now())
			l.ref5.Phase = ref5Starting
		}},
	} {
		t.Run(tc.name+" before prompt", func(t *testing.T) {
			f := NewFrame(nil, nil)
			today := f.views[vToday].(Log)
			tc.mutate(&today)
			f.views[vToday] = today
			model, cmd := f.Update(confirmMsg{
				prompt: "delete", accountDelete: true, onYes: func() tea.Msg { return "deleted" },
			})
			got := model.(Frame)
			if cmd != nil || got.overlay != overlayNone || got.deletingAccount || got.active != vToday ||
				!got.views[vToday].(Log).statusErr {
				t.Fatalf("unsafe delete prompt opened: overlay=%v deleting=%v cmd=%v", got.overlay, got.deletingAccount, cmd != nil)
			}
		})
	}

	t.Run("recheck on final yes", func(t *testing.T) {
		f := NewFrame(nil, nil)
		model, _ := f.Update(confirmMsg{
			prompt: "delete", accountDelete: true, onYes: func() tea.Msg { return "deleted" },
		})
		f = model.(Frame)
		today := f.views[vToday].(Log)
		today.saving = true
		f.views[vToday] = today
		model, cmd := f.handleConfirmKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
		got := model.(Frame)
		if cmd != nil || got.overlay != overlayNone || got.deletingAccount || !got.views[vToday].(Log).statusErr {
			t.Fatalf("final delete check missed new write: overlay=%v deleting=%v cmd=%v", got.overlay, got.deletingAccount, cmd != nil)
		}
	})
}

func TestLogoutLocksFrameUntilResult(t *testing.T) {
	f := NewFrame(nil, nil)
	today := f.views[vToday].(Log)
	today.groups, today.genericDirty, today.load = validGenericGroups(), true, loadIdle
	f.views[vToday] = today
	model, cmd := f.runCommand("logout")
	f = model.(Frame)
	if cmd != nil || f.overlay != overlayConfirm || !f.confirmLogout {
		t.Fatalf("dirty logout did not require confirmation: overlay=%v logout=%v cmd=%v", f.overlay, f.confirmLogout, cmd != nil)
	}
	model, cmd = f.handleConfirmKey(tea.KeyPressMsg{Code: 'y', Text: "y"})
	locked := model.(Frame)
	if cmd == nil || !locked.loggingOut {
		t.Fatalf("confirmed logout did not lock frame: loggingOut=%v cmd=%v", locked.loggingOut, cmd != nil)
	}
	_, blockedCmd := locked.handleKey(tea.KeyPressMsg{Code: 'q', Text: "q"})
	if blockedCmd != nil {
		t.Fatal("quit escaped logout lock")
	}
	app := App{state: stateFrame, frame: locked}
	model, _ = app.Update(loggedOutMsg{err: errors.New("offline")})
	if model.(App).frame.loggingOut {
		t.Fatal("failed logout did not unlock frame")
	}
}

func TestLegacyDraftPromptDefersTodayInitWithoutLosingDraft(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	client := newUITestClient(t, http.NewServeMux())
	t.Setenv("IRONLOG_API_URL", client.BaseURL())
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if err := cfg.SaveDraft([]byte(`{"date":"2026-07-14","groups":[{"name":"Squat"}]}`)); err != nil {
		t.Fatal(err)
	}
	a := NewApp(cfg, client)
	model, initCmd := a.Update(loginResultMsg{user: &api.User{ID: "user-a"}})
	a = model.(App)
	if initCmd != nil || a.frame.overlay != overlayConfirm || a.legacyDraftPath == "" {
		t.Fatalf("legacy prompt raced Today init: overlay=%v path=%q cmd=%v", a.frame.overlay, a.legacyDraftPath, initCmd != nil)
	}
	if a.frame.confirmYesLabel != "복구" || a.frame.confirmNoLabel != "영구 폐기" ||
		a.frame.confirmCancelLabel != "보존" {
		t.Fatalf("legacy decision labels are ambiguous: %q/%q/%q",
			a.frame.confirmYesLabel, a.frame.confirmNoLabel, a.frame.confirmCancelLabel)
	}
	model, deferCmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEscape})
	if deferCmd == nil {
		t.Fatal("escape did not schedule deferred Today init")
	}
	a = model.(App)
	model, initCmd = a.Update(deferCmd())
	a = model.(App)
	if initCmd == nil || a.frame.overlay != overlayNone || cfg.LatestQuarantinedDraft() == "" ||
		!strings.Contains(a.frame.flash, "보존") {
		t.Fatalf("deferred legacy result = overlay %v quarantine %q flash %q cmd=%v",
			a.frame.overlay, cfg.LatestQuarantinedDraft(), a.frame.flash, initCmd != nil)
	}
}

func TestExportFileIsOwnerOnly(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	client := newUITestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/export" {
			t.Fatalf("unexpected export path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"private":true}`))
	}))
	msg := exportCmd(client)().(exportDoneMsg)
	if msg.err != nil {
		t.Fatal(msg.err)
	}
	info, err := os.Stat(msg.path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS == "windows" {
		ok, err := securefile.OwnerOnly(msg.path)
		if err != nil {
			t.Fatal(err)
		}
		if !ok {
			t.Fatal("export file does not have a protected owner-only DACL")
		}
		return
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("export permissions = %o, want 600", got)
	}
}
