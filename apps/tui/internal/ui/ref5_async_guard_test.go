package ui

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func ref5StartFromSession(session api.GeneratedSession) ref5StartValues {
	meta := session.Snapshot.Ref5
	return ref5StartValues{
		ActualStartAt:     meta.ActualStartAt,
		BodyweightKg:      float64(meta.DomainSnapshot.StartInput.TodayBodyweightKg),
		ManualMicro:       meta.DomainSnapshot.StartInput.ManualMicro,
		ClimbingWithin48h: meta.DomainSnapshot.StartInput.ClimbingWithin48h,
		OmitPullVolume:    meta.DomainSnapshot.StartInput.OmitPullVolume,
		StartEventID:      meta.StartEventID,
	}
}

func ref5PreviewReadyLog() Log {
	preview := uiRef5Session("preview-request", time.Date(2026, 7, 14, 10, 0, 0, 0, time.UTC))
	start := ref5StartFromSession(preview)
	l := NewLog(nil)
	l.load = loadIdle
	l.planID, l.planName = preview.PlanID, preview.Snapshot.Plan.Name
	l.ref5 = &ref5SessionState{
		Phase: ref5PreviewReady, Plan: uiRef5Plan(), Start: start,
		Preview: &preview, PreviewSignature: start.signature(),
	}
	return l
}

func ref5StartingLog() Log {
	l := ref5PreviewReadyLog()
	l.ref5.Phase = ref5Starting
	l.status = "start request pending"
	return l
}

func TestRef5ConfirmedStartTransitionsToStartingBeforeRequest(t *testing.T) {
	l := ref5PreviewReadyLog()
	confirmed := ref5StartConfirmedMsg{
		planID: l.ref5.Plan.ID, values: l.ref5.Start, signature: l.ref5.Start.signature(),
	}

	screen, cmd := l.Update(confirmed)
	got := screen.(Log)
	if got.ref5 == nil || got.ref5.Phase != ref5Starting {
		t.Fatalf("confirmed start phase = %#v, want STARTING", got.ref5)
	}
	if cmd == nil {
		t.Fatal("confirmed current start did not launch the persisted start request")
	}
	if got.Mode().Label != "STARTING" {
		t.Errorf("mode = %q, want STARTING", got.Mode().Label)
	}

	// A duplicate confirmation while the request is in flight must not issue a
	// second write. A failed current response can explicitly return to REVIEW for
	// an idempotent retry instead.
	screen, duplicateCmd := got.Update(confirmed)
	got = screen.(Log)
	if duplicateCmd != nil || got.ref5.Phase != ref5Starting {
		t.Fatalf("duplicate in-flight confirmation launched again: phase=%v cmd=%v", got.ref5.Phase, duplicateCmd != nil)
	}
}

func TestRef5UncertainStartPersistsAndOnlyRetriesExactEnvelope(t *testing.T) {
	store := &memDraftStore{}
	l := ref5PreviewReadyLog().withDrafts(store).withOwner("user-a")
	confirmed := ref5StartConfirmedMsg{
		planID: l.ref5.Plan.ID, values: l.ref5.Start, signature: l.ref5.Start.signature(),
	}

	screen, cmd := l.Update(confirmed)
	got := screen.(Log)
	if cmd == nil || got.ref5 == nil || !got.ref5.StartUncertain ||
		!got.ref5.StartRequestInFlight || len(store.data) == 0 {
		t.Fatalf("start preflight was not durable: ref5=%#v draft=%q cmd=%v", got.ref5, store.data, cmd != nil)
	}

	start := got.ref5.Start
	screen, _ = got.Update(ref5StartResultMsg{
		planID: got.ref5.Plan.ID, signature: start.signature(), values: start,
		err: fmt.Errorf("connection reset after write"),
	})
	got = screen.(Log)
	if got.ref5.Phase != ref5Starting || !got.ref5.StartUncertain ||
		got.ref5.StartRequestInFlight || got.Mode().Label != "VERIFY" {
		t.Fatalf("unknown start outcome unlocked the envelope: ref5=%#v mode=%q", got.ref5, got.Mode().Label)
	}

	draft, ok := loadTodayDraft(store, time.Now().Add(48*time.Hour), "user-a")
	if !ok || draft.Ref5 == nil || !draft.Ref5.StartPending || draft.Ref5.Start != start || len(draft.Groups) != 0 {
		t.Fatalf("pending start draft = %#v, ok=%v", draft, ok)
	}
	restored := NewLog(nil)
	restored.loadFromDraft(draft)
	if restored.ref5 == nil || restored.ref5.Phase != ref5Starting ||
		!restored.ref5.StartUncertain || restored.ref5.Start != start || restored.Mode().Label != "VERIFY" {
		t.Fatalf("restored pending start = %#v mode=%q", restored.ref5, restored.Mode().Label)
	}

	retry, retryCmd := got.updateNormal(tea.KeyPressMsg{Code: 's', Text: "s"})
	if retryCmd == nil || !retry.ref5.StartRequestInFlight || retry.ref5.Start != start {
		t.Fatalf("exact start retry = %#v cmd=%v", retry.ref5, retryCmd != nil)
	}
	blocked, blockedCmd := got.updateNormal(tea.KeyPressMsg{Code: 'e', Text: "e"})
	if blockedCmd != nil || blocked.ref5.Start != start || blocked.ref5.Phase != ref5Starting {
		t.Fatalf("uncertain start allowed editing: ref5=%#v cmd=%v", blocked.ref5, blockedCmd != nil)
	}
}

func TestRef5DefiniteStartRejectionUnlocksReview(t *testing.T) {
	l := ref5StartingLog()
	l.ref5.StartUncertain = true
	l.ref5.StartRequestInFlight = true
	start := l.ref5.Start
	screen, cmd := l.Update(ref5StartResultMsg{
		planID: l.ref5.Plan.ID, signature: start.signature(), values: start,
		err: &api.APIError{Status: http.StatusBadRequest, Message: "invalid start"},
	})
	got := screen.(Log)
	if cmd != nil || got.ref5.Phase != ref5PreviewReady || got.ref5.StartUncertain ||
		got.ref5.StartRequestInFlight || !got.statusErr {
		t.Fatalf("definite rejection stayed locked: ref5=%#v status=%q cmd=%v", got.ref5, got.status, cmd != nil)
	}
}

func TestRef5MalformedSuccessfulStartResponseRemainsUncertain(t *testing.T) {
	l := ref5StartingLog()
	l.ref5.StartUncertain = true
	l.ref5.StartRequestInFlight = true
	start := l.ref5.Start
	screen, _ := l.Update(ref5StartResultMsg{
		planID: l.ref5.Plan.ID, signature: start.signature(), values: start,
	})
	got := screen.(Log)
	if got.ref5.Phase != ref5Starting || !got.ref5.StartUncertain ||
		got.ref5.StartRequestInFlight || got.Mode().Label != "VERIFY" {
		t.Fatalf("malformed success unlocked start: ref5=%#v mode=%q", got.ref5, got.Mode().Label)
	}
}

func TestRef5StaleStartConfirmationIsIgnored(t *testing.T) {
	for _, tc := range []struct {
		name      string
		planID    string
		signature string
	}{
		{name: "other plan", planID: "plan-ref5-other", signature: "current"},
		{name: "other envelope", planID: "plan-ref5", signature: "stale-signature"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			l := ref5PreviewReadyLog()
			signature := tc.signature
			if signature == "current" {
				signature = l.ref5.Start.signature()
			}
			screen, cmd := l.Update(ref5StartConfirmedMsg{
				planID: tc.planID, values: l.ref5.Start, signature: signature,
			})
			got := screen.(Log)
			if cmd != nil || got.ref5.Phase != ref5PreviewReady || got.ref5.Session != nil {
				t.Fatalf("stale confirmation mutated state: phase=%v session=%#v cmd=%v", got.ref5.Phase, got.ref5.Session, cmd != nil)
			}
		})
	}
}

func TestRef5EditingStartInputInvalidatesReviewedPreviewImmediately(t *testing.T) {
	l := ref5PreviewReadyLog()
	next, cmd := l.openRef5StartTimePicker()
	if cmd == nil || next.ref5.Phase != ref5Decide || next.ref5.Preview != nil || next.ref5.PreviewSignature != "" {
		t.Fatalf("editing retained a startable stale preview: ref5=%#v cmd=%v", next.ref5, cmd != nil)
	}
	if picker, ok := cmd().(openPickerMsg); !ok || picker.tag != "ref5-start-at" {
		t.Fatalf("start edit command = %#v", cmd())
	}
}

func TestRef5PreviewResponseFromAnotherPlanIsIgnored(t *testing.T) {
	l := ref5PreviewReadyLog()
	l.ref5.Phase = ref5Previewing
	l.ref5.Preview, l.ref5.PreviewSignature = nil, ""
	l.status = "preview request pending"
	foreign := uiRef5Session("foreign-preview", time.Date(2026, 7, 14, 11, 0, 0, 0, time.UTC))

	screen, cmd := l.Update(ref5PreviewResultMsg{
		session: &foreign, planID: "plan-ref5-other", signature: l.ref5.Start.signature(),
	})
	got := screen.(Log)
	if cmd != nil || got.ref5.Phase != ref5Previewing || got.ref5.Preview != nil {
		t.Fatalf("foreign preview was accepted: phase=%v preview=%#v cmd=%v", got.ref5.Phase, got.ref5.Preview, cmd != nil)
	}
	if got.status != "preview request pending" {
		t.Errorf("stale preview changed status to %q", got.status)
	}
}

func TestRef5StaleStartResultsAreIgnored(t *testing.T) {
	response := uiRef5Session("foreign-start-result", time.Date(2026, 7, 14, 12, 0, 0, 0, time.UTC))
	for _, tc := range []struct {
		name      string
		phase     ref5Phase
		planID    string
		signature string
	}{
		{name: "other plan", phase: ref5Starting, planID: "plan-ref5-other", signature: "current"},
		{name: "other envelope", phase: ref5Starting, planID: "plan-ref5", signature: "stale-signature"},
		{name: "no longer starting", phase: ref5PreviewReady, planID: "plan-ref5", signature: "current"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			l := ref5StartingLog()
			l.ref5.Phase = tc.phase
			signature := tc.signature
			if signature == "current" {
				signature = l.ref5.Start.signature()
			}
			beforeStatus := l.status
			screen, cmd := l.Update(ref5StartResultMsg{
				session: &response, planID: tc.planID, signature: signature,
				values: l.ref5.Start,
			})
			got := screen.(Log)
			if cmd != nil || got.ref5.Session != nil || got.generatedSessionID != "" || len(got.groups) != 0 {
				t.Fatalf("stale start result replaced state: session=%#v generated=%q groups=%d", got.ref5.Session, got.generatedSessionID, len(got.groups))
			}
			if got.ref5.Phase != tc.phase || got.status != beforeStatus {
				t.Errorf("stale start result changed phase/status: phase=%v status=%q", got.ref5.Phase, got.status)
			}
		})
	}
}

func ref5ResumeSelection(t *testing.T, selectedID string) (Log, api.GeneratedSession, api.GeneratedSession) {
	t.Helper()
	first := uiRef5Session("resume-first", time.Date(2026, 7, 14, 8, 0, 0, 0, time.UTC))
	second := uiRef5Session("resume-second", time.Date(2026, 7, 14, 9, 0, 0, 0, time.UTC))
	l := NewLog(nil)
	l.load = loadIdle
	l.ref5 = newRef5StartState(uiRef5Plan(), 82.5, time.Date(2026, 7, 14, 10, 0, 0, 0, time.UTC))
	l.ref5.Resume = map[string]api.GeneratedSession{first.ID: first, second.ID: second}
	next, cmd, handled := l.handleRef5Picked(pickedMsg{tag: "ref5-resume", value: selectedID})
	if !handled || cmd == nil || next.ref5.Phase != ref5Starting {
		t.Fatalf("resume selection was not started: handled=%v cmd=%v phase=%v", handled, cmd != nil, next.ref5.Phase)
	}
	return next, first, second
}

func TestRef5StaleResumeResultsAreIgnored(t *testing.T) {
	for _, tc := range []struct {
		name            string
		messagePlanID   string
		messageSession  string
		responseSession string
		phase           ref5Phase
	}{
		{name: "other plan", messagePlanID: "plan-ref5-other", messageSession: "first", responseSession: "first", phase: ref5Starting},
		{name: "other selected session", messagePlanID: "plan-ref5", messageSession: "second", responseSession: "second", phase: ref5Starting},
		{name: "no longer starting", messagePlanID: "plan-ref5", messageSession: "first", responseSession: "first", phase: ref5Decide},
	} {
		t.Run(tc.name, func(t *testing.T) {
			l, first, second := ref5ResumeSelection(t, "resume-first")
			l.ref5.Phase = tc.phase
			messageSessionID := first.ID
			if tc.messageSession == "second" {
				messageSessionID = second.ID
			}
			response := first
			if tc.responseSession == "second" {
				response = second
			}
			beforeStatus := l.status
			screen, cmd := l.Update(ref5ResumeResultMsg{
				session: &response, planID: tc.messagePlanID, sessionID: messageSessionID,
			})
			got := screen.(Log)
			if cmd != nil || got.ref5.Session != nil || got.generatedSessionID != "" || len(got.groups) != 0 {
				t.Fatalf("stale resume replaced state: session=%#v generated=%q groups=%d", got.ref5.Session, got.generatedSessionID, len(got.groups))
			}
			if got.ref5.Phase != tc.phase || got.status != beforeStatus {
				t.Errorf("stale resume changed phase/status: phase=%v status=%q", got.ref5.Phase, got.status)
			}
		})
	}
}

func TestRef5CurrentResumeFailureAndMalformedResponseUnlockGate(t *testing.T) {
	for _, tc := range []struct {
		name string
		msg  func(first, second api.GeneratedSession) ref5ResumeResultMsg
	}{
		{
			name: "request error",
			msg: func(first, _ api.GeneratedSession) ref5ResumeResultMsg {
				return ref5ResumeResultMsg{planID: first.PlanID, sessionID: first.ID, err: fmt.Errorf("offline")}
			},
		},
		{
			name: "response id mismatch",
			msg: func(first, second api.GeneratedSession) ref5ResumeResultMsg {
				return ref5ResumeResultMsg{session: &second, planID: first.PlanID, sessionID: first.ID}
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			l, first, second := ref5ResumeSelection(t, "resume-first")
			screen, cmd := l.Update(tc.msg(first, second))
			got := screen.(Log)
			if cmd != nil || got.ref5.Phase != ref5Decide || got.ref5.PendingSessionID != "" || !got.statusErr {
				t.Fatalf("failed resume stayed locked: phase=%v pending=%q status=%q cmd=%v",
					got.ref5.Phase, got.ref5.PendingSessionID, got.status, cmd != nil)
			}
			if got.ref5.Session != nil || len(got.groups) != 0 {
				t.Fatalf("failed resume loaded a session: ref5=%#v groups=%#v", got.ref5, got.groups)
			}
		})
	}
}

func TestRef5CurrentResumeResultStillLoadsSelectedSession(t *testing.T) {
	l, selected, _ := ref5ResumeSelection(t, "resume-first")
	screen, cmd := l.Update(ref5ResumeResultMsg{
		session: &selected, planID: l.ref5.Plan.ID, sessionID: selected.ID,
	})
	got := screen.(Log)
	if cmd != nil || got.ref5 == nil || !got.ref5.active() || got.generatedSessionID != selected.ID {
		t.Fatalf("current resume result was not loaded: ref5=%#v generated=%q", got.ref5, got.generatedSessionID)
	}
}

func TestRef5EscapeCannotFallThroughIntoGenericEditor(t *testing.T) {
	for _, phase := range []ref5Phase{ref5Decide, ref5Previewing, ref5PreviewReady, ref5Starting} {
		t.Run(phaseNameForTest(phase), func(t *testing.T) {
			l := ref5PreviewReadyLog()
			l.ref5.Phase = phase
			if phase == ref5Decide || phase == ref5Previewing {
				l.ref5.Preview, l.ref5.PreviewSignature = nil, ""
			}
			next, cmd := l.updateNormal(tea.KeyPressMsg{Code: tea.KeyEscape})
			wantPhase := ref5Decide
			if phase == ref5Starting {
				wantPhase = ref5Starting
			}
			if cmd != nil || next.ref5 == nil || next.ref5.Phase != wantPhase || len(next.groups) != 0 {
				t.Fatalf("escape escaped the REF5 gate: ref5=%#v groups=%#v cmd=%v", next.ref5, next.groups, cmd != nil)
			}
			if next.editing || next.target != editNone {
				t.Fatalf("escape fell through into generic editing: editing=%v target=%v", next.editing, next.target)
			}

			// Any response that was already in flight remains stale after escape and
			// cannot repopulate the now-empty generic buffer.
			foreign := uiRef5Session("after-escape", time.Date(2026, 7, 14, 13, 0, 0, 0, time.UTC))
			screen, resultCmd := next.Update(ref5PreviewResultMsg{
				session: &foreign, planID: "plan-ref5", signature: l.ref5.Start.signature(),
			})
			after := screen.(Log)
			if resultCmd != nil || after.ref5 == nil || after.ref5.Phase != wantPhase || len(after.groups) != 0 || after.editing {
				t.Fatalf("post-escape response reopened editor: ref5=%#v groups=%d editing=%v", after.ref5, len(after.groups), after.editing)
			}
		})
	}

	t.Run("active session", func(t *testing.T) {
		session := uiRef5Session("active-escape", time.Date(2026, 7, 14, 14, 0, 0, 0, time.UTC))
		l := NewLog(nil)
		l.ref5 = &ref5SessionState{Plan: uiRef5Plan()}
		if err := l.loadRef5Session(&session); err != nil {
			t.Fatal(err)
		}
		next, cmd := l.updateNormal(tea.KeyPressMsg{Code: tea.KeyEscape})
		if cmd != nil || next.ref5 == nil || !next.ref5.active() || next.generatedSessionID != session.ID || next.editing {
			t.Fatalf("escape changed active locked session: ref5=%#v generated=%q editing=%v", next.ref5, next.generatedSessionID, next.editing)
		}
	})
}

func TestRef5SavingLocksAllSessionMutations(t *testing.T) {
	l := dirtyRef5LogForGuardTest(t)
	l.saving = true
	beforeReps := l.groups[0].sets[0].reps
	beforeReason := l.groups[0].ref5.TerminationReason

	for _, key := range []string{"x", "t", "i", "enter", "n", "s"} {
		next, cmd := l.updateNormal(tea.KeyPressMsg{Code: rune(key[0]), Text: key})
		if cmd != nil || next.editing || next.groups[0].sets[0].reps != beforeReps ||
			next.groups[0].ref5.TerminationReason != beforeReason {
			t.Fatalf("%q mutated a saving REF5 session: reps=%q reason=%q editing=%v cmd=%v",
				key, next.groups[0].sets[0].reps, next.groups[0].ref5.TerminationReason, next.editing, cmd != nil)
		}
	}
}

func TestRef5StartingBlocksPlanReplacement(t *testing.T) {
	l := ref5StartingLog()
	other := api.Plan{ID: "plan-other", Name: "Other", Params: map[string]any{}}
	screen, cmd := l.Update(planActivatedMsg{id: other.ID, name: other.Name, plan: other})
	got := screen.(Log)
	if cmd != nil || got.ref5.Phase != ref5Starting || got.planID != "plan-ref5" || !got.statusErr {
		t.Fatalf("in-flight start was replaced: phase=%v plan=%q status=%q cmd=%v",
			got.ref5.Phase, got.planID, got.status, cmd != nil)
	}
}

func TestRef5ActiveSessionIgnoresLatePrepareAndDraftRestore(t *testing.T) {
	l := dirtyRef5LogForGuardTest(t)
	beforeSession, beforeReps := l.generatedSessionID, l.groups[0].sets[0].reps

	screen, cmd := l.Update(ref5PlanPreparedMsg{plan: uiRef5Plan(), bodyweight: 99})
	got := screen.(Log)
	if cmd != nil || got.generatedSessionID != beforeSession || got.groups[0].sets[0].reps != beforeReps {
		t.Fatalf("late prepare replaced active work: session=%q reps=%q cmd=%v", got.generatedSessionID, got.groups[0].sets[0].reps, cmd != nil)
	}

	foreign := todayDraft{Groups: []draftGroup{{Name: "Foreign", Sets: []draftSet{{Reps: "5", Done: true}}}}}
	screen, cmd = got.Update(draftRestoredMsg{draft: foreign})
	got = screen.(Log)
	if cmd != nil || got.generatedSessionID != beforeSession || got.groups[0].sets[0].reps != beforeReps {
		t.Fatalf("late draft replaced active work: session=%q groups=%#v cmd=%v", got.generatedSessionID, got.groups, cmd != nil)
	}
}

func TestLateDraftRestoreCannotReplaceAChosenPlan(t *testing.T) {
	l := NewLog(nil)
	l.planID, l.planName = "chosen-plan", "Chosen"
	foreign := todayDraft{Groups: []draftGroup{{Name: "Foreign", Sets: []draftSet{{Reps: "5", Done: true}}}}}
	screen, cmd := l.Update(draftRestoredMsg{draft: foreign})
	got := screen.(Log)
	if cmd != nil || got.planID != "chosen-plan" || len(got.groups) != 0 {
		t.Fatalf("late boot draft replaced chosen plan: plan=%q groups=%#v cmd=%v", got.planID, got.groups, cmd != nil)
	}
}

func TestGenericDraftRestoreClearsStaleRef5State(t *testing.T) {
	l := NewLog(nil)
	l.ref5 = newRef5StartState(uiRef5Plan(), 80, time.Now())
	l.loadFromDraft(todayDraft{Groups: []draftGroup{{Name: "Manual", Sets: []draftSet{{Weight: "50"}}}}})
	if l.ref5 != nil || len(l.groups) != 1 || l.groups[0].name != "Manual" {
		t.Fatalf("generic draft retained stale REF5 state: ref5=%#v groups=%#v", l.ref5, l.groups)
	}
}

func TestGenericSavingBlocksMutationAndReplacement(t *testing.T) {
	l := sampleLog()
	l.saving, l.planID = true, "plan-current"
	before := cloneGroups(l.groups)
	next, keyCmd := l.updateNormal(tea.KeyPressMsg{Code: 'd', Text: "d"})
	if keyCmd != nil || len(next.groups) != len(before) || len(next.groups[0].sets) != len(before[0].sets) {
		t.Fatalf("saving key mutated generic buffer: groups=%#v cmd=%v", next.groups, keyCmd != nil)
	}
	other := api.Plan{ID: "plan-other", Name: "Other", Params: map[string]any{}}
	screen, replaceCmd := l.Update(planActivatedMsg{id: other.ID, name: other.Name, plan: other})
	got := screen.(Log)
	if replaceCmd != nil || got.planID != "plan-current" || !got.statusErr {
		t.Fatalf("saving generic buffer was replaced: plan=%q status=%q cmd=%v", got.planID, got.status, replaceCmd != nil)
	}
}

func phaseNameForTest(phase ref5Phase) string {
	switch phase {
	case ref5Decide:
		return "decide"
	case ref5Previewing:
		return "previewing"
	case ref5PreviewReady:
		return "preview ready"
	case ref5Starting:
		return "starting"
	default:
		return "unknown"
	}
}

func dirtyRef5LogForGuardTest(t *testing.T) Log {
	t.Helper()
	session := uiRef5Session("dirty-buffer", time.Date(2026, 7, 14, 15, 0, 0, 0, time.UTC))
	l := NewLog(nil)
	l.ref5 = &ref5SessionState{Plan: uiRef5Plan()}
	if err := l.loadRef5Session(&session); err != nil {
		t.Fatal(err)
	}
	l.groups[0].sets[0].reps = "2"
	l.groups[0].sets[0].done = true
	l.ref5.Dirty = true
	l.status = "dirty REF5 sentinel"
	return l
}

func assertDirtyRef5BufferPreserved(t *testing.T, got Log) {
	t.Helper()
	if got.ref5 == nil || !got.ref5.active() || !got.ref5.Dirty {
		t.Fatalf("dirty REF5 state was replaced: %#v", got.ref5)
	}
	if got.generatedSessionID != "dirty-buffer" || got.groups[0].sets[0].reps != "2" {
		t.Fatalf("dirty REF5 work changed: generated=%q groups=%#v", got.generatedSessionID, got.groups)
	}
}

func TestDirtyRef5LogRejectsPlanAndHistoryReplacement(t *testing.T) {
	t.Run("plan activation", func(t *testing.T) {
		l := dirtyRef5LogForGuardTest(t)
		other := api.Plan{ID: "plan-other", Name: "Other Program", Type: "SINGLE", Params: map[string]any{}}
		screen, cmd := l.Update(planActivatedMsg{id: other.ID, name: other.Name, plan: other})
		got := screen.(Log)
		assertDirtyRef5BufferPreserved(t, got)
		if cmd != nil || !got.statusErr {
			t.Fatalf("dirty plan replacement was not blocked with an error: cmd=%v status=%q", cmd != nil, got.status)
		}
	})

	t.Run("history edit", func(t *testing.T) {
		l := dirtyRef5LogForGuardTest(t)
		screen, cmd := l.Update(editLogMsg{
			id: "other-log", performedAt: time.Date(2026, 7, 13, 10, 0, 0, 0, time.UTC),
			sets: []api.LoggedSet{{ExerciseName: "Bench Press", WeightKg: 80, Reps: 5}},
		})
		got := screen.(Log)
		assertDirtyRef5BufferPreserved(t, got)
		if cmd != nil || !got.statusErr {
			t.Fatalf("dirty history replacement was not blocked with an error: cmd=%v status=%q", cmd != nil, got.status)
		}
	})
}

func TestFrameKeepsDirtyRef5BufferOnReplacementEvents(t *testing.T) {
	t.Run("plan activation", func(t *testing.T) {
		f := NewFrame(nil, nil)
		f.views[vToday] = dirtyRef5LogForGuardTest(t)
		programs := f.views[vPrograms].(Programs)
		programs.activeID = "plan-ref5"
		f.views[vPrograms] = programs
		f.activePlanID, f.activePlanName = "plan-ref5", "REF5 Adaptive Strength"
		f.active = vPrograms
		other := api.Plan{ID: "plan-other", Name: "Other Program", Type: "SINGLE", Params: map[string]any{}}

		model, cmd := f.Update(planActivatedMsg{id: other.ID, name: other.Name, plan: other})
		got := model.(Frame)
		assertDirtyRef5BufferPreserved(t, got.views[vToday].(Log))
		if cmd != nil {
			t.Fatal("frame launched a plan-load command after the dirty buffer rejected replacement")
		}
		if got.activePlanID != "plan-ref5" || got.views[vPrograms].(Programs).activeID != "plan-ref5" {
			t.Fatalf("rejected activation changed plan bookkeeping: frame=%q programs=%q",
				got.activePlanID, got.views[vPrograms].(Programs).activeID)
		}
	})

	t.Run("history edit", func(t *testing.T) {
		f := NewFrame(nil, nil)
		f.views[vToday] = dirtyRef5LogForGuardTest(t)
		f.active = vHistory

		model, cmd := f.Update(editLogMsg{
			id: "other-log", performedAt: time.Date(2026, 7, 13, 10, 0, 0, 0, time.UTC),
			sets: []api.LoggedSet{{ExerciseName: "Bench Press", WeightKg: 80, Reps: 5}},
		})
		got := model.(Frame)
		assertDirtyRef5BufferPreserved(t, got.views[vToday].(Log))
		if cmd != nil {
			t.Fatal("frame launched a command after rejecting dirty history replacement")
		}
	})
}
