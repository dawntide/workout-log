package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

func pickerHeader(t *testing.T, p picker, w int) string {
	t.Helper()
	out, _ := p.render(w, 12)
	return ansi.Strip(strings.SplitN(out, "\n", 2)[0])
}

// A pre-filled value must be readable in full. The REF5 start prompt hands the
// picker a 19-char timestamp; an 18-wide field scrolled the leading digit off
// and rendered "026-08-13 11:38:05", which reads as a corrupt date even though
// the stored value was correct.
func TestPickerShowsWholePrefilledValue(t *testing.T) {
	const value = "2026-08-13 11:38:05"
	p := newPicker("실제 시작 시각 ", "ref5-start-at", nil)
	p.setInitial(value)

	if got := p.input.Value(); got != value {
		t.Fatalf("stored value = %q, want %q", got, value)
	}
	header := pickerHeader(t, p, 80)
	if !strings.Contains(header, value) {
		t.Errorf("header hides part of the pre-filled value:\n%q", header)
	}
}

func TestPickerKeepsRestingWidthForShortValues(t *testing.T) {
	p := newPicker("오늘 체중 ", "bodyweight", nil)
	p.setInitial("75")
	if got := p.input.Width(); got != pickerInputWidth {
		t.Errorf("short value resized the field: width = %d, want %d", got, pickerInputWidth)
	}
	if header := pickerHeader(t, p, 80); !strings.Contains(header, "75") {
		t.Errorf("header missing value:\n%q", header)
	}
}

func TestPickerWithoutInitialIsUnchanged(t *testing.T) {
	p := newPicker(":", "", commandItems())
	p.setInitial("")
	if got := p.input.Value(); got != "" {
		t.Errorf("empty initial wrote a value: %q", got)
	}
	if got := p.input.Width(); got != pickerInputWidth {
		t.Errorf("empty initial resized the field: width = %d", got)
	}
}

// 넓힌 입력이 좁은 단말에서 패널 폭을 넘지 않아야 한다.
func TestPickerHeaderFitsNarrowTerminal(t *testing.T) {
	p := newPicker("실제 시작 시각 ", "ref5-start-at", nil)
	p.setInitial("2026-08-13 11:38:05")
	for _, w := range []int{24, 40, 80} {
		if got := ansi.StringWidth(pickerHeader(t, p, w)); got > w {
			t.Errorf("header width at w=%d is %d", w, got)
		}
	}
}
