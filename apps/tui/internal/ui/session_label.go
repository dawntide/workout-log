package ui

import (
	"regexp"
	"strings"
	"time"
)

// sessionKey formats, mirroring web/src/lib/session-key.ts.
var (
	reCycleWave = regexp.MustCompile(`^C(\d+)W(\d+)D(\d+)$`)
	reDateProg  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}@C(\d+)W(\d+)D(\d+)$`)
	reWave      = regexp.MustCompile(`^W(\d+)D(\d+)$`)
	// REF5 keys embed the immutable RFC3339 start instant before the start
	// event id. The event id itself may contain colons, so match the timestamp
	// grammar instead of splitting on ':'.
	reRef5 = regexp.MustCompile(`^REF5:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})):`)
)

// sessionLabel turns a generatedSession sessionKey into the compact cycle label
// shown on today/history, mirroring the web workout-log screen:
//   - "C2W6D1" for cycle-wave keys ("C2W6D1") and date-progression keys
//     ("2026-06-26@C2W6D1") — the date prefix is dropped
//   - "W6D1" for wave keys ("W6D1")
//   - "" for plain-date ("2026-06-26") or unparseable keys (no cycle label)
func sessionLabel(key string) string {
	return sessionLabelIn(key, time.Local)
}

// sessionLabelIn is the location-aware form used by history. REF5 session
// keys carry an absolute start instant, while the date shown to the user must
// follow the owning plan's calendar timezone rather than the machine/UTC date.
// A nil location deliberately falls back to the process-local zone so generic
// and legacy callers keep their existing behavior.
func sessionLabelIn(key string, location *time.Location) string {
	key = strings.TrimSpace(key)
	if m := reRef5.FindStringSubmatch(key); m != nil {
		if startedAt, err := time.Parse(time.RFC3339Nano, m[1]); err == nil {
			if location == nil {
				location = time.Local
			}
			return "REF5 " + startedAt.In(location).Format("01-02 15:04")
		}
	}
	if m := reCycleWave.FindStringSubmatch(key); m != nil {
		return "C" + m[1] + "W" + m[2] + "D" + m[3]
	}
	if m := reDateProg.FindStringSubmatch(key); m != nil {
		return "C" + m[1] + "W" + m[2] + "D" + m[3]
	}
	if m := reWave.FindStringSubmatch(key); m != nil {
		return "W" + m[1] + "D" + m[2]
	}
	return ""
}
