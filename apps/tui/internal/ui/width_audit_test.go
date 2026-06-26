package ui

import (
	"strings"
	"testing"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

// TestWidthAuditNarrow guards every screen against horizontal overflow on a
// phone-width SSH terminal: no rendered line may exceed the terminal width.
// 40 is roughly the narrowest a phone in portrait reports; 60 is a comfortable
// desktop split. This is the cross-screen backstop for the login fix.
func TestWidthAuditNarrow(t *testing.T) {
	const h = 24
	for _, w := range []int{40, 46, 60} {
		cases := map[string]string{
			"login":     ansi.Strip(renderLogin(NewLogin(nil), w, h)),
			"today":     ansi.Strip(renderTodayScenario(w, h)),
			"stats":     ansi.Strip(renderStatsScenario(w, h, true)),
			"history":   ansi.Strip(renderHistoryScenario(w, h)),
			"programs":  ansi.Strip(renderProgramsScenario(w, h)),
			"settings":  ansi.Strip(renderSettingsScenario(w, h)),
			"exercises": ansi.Strip(renderExercisesScenario(w, h)),
			"goto":      ansi.Strip(renderGotoScenario(w, h)),
			"palette":   ansi.Strip(renderPaletteScenario(w, h)),
			"help":      ansi.Strip(renderHelpScenario(w, h)),
		}
		for name, out := range cases {
			max := 0
			var worst string
			for _, line := range strings.Split(out, "\n") {
				if cw := lipgloss.Width(line); cw > max {
					max, worst = cw, line
				}
			}
			if max > w {
				t.Errorf("w=%d %-9s max line %d > %d: %q", w, name, max, w, worst)
			}
		}
	}
}
