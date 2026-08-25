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
	out := renderFrame(NewFrame(nil, nil), 60, 20)
	// boots into the today buffer auto-loading today's session: LOADING mode +
	// the loading line + statusline (buffer name) + hint globals
	for _, want := range []string{"운동", "LOADING", "불러오는 중", "today", "space", "이동"} {
		if !strings.Contains(out, want) {
			t.Errorf("frame missing %q:\n%s", want, out)
		}
	}
}

func TestFrameGotoMenu(t *testing.T) {
	f := NewFrame(nil, nil)
	f.overlay = overlayGoto
	out := renderFrame(f, 60, 20)
	for _, want := range []string{"이동", "stats", "history", "programs", "settings"} {
		if !strings.Contains(out, want) {
			t.Errorf("goto menu missing %q", want)
		}
	}
}

func TestFrameRunCommand(t *testing.T) {
	m, _ := NewFrame(nil, nil).runCommand("stats")
	if m.(Frame).active != vStats {
		t.Errorf("expected switch to stats, got active=%d", m.(Frame).active)
	}
	m2, _ := NewFrame(nil, nil).runCommand("zzz")
	if m2.(Frame).flash == "" {
		t.Error("expected a flash message on an unknown command")
	}
}

func TestFrameQuitCommand(t *testing.T) {
	if _, cmd := NewFrame(nil, nil).runCommand("q"); cmd == nil {
		t.Error("expected :q to return a quit command")
	}
}

func TestFrameLogoutCommand(t *testing.T) {
	if _, cmd := NewFrame(nil, nil).runCommand("logout"); cmd == nil {
		t.Error("expected :logout to return a command")
	}
}

func TestFramePickerFilter(t *testing.T) {
	f := NewFrame(nil, nil)
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
	m, _ := NewFrame(nil, nil).Update(openPickerMsg{prompt: "운동 ", tag: "exercise", items: []pickerItem{{label: "Squat", value: "Squat"}}})
	f := m.(Frame)
	if f.overlay != overlayPicker {
		t.Error("expected the picker overlay to open")
	}
	if f.picker.tag != "exercise" {
		t.Errorf("picker tag = %q, want exercise", f.picker.tag)
	}
}

func TestFrameHelp(t *testing.T) {
	f := NewFrame(nil, nil)
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
	f := NewFrame(nil, nil)
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
	out := renderFrame(NewFrame(nil, nil), 60, 20)
	if !strings.Contains(out, "키맵") {
		t.Errorf("global hints should surface the ? 키맵 entry:\n%s", out)
	}
}

// 파괴적 확인에서 **답하는 방법(y/n)이 먼저 잘리면 안 된다.**
//
// 종전에는 프롬프트와 힌트를 이어붙인 뒤 통째로 잘라서, 요약이 길면 힌트가 화면 밖으로
// 나갔다 — 프로덕션 규모 요약(plan·workoutLog·workoutSet)이면 w=80에서 이미 "아니오"가
// 사라져 있었고, 가져오기 요약에 재계산 태그가 붙으면서 w=100까지 번졌다. 이제 프롬프트를
// 먼저 줄여 오른쪽 앵커를 지킨다.
func TestConfirmLineKeepsAnswerHints(t *testing.T) {
	f := NewFrame(nil, nil)
	f.overlay = overlayConfirm
	f.confirmPrompt = "기존 데이터 삭제 후 가져옴 (plan 1 · workoutLog 65 · workoutSet 739 · " +
		recomputeTag + ")"

	for _, w := range []int{80, 100, 120} {
		out := renderFrame(f, w, 20)
		for _, want := range []string{"y", "예", "n", "아니오"} {
			if !strings.Contains(out, want) {
				t.Errorf("w=%d: 확인 힌트 %q가 잘렸다 — 답할 방법이 화면에 없다: %s", w, want, out)
			}
		}
	}

	// 프롬프트가 짧으면 종전처럼 전부 보인다(줄이기가 공짜로 켜지지 않는다).
	short := NewFrame(nil, nil)
	short.overlay = overlayConfirm
	short.confirmPrompt = "삭제할까요?"
	if out := renderFrame(short, 80, 20); !strings.Contains(out, "삭제할까요?") {
		t.Errorf("짧은 프롬프트가 잘렸다: %s", out)
	}
}
