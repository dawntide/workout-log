package ui

import (
	"strconv"
	"strings"
	"testing"
	"time"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

// sampleLongLog is a today buffer with more exercises than fit a short phone
// viewport, the cursor parked deep in the third exercise.
func sampleLongLog() Log {
	l := NewLog(nil)
	for _, n := range []string{"Back Squat", "Pull-Up", "Bench Press", "Deadlift", "Overhead Press", "Barbell Row"} {
		l.groups = append(l.groups, exGroup{name: n, sets: []setEntry{
			{weight: "100", reps: "5", done: true},
			{weight: "100", reps: "5", done: true},
			{weight: "100", reps: "5"},
		}})
	}
	l.load = loadIdle
	l.gi, l.si, l.col = 2, 2, colWeight
	l.planName, l.sessionKey = "5/3/1 Leader", "C2W6D1"
	return l
}

// TestFooterKeepsGlobalsWhenNarrow guards the bottom hint bar: on a phone-narrow
// terminal the global keys (space/?) must survive. The old code joined the bar
// into one line and hard-truncated the right edge, dropping exactly those keys.
func TestFooterKeepsGlobalsWhenNarrow(t *testing.T) {
	const w, h = 40, 24
	screens := map[ViewKind]string{
		vToday: "today", vStats: "stats", vHistory: "history",
		vPrograms: "programs", vSettings: "settings", vExercises: "exercises",
	}
	for vk, name := range screens {
		f := NewFrame(nil)
		f.active = vk
		out := renderFrame(f, w, h)
		for _, want := range []string{"space", "?"} {
			if !strings.Contains(out, want) {
				t.Errorf("%s: footer dropped global %q at w=%d:\n%s", name, want, w, out)
			}
		}
		for _, line := range strings.Split(out, "\n") {
			if cw := lipgloss.Width(line); cw > w {
				t.Errorf("%s: line overflows w=%d (%d cols): %q", name, w, cw, line)
			}
		}
	}
}

// TestTodayViewportKeepsFooter is the vertical analogue: with more exercises
// than fit, the today body must window (not overflow) so the frame's hint bar
// and mode line stay on screen, the active exercise stays visible, and the
// clipped rows are signaled with an overflow marker.
func TestTodayViewportKeepsFooter(t *testing.T) {
	f := NewFrame(nil)
	f.views[vToday] = sampleLongLog()
	const w, h = 58, 22
	out := renderFrame(f, w, h)

	if rows := strings.Count(out, "\n") + 1; rows > h {
		t.Fatalf("frame is %d rows > h=%d — footer would be clipped:\n%s", rows, h, out)
	}
	for _, want := range []string{"space", "NORMAL", "BENCH PRESS"} {
		if !strings.Contains(out, want) {
			t.Errorf("today frame missing %q (viewport clipped it):\n%s", want, out)
		}
	}
	if !strings.Contains(out, "↑") && !strings.Contains(out, "↓") {
		t.Errorf("expected an overflow marker (↑/↓) when groups exceed the viewport:\n%s", out)
	}
}

// TestStatuslineKeepsClockWhenNarrow guards the mode/status line: on a narrow
// width the clock (right edge) must survive — the old code right-truncated the
// whole line and cut the time first.
func TestStatuslineKeepsClockWhenNarrow(t *testing.T) {
	f := NewFrame(nil)
	f.views[vToday] = sampleLongLog() // long context "Bench Press 3/3" + "12 sets"
	f.now = time.Date(2026, 1, 2, 7, 42, 0, 0, time.UTC)
	const w, h = 40, 22
	out := renderFrame(f, w, h)
	if !strings.Contains(out, "07:42") {
		t.Errorf("clock dropped at w=%d — statusline truncated the time:\n%s", w, out)
	}
	for _, line := range strings.Split(out, "\n") {
		if cw := lipgloss.Width(line); cw > w {
			t.Errorf("line overflows w=%d (%d cols): %q", w, cw, line)
		}
	}
}

// TestPickerWindowsToSelection guards the shared picker (program store, exercise
// add, command palette): when the catalog is longer than the visible rows, the
// selected item must stay on screen with an overflow marker — the old code only
// rendered the first N items, so navigating past them lost the cursor entirely.
func TestPickerWindowsToSelection(t *testing.T) {
	items := make([]pickerItem, 20)
	for i := range items {
		items[i] = pickerItem{label: "PROG-" + strconv.Itoa(i), value: strconv.Itoa(i)}
	}
	p := newPicker("프로그램 스토어 ", "template", items)
	p.sel = 18 // near the end — beyond the old 6-row hard cap
	const w, h = 50, 16
	out, n := p.render(w, h)
	stripped := ansi.Strip(out)
	if !strings.Contains(stripped, "PROG-18") {
		t.Errorf("selected PROG-18 not visible in picker:\n%s", stripped)
	}
	if !strings.Contains(stripped, "↑") {
		t.Errorf("expected an up-overflow marker when sel is near the end:\n%s", stripped)
	}
	for _, line := range strings.Split(stripped, "\n") {
		if cw := lipgloss.Width(line); cw > w {
			t.Errorf("picker line overflows w=%d (%d cols): %q", w, cw, line)
		}
	}
	if lines := strings.Count(stripped, "\n") + 1; n != lines {
		t.Errorf("reported height %d != actual %d lines", n, lines)
	}
}

// TestWindowLinesCentersActive verifies the windowing keeps the active line on
// screen and never replaces it with an overflow marker.
func TestWindowLinesCentersActive(t *testing.T) {
	lines := make([]string, 30)
	for i := range lines {
		lines[i] = "L" + strings.Repeat("x", i%3)
	}
	for _, active := range []int{0, 5, 15, 29} {
		lines[active] = "ACTIVE"
		out := windowLines(lines, active, 10)
		if len(out) != 10 {
			t.Fatalf("active=%d: window len %d, want 10", active, len(out))
		}
		joined := strings.Join(out, "\n")
		if !strings.Contains(joined, "ACTIVE") {
			t.Errorf("active=%d: active line scrolled off:\n%s", active, joined)
		}
		lines[active] = "L"
	}
}
