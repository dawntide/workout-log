package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func renderFrame(f Frame, w, h int) string {
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return ansi.Strip(nf.(Frame).View().Content)
}

func TestFrameBootsToday(t *testing.T) {
	out := renderFrame(NewFrame(nil), 60, 20)
	// boots into the today buffer auto-loading today's session: LOADING mode +
	// the loading line + statusline (buffer name) + hint globals
	for _, want := range []string{"운동", "LOADING", "불러오는 중", "today", "space", "이동"} {
		if !strings.Contains(out, want) {
			t.Errorf("frame missing %q:\n%s", want, out)
		}
	}
}

func TestFrameGotoMenu(t *testing.T) {
	f := NewFrame(nil)
	f.overlay = overlayGoto
	out := renderFrame(f, 60, 20)
	for _, want := range []string{"이동", "stats", "history", "programs", "settings"} {
		if !strings.Contains(out, want) {
			t.Errorf("goto menu missing %q", want)
		}
	}
}

func TestFrameRunCommand(t *testing.T) {
	m, _ := NewFrame(nil).runCommand("stats")
	if m.(Frame).active != vStats {
		t.Errorf("expected switch to stats, got active=%d", m.(Frame).active)
	}
	m2, _ := NewFrame(nil).runCommand("zzz")
	if m2.(Frame).flash == "" {
		t.Error("expected a flash message on an unknown command")
	}
}

func TestFrameQuitCommand(t *testing.T) {
	if _, cmd := NewFrame(nil).runCommand("q"); cmd == nil {
		t.Error("expected :q to return a quit command")
	}
}

func TestFrameLogoutCommand(t *testing.T) {
	if _, cmd := NewFrame(nil).runCommand("logout"); cmd == nil {
		t.Error("expected :logout to return a command")
	}
}

func TestFramePickerFilter(t *testing.T) {
	f := NewFrame(nil)
	f.picker = newPicker(":", "", commandItems())
	f.overlay = overlayPicker
	f.picker.input.SetValue("st")
	found := false
	for _, it := range f.picker.filtered() {
		if it.value == "stats" {
			found = true
		}
	}
	if !found {
		t.Error("expected 'stats' to survive the 'st' filter")
	}
	if !strings.Contains(renderFrame(f, 60, 20), "stats") {
		t.Error("command palette render missing stats")
	}
}

func TestFrameOpenPicker(t *testing.T) {
	m, _ := NewFrame(nil).Update(openPickerMsg{prompt: "운동 ", tag: "exercise", items: []pickerItem{{label: "Squat", value: "Squat"}}})
	f := m.(Frame)
	if f.overlay != overlayPicker {
		t.Error("expected the picker overlay to open")
	}
	if f.picker.tag != "exercise" {
		t.Errorf("picker tag = %q, want exercise", f.picker.tag)
	}
}

func TestFrameHelp(t *testing.T) {
	f := NewFrame(nil)
	f.overlay = overlayHelp
	out := renderFrame(f, 60, 36)
	// every buffer's keymap + the common ("어디서나") layer is documented
	for _, want := range []string{"TODAY", "어디서나", "STATS", "HISTORY", "PROGRAMS", "EXERCISES", "SETTINGS", "닫기"} {
		if !strings.Contains(out, want) {
			t.Errorf("help overlay missing %q", want)
		}
	}
}

func TestFrameHelpContextFirst(t *testing.T) {
	f := NewFrame(nil)
	f.active = vStats
	f.overlay = overlayHelp
	out := renderFrame(f, 60, 36)
	if !strings.Contains(out, "현재 화면") {
		t.Error("help should mark the active buffer as 현재 화면")
	}
	// the active buffer (STATS) is surfaced before others (TODAY) — context-first
	if si, ti := strings.Index(out, "STATS"), strings.Index(out, "TODAY"); si < 0 || ti < 0 || si > ti {
		t.Errorf("active STATS should precede TODAY (context-first): stats@%d today@%d", si, ti)
	}
}

func TestFrameGlobalHintsShowKeymapEntry(t *testing.T) {
	// the ? keymap entry is always in the bottom global hints, so the full
	// keymap is discoverable without already knowing the key
	out := renderFrame(NewFrame(nil), 60, 20)
	if !strings.Contains(out, "키맵") {
		t.Errorf("global hints should surface the ? 키맵 entry:\n%s", out)
	}
}
