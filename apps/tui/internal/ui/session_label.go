package ui

import (
	"regexp"
	"strings"
)

// sessionKey formats, mirroring web/src/lib/session-key.ts.
var (
	reCycleWave = regexp.MustCompile(`^C(\d+)W(\d+)D(\d+)$`)
	reDateProg  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}@C(\d+)W(\d+)D(\d+)$`)
	reWave      = regexp.MustCompile(`^W(\d+)D(\d+)$`)
)

// sessionLabel turns a generatedSession sessionKey into the compact cycle label
// shown on today/history, mirroring the web workout-log screen:
//   - "C2W6D1" for cycle-wave keys ("C2W6D1") and date-progression keys
//     ("2026-06-26@C2W6D1") — the date prefix is dropped
//   - "W6D1" for wave keys ("W6D1")
//   - "" for plain-date ("2026-06-26") or unparseable keys (no cycle label)
func sessionLabel(key string) string {
	key = strings.TrimSpace(key)
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
