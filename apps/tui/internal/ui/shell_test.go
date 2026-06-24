package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

// render feeds a window size and returns the rendered frame content.
func render(m Shell, w, h int) string {
	nm, _ := m.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nm.(Shell).View().Content
}

func TestShellRenders(t *testing.T) {
	out := render(NewShell(), 80, 24)
	for _, want := range []string{"ironlog", "home", "log", "stats", "cal", "set", "NORMAL", "tab", "quit"} {
		if !strings.Contains(out, want) {
			t.Errorf("shell output missing %q", want)
		}
	}
}

func TestShellFillsHeight(t *testing.T) {
	const h = 24
	out := render(NewShell(), 80, h)
	lines := strings.Count(out, "\n") + 1
	if lines != h {
		t.Errorf("expected %d rendered lines, got %d", h, lines)
	}
}

func TestTabSwitchHeading(t *testing.T) {
	m := NewShell()
	m.active = TabStats
	out := render(m, 80, 24)
	if !strings.Contains(out, "STATS") {
		t.Error("expected STATS heading when stats tab is active")
	}
}
