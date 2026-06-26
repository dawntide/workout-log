package ui

import (
	"encoding/json"
	"os"
	"strconv"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func atoiOr(s string, d int) int {
	if n, err := strconv.Atoi(s); err == nil && n > 0 {
		return n
	}
	return d
}

// TestSnapshot writes a plain-text (ANSI-stripped) render to $IRONLOG_SNAPSHOT
// for eyeballing layout without a TTY. IRONLOG_SNAPSHOT_TARGET selects the view:
// today | goto | (default) login. Skipped without the env var.
func TestSnapshot(t *testing.T) {
	out := os.Getenv("IRONLOG_SNAPSHOT")
	if out == "" {
		t.Skip("set IRONLOG_SNAPSHOT=<path> to dump a layout snapshot")
	}
	w := atoiOr(os.Getenv("IRONLOG_SNAPSHOT_W"), 60)
	h := atoiOr(os.Getenv("IRONLOG_SNAPSHOT_H"), 18)
	var frame string
	switch os.Getenv("IRONLOG_SNAPSHOT_TARGET") {
	case "today", "log":
		frame = ansi.Strip(renderTodayScenario(w, h))
	case "today-long":
		f := NewFrame(nil)
		f.views[vToday] = sampleLongLog()
		nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
		frame = ansi.Strip(nf.(Frame).View().Content)
	case "goto":
		frame = ansi.Strip(renderGotoScenario(w, h))
	case "palette":
		frame = ansi.Strip(renderPaletteScenario(w, h))
	case "help":
		frame = ansi.Strip(renderHelpScenario(w, h))
	case "stats":
		frame = ansi.Strip(renderStatsScenario(w, h, true))
	case "stats-block":
		frame = ansi.Strip(renderStatsScenario(w, h, false))
	case "history":
		frame = ansi.Strip(renderHistoryScenario(w, h))
	case "programs":
		frame = ansi.Strip(renderProgramsScenario(w, h))
	case "settings":
		frame = ansi.Strip(renderSettingsScenario(w, h))
	case "exercises":
		frame = ansi.Strip(renderExercisesScenario(w, h))
	case "programs-empty":
		frame = ansi.Strip(renderProgramsEmptyScenario(w, h))
	case "store":
		frame = ansi.Strip(renderStoreScenario(w, h))
	default:
		frame = ansi.Strip(renderLogin(NewLogin(nil), w, h))
	}
	if err := os.WriteFile(out, []byte(frame), 0o644); err != nil {
		t.Fatal(err)
	}
}

func sampleTodayFrame() Frame {
	f := NewFrame(nil)
	l := f.views[vToday].(Log)
	l.groups = []exGroup{
		{name: "Squat", prev: "100×5", tgt: "102.5", sets: []setEntry{
			{weight: "100", reps: "5", done: true},
			{weight: "102.5", reps: "5", done: true},
			{weight: "105", reps: ""},
		}},
		{name: "Bench Press", prev: "70×5", sets: []setEntry{{}}},
	}
	l.gi, l.si, l.col = 0, 2, colReps
	l.rest = restState{active: true, remaining: 48, total: 90}
	f.views[vToday] = l
	return f
}

func renderTodayScenario(w, h int) string {
	nf, _ := sampleTodayFrame().Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}

func renderGotoScenario(w, h int) string {
	f := sampleTodayFrame()
	f.overlay = overlayGoto
	f.gotoSel = int(vStats)
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}

func renderPaletteScenario(w, h int) string {
	f := sampleTodayFrame()
	f.picker = newPicker(":", "", commandItems())
	f.picker.input.SetValue("s")
	f.overlay = overlayPicker
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}

func renderHelpScenario(w, h int) string {
	f := sampleTodayFrame()
	f.overlay = overlayHelp
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}

func sampleStats() Stats {
	st := NewStats(nil)
	st.bundle = &api.StatsBundle{Sessions30d: 12, Tonnage30d: 124000, Prs90d: []api.PrItem{{ExerciseName: "Squat", Improvement: 18}}}
	st.bundle.Prs90d[0].Best.E1rm = 142
	st.e1rm = &api.E1rmResult{Exercise: "Squat"}
	for _, v := range []float64{100, 102, 105, 108, 112, 115, 118, 122, 128, 132, 138, 142} {
		st.e1rm.Series = append(st.e1rm.Series, api.E1rmPoint{E1rm: api.Float64(v)})
	}
	return st
}

func renderStatsScenario(w, h int, braille bool) string {
	f := NewFrame(nil)
	st := sampleStats()
	st.braille = braille
	f.views[vStats] = st
	f.active = vStats
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}

func renderHistoryScenario(w, h int) string {
	f := NewFrame(nil)
	hi := NewHistory(nil)
	hi.loaded = true
	now := time.Now()
	hi.build([]api.LogItem{
		{ID: "1", PerformedAt: now, Sets: []api.LoggedSet{{ExerciseName: "Squat", WeightKg: 102.5, Reps: 5}, {ExerciseName: "Bench Press", WeightKg: 70, Reps: 5}}},
		{ID: "2", PerformedAt: now.AddDate(0, 0, -2), Sets: []api.LoggedSet{{ExerciseName: "Deadlift", WeightKg: 140, Reps: 3}}},
		{ID: "3", PerformedAt: now.AddDate(0, 0, -4), Sets: []api.LoggedSet{{ExerciseName: "Squat", WeightKg: 100, Reps: 5}, {ExerciseName: "OHP", WeightKg: 50, Reps: 5}}},
	})
	f.views[vHistory] = hi
	f.active = vHistory
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}

func renderProgramsScenario(w, h int) string {
	f := NewFrame(nil)
	pr := NewPrograms(nil)
	pr.loaded = true
	pr.plans = []api.Plan{
		{ID: "1", Name: "5/3/1", Type: "SINGLE", BaseProgramName: "5/3/1 BBB"},
		{ID: "2", Name: "Starting Strength", Type: "SINGLE", BaseProgramName: "SS"},
		{ID: "3", Name: "PPL", Type: "COMPOSITE"},
	}
	pr.activeID = "1"
	f.views[vPrograms] = pr
	f.active = vPrograms
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}

func renderProgramsEmptyScenario(w, h int) string {
	f := NewFrame(nil)
	pr := NewPrograms(nil)
	pr.loaded = true
	pr.plans = nil
	f.views[vPrograms] = pr
	f.active = vPrograms
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}

func renderStoreScenario(w, h int) string {
	f := NewFrame(nil)
	f.active = vPrograms
	names := []string{
		"Asymptote Protocol (Base)", "Greyskull LP (Base)", "GZCLP (Base T1/T2/T3)",
		"Jim Wendler 5/3/1 (No Assistance)", "Jim Wendler 5/3/1 + BBB", "Jim Wendler 5/3/1 + FSL",
		"Starting Strength", "Texas Method", "nSuns 5/3/1 LP", "PHUL", "PHAT", "Madcow 5x5",
		"Smolov Jr", "GZCL Method",
	}
	items := make([]pickerItem, len(names))
	for i, n := range names {
		items[i] = pickerItem{label: n, desc: "logic", value: n}
	}
	f.picker = newPicker("프로그램 스토어 ", "template", items)
	f.picker.sel = len(items) - 1 // selection at the bottom → exercises the window
	f.overlay = overlayPicker
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}

func renderExercisesScenario(w, h int) string {
	f := NewFrame(nil)
	f.views[vExercises] = sampleExercises()
	f.active = vExercises
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}

func renderSettingsScenario(w, h int) string {
	f := NewFrame(nil)
	st := NewSettings(nil)
	st.loaded = true
	st.values = map[string]json.RawMessage{
		"prefs.locale":                 json.RawMessage(`"ko"`),
		"prefs.trainingGoal.primary":   json.RawMessage(`"strength"`),
		"prefs.bodyweight.kg":          json.RawMessage(`82.5`),
		"prefs.minimumPlate.defaultKg": json.RawMessage(`2.5`),
	}
	f.views[vSettings] = st
	f.active = vSettings
	nf, _ := f.Update(tea.WindowSizeMsg{Width: w, Height: h})
	return nf.(Frame).View().Content
}
