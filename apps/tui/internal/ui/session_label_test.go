package ui

import (
	"testing"
	"time"
)

func TestSessionLabel(t *testing.T) {
	ref5At, err := time.Parse(time.RFC3339, "2026-07-14T09:30:00Z")
	if err != nil {
		t.Fatal(err)
	}
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
		"REF5:2026-07-14T09:30:00.000Z:start:event:1": "REF5 " + ref5At.Local().Format("01-02 15:04"),
	}
	for in, want := range cases {
		if got := sessionLabel(in); got != want {
			t.Errorf("sessionLabel(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSessionLabelInUsesPlanTimezoneForRef5Instant(t *testing.T) {
	seoul, err := time.LoadLocation("Asia/Seoul")
	if err != nil {
		t.Fatal(err)
	}
	key := "REF5:2026-07-14T16:30:00.000Z:start:event:timezone"
	if got, want := sessionLabelIn(key, seoul), "REF5 07-15 01:30"; got != want {
		t.Fatalf("sessionLabelIn = %q, want %q", got, want)
	}
	// Non-REF5 labels are calendar-independent and remain byte-for-byte stable.
	if got := sessionLabelIn("2026-07-14@C2W3D1", seoul); got != "C2W3D1" {
		t.Fatalf("cycle label changed in location-aware wrapper: %q", got)
	}
}
