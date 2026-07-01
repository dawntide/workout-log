package ui

import (
	"strings"
	"testing"
)

func TestParseAccessorySets(t *testing.T) {
	cases := []struct {
		in      string
		n, reps int
		w       float64
	}{
		{"3x10", 3, 10, 0},
		{"4x8@20", 4, 8, 20},
		{"3×10", 3, 10, 0}, // unicode ×
		{"5x5@100.5", 5, 5, 100.5},
		{"", 3, 10, 0},        // blank → default
		{"garbage", 3, 10, 0}, // unparseable → default
	}
	for _, c := range cases {
		sets := parseAccessorySets(c.in)
		if len(sets) != c.n {
			t.Errorf("%q: n=%d, want %d", c.in, len(sets), c.n)
			continue
		}
		if sets[0].Reps != c.reps || sets[0].WeightKg != c.w {
			t.Errorf("%q: set0=%+v, want reps=%d w=%v", c.in, sets[0], c.reps, c.w)
		}
	}
}

func hasHintKey(items []hintItem, key string) bool {
	for _, it := range items {
		if it.key == key {
			return true
		}
	}
	return false
}

func TestLogOverrideHintsAndGuards(t *testing.T) {
	l := NewLog(nil)
	l.load = loadIdle

	// off a plan session: hints hidden, actions guarded
	if hasHintKey(l.Hints(), "a") {
		t.Error("보강 hint should be hidden off a plan session")
	}
	if l2, _ := l.beginAccessory(); !strings.Contains(l2.status, "플랜 세션") {
		t.Errorf("beginAccessory off-plan should warn, got %q", l2.status)
	}

	// on a plan session: hints shown
	l.planID, l.sessionKey = "p1", "C2W6D1"
	if !hasHintKey(l.Hints(), "a") || !hasHintKey(l.Hints(), "c") {
		t.Error("보강/교체 hints should show on a plan session")
	}

	// 교체 needs a MAIN group with a block target
	l.groups = []exGroup{{name: "Back Squat", role: "MAIN", blockTarget: "SQUAT", sets: []setEntry{{}}}}
	l.gi = 0
	if _, cmd := l.beginReplace(); cmd == nil {
		t.Error("beginReplace on a MAIN group should open the picker")
	}
	l.groups = []exGroup{{name: "Dips", role: "ASSIST", sets: []setEntry{{}}}}
	if l3, _ := l.beginReplace(); !strings.Contains(l3.status, "메인") {
		t.Errorf("beginReplace on a non-MAIN group should warn, got %q", l3.status)
	}
}
