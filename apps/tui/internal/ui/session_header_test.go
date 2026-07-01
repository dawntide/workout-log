package ui

import (
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

// TestLogSessionHeader verifies today shows the plan name and cycle label.
func TestLogSessionHeader(t *testing.T) {
	l := sampleLog()
	l.planName, l.sessionKey = "5/3/1 Leader", "C2W6D1"
	out := ansi.Strip(l.Body(58, 16))
	for _, want := range []string{"5/3/1 Leader", "C2W6D1"} {
		if !strings.Contains(out, want) {
			t.Errorf("today body missing session header %q:\n%s", want, out)
		}
	}
}

// TestHistorySessionLabel verifies a history row surfaces the cycle label.
func TestHistorySessionLabel(t *testing.T) {
	hi := NewHistory(nil)
	hi.loaded = true
	hi.build([]api.LogItem{
		{ID: "1", PerformedAt: time.Now(), GeneratedSession: &api.GeneratedSessionRef{SessionKey: "C2W6D1"}, Sets: []api.LoggedSet{{ExerciseName: "Squat", WeightKg: 100, Reps: 5}}},
	})
	out := ansi.Strip(hi.Body(60, 14))
	if !strings.Contains(out, "C2W6D1") {
		t.Errorf("history row missing session label:\n%s", out)
	}
}
