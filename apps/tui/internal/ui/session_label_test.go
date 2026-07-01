package ui

import "testing"

func TestSessionLabel(t *testing.T) {
	cases := map[string]string{
		"C2W6D1":            "C2W6D1",  // cycle-wave
		"C10W3D2":           "C10W3D2", // multi-digit
		"W6D1":              "W6D1",    // wave (no cycle)
		"2026-06-26@C2W6D1": "C2W6D1",  // date-progression → drop date prefix
		"2026-06-26":        "",        // plain date → no cycle label
		" C1W1D1 ":          "C1W1D1",  // trimmed
		"":                  "",        // empty
		"garbage":           "",        // unparseable
		"C2W6":              "",        // partial (no day) → unparseable
	}
	for in, want := range cases {
		if got := sessionLabel(in); got != want {
			t.Errorf("sessionLabel(%q) = %q, want %q", in, got, want)
		}
	}
}
