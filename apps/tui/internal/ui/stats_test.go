package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

func TestStatsRenders(t *testing.T) {
	out := ansi.Strip(sampleStats().Body(52, 16))
	for _, want := range []string{"SQUAT", "best 142", "3m"} {
		if !strings.Contains(out, want) {
			t.Errorf("stats body missing %q:\n%s", want, out)
		}
	}
}

func TestStatsCurrentLift(t *testing.T) {
	if got := sampleStats().currentLift(); got != "Squat" {
		t.Errorf("currentLift = %q, want Squat", got)
	}
}

func TestStatsLoadingMode(t *testing.T) {
	if NewStats(nil).Mode().Label != "LOADING" {
		t.Error("expected LOADING before data")
	}
}

func TestBlockChart(t *testing.T) {
	out := ansi.Strip(blockChart([]float64{1, 3, 2, 5, 4, 6}, 12, 4))
	if !strings.Contains(out, "█") {
		t.Errorf("block chart should contain full blocks:\n%s", out)
	}
}
