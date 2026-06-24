package ui

import (
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func TestHistoryBuild(t *testing.T) {
	hi := NewHistory(nil)
	hi.build([]api.LogItem{
		{ID: "a", PerformedAt: time.Now(), Sets: []api.LoggedSet{
			{ExerciseName: "Squat", WeightKg: 100, Reps: 5},
			{ExerciseName: "Bench", WeightKg: 70, Reps: 5},
		}},
	})
	if len(hi.rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(hi.rows))
	}
	if hi.rows[0].volume != 100*5+70*5 {
		t.Errorf("volume = %v, want 850", hi.rows[0].volume)
	}
	if !strings.Contains(hi.rows[0].summary, "Squat") {
		t.Errorf("summary = %q, want it to contain Squat", hi.rows[0].summary)
	}
}

func TestHistoryRenders(t *testing.T) {
	hi := NewHistory(nil)
	hi.loaded = true
	hi.build([]api.LogItem{
		{ID: "a", PerformedAt: time.Now(), Sets: []api.LoggedSet{{ExerciseName: "Squat", WeightKg: 100, Reps: 5}}},
	})
	out := ansi.Strip(hi.Body(50, 14))
	if !strings.Contains(out, "Squat") {
		t.Errorf("history body missing Squat:\n%s", out)
	}
}

func TestHistoryLoadingMode(t *testing.T) {
	if NewHistory(nil).Mode().Label != "LOADING" {
		t.Error("expected LOADING before data is loaded")
	}
}
