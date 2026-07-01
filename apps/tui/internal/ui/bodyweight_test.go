package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func TestBodyweightHelpers(t *testing.T) {
	if !isBodyweightExercise("Weighted Pull-Up") || !isBodyweightExercise("풀업") || isBodyweightExercise("Squat") {
		t.Error("isBodyweightExercise detection wrong")
	}
	if got := bwExternalFromTotal(80, 74); got != 6 {
		t.Errorf("bwExternalFromTotal(80,74) = %v, want 6", got)
	}
	if got := bwExternalFromTotal(70, 74); got != 0 { // total < bw → 0
		t.Errorf("bwExternalFromTotal(70,74) = %v, want 0", got)
	}
	if got := loggedTotalLoad("Pull-Up", 20, &api.SetMeta{TotalLoadKg: 94}); got != 94 {
		t.Errorf("loggedTotalLoad with meta = %v, want 94", got)
	}
	if got := loggedTotalLoad("Pull-Up", 80, nil); got != 80 { // no meta → weightKg is the total
		t.Errorf("loggedTotalLoad no-meta = %v, want 80", got)
	}
	if got := loggedTotalLoad("Squat", 100, nil); got != 100 {
		t.Errorf("loggedTotalLoad non-bw = %v, want 100", got)
	}
	if addedSuffix(6) != "(+6)" || addedSuffix(0) != "(체중)" {
		t.Errorf("addedSuffix: got %q / %q", addedSuffix(6), addedSuffix(0))
	}
}

// TestLogBodyweightDisplay verifies a weighted pull-up shows the bodyweight-
// inclusive total in the cell with the added weight broken out (+6) / (체중).
func TestLogBodyweightDisplay(t *testing.T) {
	l := NewLog(nil)
	l.load = loadIdle
	l.bodyweight = 74
	l.groups = []exGroup{{name: "Weighted Pull-Up", sets: []setEntry{
		{weight: "6", reps: "5", total: 80, done: true}, // 74 + 6
		{weight: "0", reps: "", tgtReps: 5, total: 74},  // bodyweight only
	}}}
	l.gi, l.si, l.col = 0, 1, colReps
	out := ansi.Strip(l.Body(60, 18))
	for _, want := range []string{"80", "(+6)", "74", "(체중)"} {
		if !strings.Contains(out, want) {
			t.Errorf("weighted pull-up body missing %q:\n%s", want, out)
		}
	}
	// the raw external weight (6) must NOT be the cell value shown as the load
	// (i.e. "× 5" total context); the total 80 is the headline.
}
