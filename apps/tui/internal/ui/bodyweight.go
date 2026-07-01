package ui

import (
	"math"
	"strconv"
	"strings"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

// Bodyweight load handling, mirroring web/src/lib/bodyweight-load.ts.
//
// For bodyweight exercises (pull-up/chin-up) the program prescribes a
// bodyweight-INCLUSIVE total load (snapshot targetWeightKg), but a log stores
// only the EXTERNAL added weight in weightKg plus meta.totalLoadKg. The TUI
// keeps the editable weight as the external added weight and the bodyweight-
// inclusive total in setEntry.total, so display shows "{total} (+{added})".

// isBodyweightExercise reports whether the exercise name is a bodyweight lift.
func isBodyweightExercise(name string) bool {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" {
		return false
	}
	for _, kw := range []string{"pull-up", "pull up", "chin-up", "chin up", "풀업", "친업"} {
		if strings.Contains(n, kw) {
			return true
		}
	}
	return false
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

// bwExternalFromTotal converts a prescribed total load (bodyweight-inclusive) to
// the external added weight the log holds: max(0, total-bw). bw<=0 → 0 (mirrors
// prescriptionToExternalLoadKg: avoid seeding an inflated value as external).
func bwExternalFromTotal(total, bw float64) float64 {
	if bw <= 0 {
		return 0
	}
	if e := total - bw; e > 0 {
		return round2(e)
	}
	return 0
}

// loggedTotalLoad resolves a logged set's bodyweight-inclusive total load
// (web resolveLoggedTotalLoadKg): bodyweight ex → meta.totalLoadKg when present,
// else the stored weightKg; non-bodyweight → weightKg.
func loggedTotalLoad(name string, weightKg float64, meta *api.SetMeta) float64 {
	if !isBodyweightExercise(name) {
		return weightKg
	}
	if meta != nil && float64(meta.TotalLoadKg) > 0 {
		return round2(float64(meta.TotalLoadKg))
	}
	return weightKg
}

// setLoad is the effective load for e1RM/volume: the bodyweight-inclusive total
// when known (total>0), else the raw entered weight.
func setLoad(s setEntry) float64 {
	if s.total > 0 {
		return s.total
	}
	w, _ := strconv.ParseFloat(strings.TrimSpace(s.weight), 64)
	return w
}

// addedSuffix is the bracketed added-weight label appended after a bodyweight
// set's total (web bodyweightAddedSuffix): "(+20)" when added>0, else "(체중)".
func addedSuffix(addedKg float64) string {
	if addedKg > 0 {
		return "(+" + trimNum(round2(addedKg)) + ")"
	}
	return "(체중)"
}
