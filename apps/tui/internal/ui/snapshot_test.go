package ui

import (
	"os"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

// TestSnapshot writes a plain-text (ANSI-stripped) render of the shell to the
// path in $IRONLOG_SNAPSHOT, for eyeballing layout without a TTY. Skipped
// unless that env var is set.
func TestSnapshot(t *testing.T) {
	out := os.Getenv("IRONLOG_SNAPSHOT")
	if out == "" {
		t.Skip("set IRONLOG_SNAPSHOT=<path> to dump a layout snapshot")
	}
	frame := ansi.Strip(render(NewShell(), 60, 18))
	if err := os.WriteFile(out, []byte(frame), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Logf("wrote snapshot to %s", out)
}
