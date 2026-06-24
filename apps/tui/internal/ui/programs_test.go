package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func TestProgramsRenders(t *testing.T) {
	pr := NewPrograms(nil)
	pr.loaded = true
	pr.plans = []api.Plan{
		{ID: "1", Name: "5/3/1", BaseProgramName: "BBB"},
		{ID: "2", Name: "PPL", Type: "COMPOSITE"},
	}
	pr.activeID = "1"
	out := ansi.Strip(pr.Body(50, 12))
	if !strings.Contains(out, "5/3/1") || !strings.Contains(out, "PPL") {
		t.Errorf("programs body missing plan names:\n%s", out)
	}
	if !strings.Contains(out, "●") {
		t.Errorf("programs body missing active bullet:\n%s", out)
	}
}

func TestProgramsLoadingMode(t *testing.T) {
	if NewPrograms(nil).Mode().Label != "LOADING" {
		t.Error("expected LOADING before data is loaded")
	}
}
