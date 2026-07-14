package ui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
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
	if hi.rows[0].performedAt.IsZero() {
		t.Error("performedAt should be preserved on the row for editing")
	}
}

func TestHistoryEditKey(t *testing.T) {
	scr, _ := NewHistory(nil).Update(historyLoadedMsg{logs: []api.LogItem{
		{ID: "log-1", PerformedAt: time.Date(2026, 6, 20, 0, 0, 0, 0, time.UTC),
			Sets: []api.LoggedSet{{ExerciseName: "Squat", WeightKg: 100, Reps: 5}}},
	}})
	h := scr.(History)
	_, cmd := h.handleKey(tea.KeyPressMsg{Code: 'e'})
	if cmd == nil {
		t.Fatal("e should emit an editLogMsg command")
	}
	em, ok := cmd().(editLogMsg)
	if !ok {
		t.Fatalf("want editLogMsg, got %T", cmd())
	}
	if em.id != "log-1" || len(em.sets) != 1 {
		t.Errorf("editLogMsg = %+v, want id=log-1 with 1 set", em)
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

func TestHistoryUsesPlanTimezoneAcrossUTCDayBoundary(t *testing.T) {
	performedAt := time.Date(2026, 7, 14, 16, 30, 0, 0, time.UTC) // 07-15 01:30 Asia/Seoul
	planID := "plan-ref5-seoul"
	sessionKey := "REF5:2026-07-14T16:30:00.000Z:start:event:history"
	screen, _ := NewHistory(nil).Update(historyLoadedMsg{
		plans: []api.Plan{{
			ID: planID, Name: "REF5", Params: map[string]any{"timezone": "Asia/Seoul"},
		}},
		logs: []api.LogItem{{
			ID: "log-ref5-seoul", PlanID: &planID, PerformedAt: performedAt,
			GeneratedSession: &api.GeneratedSessionRef{SessionKey: sessionKey},
			Sets:             []api.LoggedSet{{ExerciseName: "Back Squat", WeightKg: 100, Reps: 5}},
		}},
	})
	history := screen.(History)
	if len(history.rows) != 1 || history.rows[0].date != "07-15" {
		t.Fatalf("history row date = %#v, want Asia/Seoul 07-15", history.rows)
	}
	if history.dayVol["2026-07-15"] != 500 || history.dayVol["2026-07-14"] != 0 {
		t.Fatalf("day volume used UTC boundary: %#v", history.dayVol)
	}
	out := ansi.Strip(history.Body(60, 14))
	if !strings.Contains(out, "REF5 07-15 01:30") {
		t.Fatalf("history session label did not use plan timezone:\n%s", out)
	}
}
