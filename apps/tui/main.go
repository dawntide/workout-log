// Command ironlog is a rich terminal client for the workout-log app. It speaks
// to the existing HTTP API (TUI-first: no backend changes required).
package main

import (
	"fmt"
	"os"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/ui"
)

func main() {
	if _, err := tea.NewProgram(ui.NewShell()).Run(); err != nil {
		fmt.Fprintln(os.Stderr, "ironlog: error:", err)
		os.Exit(1)
	}
}
