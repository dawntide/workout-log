package ui

import (
	"strings"
	"testing"
	"time"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func assertBodyWidth(t *testing.T, name, body string, width int) {
	t.Helper()
	stripped := ansi.Strip(body)
	for lineNumber, line := range strings.Split(stripped, "\n") {
		if got := lipgloss.Width(line); got > width {
			t.Errorf("%s line %d width %d > %d: %q", name, lineNumber+1, got, width, line)
		}
	}
}

func assertBodyHeight(t *testing.T, name, body string, height int) {
	t.Helper()
	if rows := strings.Count(ansi.Strip(body), "\n") + 1; rows > height {
		t.Errorf("%s rows %d > %d", name, rows, height)
	}
}

func TestRef5BodiesDoNotOverflowFortyColumns(t *testing.T) {
	const width, height = 40, 22
	startedAt := time.Date(2026, 7, 14, 10, 30, 0, 0, time.UTC)
	plan := uiRef5Plan()
	session := uiRef5Session("width", startedAt)

	t.Run("start", func(t *testing.T) {
		log := NewLog(nil)
		log.load = loadIdle
		log.planID, log.planName = plan.ID, plan.Name
		log.ref5 = newRef5StartState(plan, 82.5, startedAt)
		log.ref5Progress = ref5WindowProgressState{planID: plan.ID, status: ref5WindowStatusFixture()}
		body := log.Body(width, height)
		if !strings.Contains(ansi.Strip(body), "FIRST SQUAT START") {
			t.Fatalf("start body did not render the terminal-native start gate:\n%s", ansi.Strip(body))
		}
		assertBodyWidth(t, "start", body, width)
		assertBodyHeight(t, "start", body, height)
	})

	t.Run("preview", func(t *testing.T) {
		log := NewLog(nil)
		log.load = loadIdle
		log.planID, log.planName = plan.ID, plan.Name
		log.ref5 = newRef5StartState(plan, 82.5, startedAt)
		log.ref5Progress = ref5WindowProgressState{planID: plan.ID, status: ref5WindowStatusFixture()}
		log.ref5.Preview = &session
		log.ref5.PreviewSignature = log.ref5.Start.signature()
		log.ref5.Phase = ref5PreviewReady
		body := log.Body(width, height)
		if !strings.Contains(ansi.Strip(body), "PREVIEW") {
			t.Fatalf("preview body missing preview summary:\n%s", ansi.Strip(body))
		}
		assertBodyWidth(t, "preview", body, width)
		assertBodyHeight(t, "preview", body, height)
	})

	t.Run("editor", func(t *testing.T) {
		log := NewLog(nil)
		log.ref5 = &ref5SessionState{Plan: plan}
		if err := log.loadRef5Session(&session); err != nil {
			t.Fatalf("loadRef5Session: %v", err)
		}
		log.ref5Progress = ref5WindowProgressState{planID: plan.ID, status: ref5WindowStatusFixture()}
		log.groups[0].sets[0].reps = "3"
		log.groups[0].sets[0].done = true
		log.groups[0].ref5.TerminationReason = ref5ReasonNormal
		body := log.Body(width, height)
		if !strings.Contains(ansi.Strip(body), "BACK SQUAT") {
			t.Fatalf("editor body missing locked prescription:\n%s", ansi.Strip(body))
		}
		assertBodyWidth(t, "editor", body, width)
		assertBodyHeight(t, "editor", body, height)
	})

	t.Run("status", func(t *testing.T) {
		programs := NewPrograms(nil)
		programs.loaded = true
		programs.plans = []api.Plan{plan}
		programs.showRef5Status = true
		programs.statusPlanID = plan.ID
		programs.ref5Status = &api.Ref5Status{
			Revision:      17,
			NextFocus:     "PULL",
			NextSquatHard: "H3",
			PendingMicro: api.Ref5PendingMicroStatus{
				Pending: true,
				Reasons: []string{"STAGNATION_BP", "FORCED_AFTER_FAILURE"},
			},
			Windows: map[string]api.Ref5WindowStatus{
				"SQ": {Current: 1, Threshold: 6}, "BP": {Current: 2, Threshold: 4},
				"PULL": {Current: 3, Threshold: 4}, "DL": {Current: 1, Threshold: 4},
				"OHP": {Current: 2, Threshold: 4},
			},
			DirectStandardsKg: api.Ref5DirectStandardsKg{
				SqH3Kg: 102.5, BpFocusKg: 82.5, PullFocusTotalKg: 90,
				DeadliftKg: 142.5, OhpKg: 62.5,
			},
			PullLock: &api.Ref5PullLockStatus{
				WindowID: "pull-window-very-long-identifier", FocusTargetTotalKg: 90, VolumeTargetTotalKg: 82.5,
			},
			StartedSessionCount: 12, CompletedSessionCount: 11,
		}
		body := programs.Body(width, height)
		if !strings.Contains(ansi.Strip(body), "REF5 STATUS") {
			t.Fatalf("status body missing status heading:\n%s", ansi.Strip(body))
		}
		assertBodyWidth(t, "status", body, width)
		assertBodyHeight(t, "status", body, height)
	})
}

func TestRef5WindowPanelKeepsWorkoutAndFooterAtPhoneMinimum(t *testing.T) {
	plan := uiRef5Plan()
	session := uiRef5Session("phone-min", time.Now())
	log := NewLog(nil)
	log.ref5 = &ref5SessionState{Plan: plan}
	if err := log.loadRef5Session(&session); err != nil {
		t.Fatalf("loadRef5Session: %v", err)
	}
	log.ref5Progress = ref5WindowProgressState{planID: plan.ID, status: ref5WindowStatusFixture()}

	for _, height := range []int{18, 22} {
		frame := NewFrame(nil, nil)
		frame.views[vToday] = log
		out := renderFrame(frame, 40, height)
		if rows := strings.Count(out, "\n") + 1; rows > height {
			t.Errorf("h=%d frame rows %d > %d:\n%s", height, rows, height, out)
		}
		for _, want := range []string{"기본 판정창", "BACK SQUAT", "space", "NORMAL"} {
			if !strings.Contains(out, want) {
				t.Errorf("h=%d frame missing %q:\n%s", height, want, out)
			}
		}
	}
}
