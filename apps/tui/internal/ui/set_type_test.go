package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func taggableLog() Log {
	l := NewLog(nil)
	l.load = loadIdle
	l.groups = []exGroup{{name: "Back Squat", sets: []setEntry{
		{weight: "60", reps: "8", done: true},
		{weight: "100", reps: "5", done: true},
	}}}
	l.gi, l.si, l.col = 0, 0, colReps
	return l
}

func pressLogKey(l Log, r rune) Log {
	next, _ := l.Update(tea.KeyPressMsg{Code: r})
	return next.(Log)
}

func TestSetTypeTogglesAndClears(t *testing.T) {
	l := pressLogKey(taggableLog(), 'w')
	if got := l.groups[0].sets[0].setType; got != "WARMUP" {
		t.Fatalf("w should tag the cursor set as WARMUP, got %q", got)
	}
	if l.groups[0].sets[1].setType != "" {
		t.Error("tagging one set must not touch its neighbour — the neighbour would drop out of stats")
	}

	// 같은 키를 다시 누르면 해제된다 — 잘못 단 태그를 되돌릴 방법이 있어야 한다.
	if got := pressLogKey(l, 'w').groups[0].sets[0].setType; got != "" {
		t.Errorf("pressing w again should clear the tag, got %q", got)
	}

	// 다른 타입 키는 교체한다(두 태그가 동시에 붙지 않는다).
	if got := pressLogKey(l, 'f').groups[0].sets[0].setType; got != "FAILURE" {
		t.Errorf("f should replace WARMUP with FAILURE, got %q", got)
	}
}

func TestSetTypeRendersBracketTag(t *testing.T) {
	l := pressLogKey(taggableLog(), 'w')
	l.si = 1
	l = pressLogKey(l, 'f')
	out := ansi.Strip(l.Body(60, 18))
	for _, want := range []string{"[W]", "[F]"} {
		if !strings.Contains(out, want) {
			t.Errorf("set body missing %q:\n%s", want, out)
		}
	}
}

func TestSetTypeUntaggedRowStaysQuiet(t *testing.T) {
	out := ansi.Strip(taggableLog().Body(60, 18))
	if strings.Contains(out, "[W]") || strings.Contains(out, "[F]") {
		t.Errorf("a working set must not render a tag:\n%s", out)
	}
}

// REF5는 로그된 세트가 처방과 정확히 일치해야 하고 스펙 §3.2가 의도적 실패를 금지한다.
// 태그를 받아도 저장에서 버려지므로 키 자체가 동작하면 안 된다.
func TestSetTypeIsInertDuringRef5(t *testing.T) {
	l := taggableLog()
	l.ref5 = &ref5SessionState{Phase: ref5Active}
	after := pressLogKey(l, 'w')
	if after.groups[0].sets[0].setType != "" {
		t.Error("REF5 sessions must not accept set-type tags")
	}
}

func TestWarmupIsExcludedFromProgressCount(t *testing.T) {
	l := pressLogKey(taggableLog(), 'w') // 1세트를 웜업으로
	if got := l.doneCount(); got != 1 {
		t.Errorf("done 세트는 둘이지만 하나가 웜업이라 진척도는 1이어야 한다, got %d", got)
	}
	// 실패는 수행한 세트다 — 진척도에 남는다.
	l.si = 1
	if got := pressLogKey(l, 'f').doneCount(); got != 1 {
		t.Errorf("실패 태그가 진척도를 바꾸면 안 된다, got %d", got)
	}
}

func TestWarmupRowHidesE1rm(t *testing.T) {
	// 통계에서 빠지는 값을 행에만 남기면 그 값이 집계에 반영되는 것처럼 읽힌다.
	before := ansi.Strip(taggableLog().Body(60, 18))
	if !strings.Contains(before, "e") {
		t.Fatalf("기준선: 작업 세트 행에 e1RM이 보여야 한다:\n%s", before)
	}
	tagged := ansi.Strip(pressLogKey(taggableLog(), 'w').Body(60, 18))
	lines := strings.Split(tagged, "\n")
	for _, line := range lines {
		if strings.Contains(line, "[W]") && strings.Contains(line, " e") {
			t.Errorf("웜업 행에 e1RM이 남아 있다: %q", line)
		}
	}
}
