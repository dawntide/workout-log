package ui

// log_model.go — 오늘 버퍼(Log)의 상태 타입·열거형과 프레임워크-무지 순수 헬퍼.
// (렌더링/Tea 커맨드/상태 변이와 분리 — god-component 분해 3단계.)

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

type logCol int

const (
	colWeight logCol = iota
	colReps
	colRPE
)

type editTarget int

const (
	editNone editTarget = iota
	editName
	editCell
)

// loadState tracks the boot-time auto-load of today's planned session, so the
// empty buffer can show "loading" / "no active plan" instead of a blank canvas.
type loadState int

const (
	loadIdle    loadState = iota // not auto-loading (manual entry, or load done)
	loadPending                  // fetching today's session
	loadNoPlan                   // no active plan — prompt to start a program
)

type setEntry struct {
	weight       string
	reps         string
	rpe          string // optional RPE 1–10
	done         bool
	tgtReps      int          // planned reps, shown dimmed as a placeholder while reps is empty
	total        float64      // bodyweight-inclusive total load (>0 only for bodyweight sets)
	amrap        bool         // generated AMRAP marker; serialized into engine meta
	prescribed   bool         // belongs to the generated session and must be accounted for
	isExtra      bool         // excluded from automatic progression
	setNumber    int          // generated prescription set number (REF5 immutable)
	originalMeta *api.SetMeta // generated/logged engine metadata, losslessly cloned on save
}

type exGroup struct {
	name               string
	prev               string // "100×5" previous performance (filled when a plan/session loads)
	tgt                string // target weight
	blockTarget        string // snapshot sourceBlockTarget (e.g. "SQUAT"); enables REPLACE_EXERCISE override
	role               string // MAIN | ASSIST | … (from the snapshot)
	progressionKey     string
	progressionTarget  string
	enforcePlannedReps bool
	sets               []setEntry
	ref5               *ref5ExerciseEntry // non-nil means name/load/set shape are immutable
}

func isSlottedProgressionKey(key string) bool {
	index := strings.LastIndex(strings.TrimSpace(key), "_s")
	if index < 0 || index+2 >= len(key) {
		return false
	}
	_, err := strconv.Atoi(key[index+2:])
	return err == nil
}

// undoSnapshot is the pre-delete buffer state restored by `u`. Today logging is
// a fast flow, so a delete is one keystroke (`d`) with one-level undo rather
// than a y/n confirm that would interrupt every set removal.
type undoSnapshot struct {
	groups []exGroup
	gi, si int
}

// cloneGroups deep-copies groups (each set slice too) so an undo snapshot is
// independent of later in-place mutation.
func cloneGroups(gs []exGroup) []exGroup {
	out := make([]exGroup, len(gs))
	for i, g := range gs {
		g.sets = append([]setEntry(nil), g.sets...)
		out[i] = g
	}
	return out
}

// parseAccessorySets parses a compact "NxR" / "NxR@W" spec into N sets of R reps
// at optional weight W. Blank or unparseable → a 3×10 default.
func parseAccessorySets(spec string) []api.OverrideSet {
	n, reps, weight := 3, 10, 0.0
	if s := strings.TrimSpace(spec); s != "" {
		body, w, hasW := strings.Cut(s, "@")
		if hasW {
			if v, err := strconv.ParseFloat(strings.TrimSpace(w), 64); err == nil && v >= 0 {
				weight = v
			}
		}
		ns, rs, ok := strings.Cut(strings.TrimSpace(body), "x")
		if !ok {
			ns, rs, ok = strings.Cut(strings.TrimSpace(body), "×")
		}
		if ok {
			if v, err := strconv.Atoi(strings.TrimSpace(ns)); err == nil && v > 0 {
				n = v
			}
			if v, err := strconv.Atoi(strings.TrimSpace(rs)); err == nil && v > 0 {
				reps = v
			}
		}
	}
	sets := make([]api.OverrideSet, n)
	for i := range sets {
		sets[i] = api.OverrideSet{Reps: reps, WeightKg: weight}
	}
	return sets
}

// planNameByID finds a plan's name by id (nil-safe); "" when not found.
func planNameByID(plans []api.Plan, id *string) string {
	if id == nil {
		return ""
	}
	for _, p := range plans {
		if p.ID == *id {
			return p.Name
		}
	}
	return ""
}

// sessionKeyOf returns a log's generated-session key, or "" when absent.
func sessionKeyOf(lg api.LogItem) string {
	if lg.GeneratedSession != nil {
		return lg.GeneratedSession.SessionKey
	}
	return ""
}

func strOr(s *string) string {
	if s != nil {
		return *s
	}
	return ""
}

// todaysLog returns the first log whose performedAt falls on now's local
// calendar day. Comparing local dates (rather than a server date= filter) keeps
// the day boundary in the user's timezone, so a UTC-stored evening log still
// counts as "today".
func todaysLog(logs []api.LogItem, now time.Time) (api.LogItem, bool) {
	today := now.Local().Format("2006-01-02")
	for _, lg := range logs {
		if lg.PerformedAt.Local().Format("2006-01-02") == today {
			return lg, true
		}
	}
	return api.LogItem{}, false
}

// buildPrevMap maps each exercise (lowercased) to its top set in the most
// recent session that contained it: "weight×reps".
func buildPrevMap(logs []api.LogItem) map[string]string {
	m := map[string]string{}
	for _, lg := range logs { // newest first
		top := map[string]api.LoggedSet{}
		topLoad := map[string]float64{}
		for _, st := range lg.Sets {
			n := strings.ToLower(strings.TrimSpace(st.ExerciseName))
			if n == "" {
				continue
			}
			load := loggedTotalLoad(st.ExerciseName, float64(st.WeightKg), st.Meta)
			if _, ok := top[n]; !ok || load > topLoad[n] {
				top[n], topLoad[n] = st, load
			}
		}
		for n := range top {
			if _, seen := m[n]; !seen {
				m[n] = fmt.Sprintf("%s×%d", trimNum(topLoad[n]), top[n].Reps)
			}
		}
	}
	return m
}

// --- helpers ---

func orDot(s string) string {
	if strings.TrimSpace(s) == "" {
		return "·"
	}
	return s
}

func rpeString(rpe *int) string {
	if rpe == nil || *rpe <= 0 {
		return ""
	}
	return strconv.Itoa(*rpe)
}

func setE1rm(s setEntry) float64 {
	reps, err := strconv.Atoi(strings.TrimSpace(s.reps))
	if err != nil || reps <= 0 {
		return 0
	}
	w := setLoad(s) // bodyweight-inclusive total for bodyweight lifts
	if w <= 0 {
		return 0
	}
	return w * (1 + float64(reps)/30.0) // Epley estimate (display only)
}

func validNum(s string) bool {
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return err == nil && v >= 0 && !math.IsNaN(v) && !math.IsInf(v, 0)
}

func validInt(s string) bool {
	v, err := strconv.Atoi(strings.TrimSpace(s))
	return err == nil && v >= 0
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	if n <= 1 {
		return string(r[:n])
	}
	return string(r[:n-1]) + "…"
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
