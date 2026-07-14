package ui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func sampleLog() Log {
	l := NewLog(nil)
	l.groups = []exGroup{{name: "Squat", sets: []setEntry{
		{weight: "100", reps: "5", done: true},
		{weight: "102.5", reps: "5", done: true},
		{weight: "105", reps: ""},
	}}}
	l.gi, l.si, l.col = 0, 2, colWeight
	return l
}

func TestLogCompleteSet(t *testing.T) {
	l := sampleLog()
	l.groups[0].sets[2].weight, l.groups[0].sets[2].reps = "105", "5"
	l.col = colReps
	l2, _ := l.completeSet()
	if !l2.groups[0].sets[2].done {
		t.Fatal("expected the set to be marked done")
	}
	if len(l2.groups[0].sets) != 3 {
		t.Errorf("completeSet must not append a set (sets are added only via addSet/\"o\"); got %d", len(l2.groups[0].sets))
	}
}

func TestLogCompleteRejectsBad(t *testing.T) {
	l := NewLog(nil)
	l.groups = []exGroup{{name: "Squat", sets: []setEntry{{weight: "x", reps: "0"}}}}
	l2, cmd := l.completeSet()
	if l2.groups[0].sets[0].done || cmd != nil || !l2.statusErr {
		t.Error("expected rejection of bad input")
	}
}

func TestLogSaveNeedsDone(t *testing.T) {
	l2, cmd := NewLog(nil).save()
	if cmd != nil || l2.status == "" || !l2.statusErr {
		t.Error("expected save rejection with no completed sets")
	}
}

func TestLogSaveCollects(t *testing.T) {
	l2, cmd := sampleLog().save()
	if cmd == nil || !l2.saving {
		t.Fatal("expected a save command")
	}
	if got := l2.StatusRight(); got != "2 sets" {
		t.Errorf("StatusRight = %q, want 2 sets", got)
	}
}

func TestLogLoadForEdit(t *testing.T) {
	scr, _ := NewLog(nil).Update(editLogMsg{
		id:          "log-9",
		performedAt: time.Date(2026, 6, 20, 0, 0, 0, 0, time.UTC),
		sets: []api.LoggedSet{
			{ExerciseName: "Squat", WeightKg: 100, Reps: 5},
			{ExerciseName: "Squat", WeightKg: 102.5, Reps: 5},
			{ExerciseName: "Bench", WeightKg: 80, Reps: 8},
		},
	})
	l := scr.(Log)
	if l.editID != "log-9" {
		t.Errorf("editID = %q, want log-9", l.editID)
	}
	if len(l.groups) != 2 || len(l.groups[0].sets) != 2 {
		t.Fatalf("groups grouping wrong: %d groups, first has %d sets", len(l.groups), len(l.groups[0].sets))
	}
	if l.doneCount() != 3 {
		t.Errorf("doneCount = %d, want 3 (all loaded sets done)", l.doneCount())
	}
	out := ansi.Strip(l.Body(58, 16))
	if !strings.Contains(out, "편집 중") || !strings.Contains(out, "2026-06-20") {
		t.Errorf("edit banner missing:\n%s", out)
	}
}

func TestLogRPECell(t *testing.T) {
	l := NewLog(nil)
	l.groups = []exGroup{{name: "Squat", sets: []setEntry{{weight: "100", reps: "5"}}}}
	l.gi, l.si, l.col = 0, 0, colRPE
	l, _ = l.beginEdit(editCell)
	l.edit.SetValue("8")
	l.writeEdit()
	if l.groups[0].sets[0].rpe != "8" {
		t.Errorf("rpe = %q, want 8", l.groups[0].sets[0].rpe)
	}
}

func TestLogLoadForEditRPE(t *testing.T) {
	rpe := 8
	scr, _ := NewLog(nil).Update(editLogMsg{
		id:          "x",
		performedAt: time.Date(2026, 6, 20, 0, 0, 0, 0, time.UTC),
		sets:        []api.LoggedSet{{ExerciseName: "Squat", WeightKg: 100, Reps: 5, RPE: &rpe}},
	})
	l := scr.(Log)
	if got := l.groups[0].sets[0].rpe; got != "8" {
		t.Errorf("rpe not restored on edit load: %q, want 8", got)
	}
}

func TestLogEditSaveKeepsSession(t *testing.T) {
	l := NewLog(nil)
	l.saving, l.editID = true, "log-9"
	l.groups = []exGroup{{name: "Squat", sets: []setEntry{
		{weight: "100", reps: "5", done: true},
		{weight: "100", reps: "5"}, // not done — dropped by keepDoneOnly
	}}}
	scr, _ := l.Update(saveResultMsg{edited: true, detail: &api.LogDetail{ID: "log-9"}})
	l = scr.(Log)
	if l.saving {
		t.Error("saving should clear")
	}
	if !strings.Contains(l.status, "수정됨") {
		t.Errorf("status = %q, want 수정됨", l.status)
	}
	if l.editID != "log-9" {
		t.Error("editID should persist after save so re-saving PATCHes the same log")
	}
	if len(l.groups) != 1 || len(l.groups[0].sets) != 1 {
		t.Fatalf("saved session should keep only the 1 done set on screen, got %+v", l.groups)
	}
}

func TestLogModeTransitions(t *testing.T) {
	l := NewLog(nil)
	if l.Mode().Label != "LOADING" {
		t.Errorf("want LOADING at boot, got %q", l.Mode().Label)
	}
	l.load = loadIdle // past the boot auto-load
	if l.Mode().Label != "NORMAL" {
		t.Errorf("want NORMAL, got %q", l.Mode().Label)
	}
	l.editing = true
	if l.Mode().Label != "INSERT" {
		t.Errorf("want INSERT, got %q", l.Mode().Label)
	}
	l.editing = false
}

func TestLogBodyGrouped(t *testing.T) {
	out := ansi.Strip(sampleLog().Body(50, 16))
	for _, want := range []string{"SQUAT", "100", "102.5", "×"} {
		if !strings.Contains(out, want) {
			t.Errorf("grouped body missing %q:\n%s", want, out)
		}
	}
}

func TestLogContext(t *testing.T) {
	if got := sampleLog().Context(); got != "Squat 3/3" {
		t.Errorf("Context = %q, want Squat 3/3", got)
	}
}

func TestLogLoadSnapshot(t *testing.T) {
	l := NewLog(nil)
	l.loadSnapshot(&api.SessionSnapshot{
		Exercises: []api.PlannedExercise{
			{ExerciseName: "Squat", Role: "MAIN", Sets: []api.PlannedSet{
				{Reps: 5, TargetWeightKg: 100}, {Reps: 5, TargetWeightKg: 100}, {Reps: 5, TargetWeightKg: 102.5},
			}},
			{ExerciseName: "Bench Press", Role: "MAIN", Sets: []api.PlannedSet{{Reps: 5, TargetWeightKg: 70}}},
		},
	}, map[string]string{"squat": "100×5"})
	if len(l.groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(l.groups))
	}
	if l.groups[0].name != "Squat" || len(l.groups[0].sets) != 3 {
		t.Errorf("unexpected squat group: %+v", l.groups[0])
	}
	if l.groups[0].sets[0].weight != "100" {
		t.Errorf("expected pre-filled target weight 100, got %q", l.groups[0].sets[0].weight)
	}
	if l.groups[0].tgt != "102.5×5" {
		t.Errorf("tgt = %q, want 102.5×5", l.groups[0].tgt)
	}
	if l.groups[0].prev != "100×5" {
		t.Errorf("prev = %q, want 100×5", l.groups[0].prev)
	}
}

func TestLogRepsPlaceholder(t *testing.T) {
	l := NewLog(nil)
	l.loadSnapshot(&api.SessionSnapshot{
		Exercises: []api.PlannedExercise{
			{ExerciseName: "Squat", Sets: []api.PlannedSet{{Reps: 5, TargetWeightKg: 100}}},
		},
	}, nil)
	if got := l.groups[0].sets[0].tgtReps; got != 5 {
		t.Fatalf("tgtReps not stored from the plan: %d, want 5", got)
	}
	// an empty, unfocused reps cell shows the target as a dim placeholder
	if cell := ansi.Strip(l.repsCell(false, l.groups[0].sets[0])); !strings.Contains(cell, "5") {
		t.Errorf("empty reps cell should show target 5 as placeholder, got %q", cell)
	}
	// once a value is entered, the actual value shows (not the placeholder)
	if typed := ansi.Strip(l.repsCell(false, setEntry{reps: "3", tgtReps: 5})); !strings.Contains(typed, "3") {
		t.Errorf("entered reps should show the actual value, got %q", typed)
	}
}

func TestBuildPrevMap(t *testing.T) {
	m := buildPrevMap([]api.LogItem{
		{Sets: []api.LoggedSet{{ExerciseName: "Squat", WeightKg: 102.5, Reps: 5}, {ExerciseName: "Squat", WeightKg: 100, Reps: 5}}},
		{Sets: []api.LoggedSet{{ExerciseName: "Squat", WeightKg: 90, Reps: 5}}}, // older, ignored
	})
	if m["squat"] != "102.5×5" {
		t.Errorf("prev squat = %q, want 102.5×5 (top set of most recent)", m["squat"])
	}
}

func TestLogExercisePicked(t *testing.T) {
	start := NewLog(nil)
	start.load = loadIdle
	next, cmd := start.Update(pickedMsg{tag: "exercise", value: "Squat"})
	l := next.(Log)
	if len(l.groups) != 1 || l.groups[0].name != "Squat" {
		t.Fatalf("expected a Squat group, got %+v", l.groups)
	}
	if !l.editing || l.col != colWeight {
		t.Error("expected to be editing the weight cell after picking")
	}
	if cmd == nil {
		t.Error("expected a focus command")
	}
}

func TestLogBootShowsLoading(t *testing.T) {
	// NewLog starts in loadPending so the first paint is a loading line, not the
	// manual-entry hint, while autoloadCmd resolves today's session.
	out := ansi.Strip(NewLog(nil).Body(58, 16))
	if !strings.Contains(out, "불러오는 중") {
		t.Errorf("boot body should show the loading line:\n%s", out)
	}
}

func TestLogAutoloadNoPlan(t *testing.T) {
	scr, _ := NewLog(nil).Update(sessionLoadedMsg{noPlan: true})
	l := scr.(Log)
	if l.load != loadNoPlan {
		t.Fatalf("load = %d, want loadNoPlan", l.load)
	}
	out := ansi.Strip(l.Body(58, 16))
	for _, want := range []string{"활성 플랜이 없습니다", "프로그램"} {
		if !strings.Contains(out, want) {
			t.Errorf("no-plan body missing %q:\n%s", want, out)
		}
	}
}

func TestLogAutoloadSession(t *testing.T) {
	scr, _ := NewLog(nil).Update(sessionLoadedMsg{snapshot: &api.SessionSnapshot{
		Exercises: []api.PlannedExercise{
			{ExerciseName: "Squat", Role: "MAIN", Sets: []api.PlannedSet{{Reps: 5, TargetWeightKg: 100}}},
		},
	}})
	l := scr.(Log)
	if l.load != loadIdle {
		t.Errorf("load = %d, want loadIdle after a session loads", l.load)
	}
	if len(l.groups) != 1 || l.groups[0].name != "Squat" {
		t.Fatalf("expected a Squat group from the auto-loaded session, got %+v", l.groups)
	}
}

func TestLogUndoDelete(t *testing.T) {
	l := sampleLog() // Squat, 3 sets, cursor on the 3rd (105)
	l2, _ := l.deleteSet()
	if len(l2.groups[0].sets) != 2 {
		t.Fatalf("after delete want 2 sets, got %d", len(l2.groups[0].sets))
	}
	if l2.undo == nil {
		t.Fatal("delete should record an undo snapshot")
	}
	l3, _ := l2.undoDelete()
	if len(l3.groups[0].sets) != 3 {
		t.Fatalf("after undo want 3 sets restored, got %d", len(l3.groups[0].sets))
	}
	if l3.groups[0].sets[2].weight != "105" {
		t.Errorf("restored top set weight = %q, want 105", l3.groups[0].sets[2].weight)
	}
	if l3.undo != nil {
		t.Error("undo should be consumed after a restore")
	}
}

func TestLogUndoRestoresRemovedGroup(t *testing.T) {
	l := NewLog(nil)
	l.load = loadIdle
	l.groups = []exGroup{{name: "Squat", sets: []setEntry{{weight: "100", reps: "5", done: true}}}}
	l2, _ := l.deleteSet() // deleting the only set removes the whole group
	if len(l2.groups) != 0 {
		t.Fatalf("want 0 groups after deleting the last set, got %d", len(l2.groups))
	}
	l3, _ := l2.undoDelete()
	if len(l3.groups) != 1 || l3.groups[0].name != "Squat" {
		t.Fatalf("undo should restore the removed group, got %+v", l3.groups)
	}
}

func TestTodaysLog(t *testing.T) {
	loc := time.Local
	now := time.Date(2026, 6, 26, 14, 0, 0, 0, loc)
	logs := []api.LogItem{
		{ID: "yesterday", PerformedAt: time.Date(2026, 6, 25, 14, 0, 0, 0, loc)},
		{ID: "today", PerformedAt: time.Date(2026, 6, 26, 8, 0, 0, 0, loc)},
	}
	if lg, ok := todaysLog(logs, now); !ok || lg.ID != "today" {
		t.Fatalf("want today's log, got id=%q ok=%v", lg.ID, ok)
	}
	if _, ok := todaysLog(logs[:1], now); ok {
		t.Error("a yesterday-only list should not match today")
	}
}

func TestTodaysLogConvertsUTC(t *testing.T) {
	// a log stored in UTC still counts as today once converted to local time —
	// this is the timezone-correctness the .Local() comparison buys.
	now := time.Date(2026, 6, 26, 14, 0, 0, 0, time.Local)
	utcStored := now.Add(-1 * time.Hour).UTC()
	logs := []api.LogItem{{ID: "t", PerformedAt: utcStored}}
	if lg, ok := todaysLog(logs, now); !ok || lg.ID != "t" {
		t.Fatalf("UTC-stored log 1h ago should match today after .Local(), got ok=%v", ok)
	}
}

func TestLogAddExerciseKeyAliases(t *testing.T) {
	// e (exercise) and n (new) both open the exercise picker — n matches the
	// create-key used by programs/exercises buffers.
	for _, code := range []rune{'e', 'n'} {
		l := NewLog(nil)
		l.load = loadIdle
		_, cmd := l.updateNormal(tea.KeyPressMsg{Code: code})
		if cmd == nil {
			t.Errorf("key %q should open the exercise picker", string(code))
		}
	}
}

// TestLogCompleteAdvancesFocus verifies reps-completion moves the cursor to the
// next set (crossing exercise boundaries), and stays put on the very last set.
func TestLogCompleteAdvancesFocus(t *testing.T) {
	l := NewLog(nil)
	l.groups = []exGroup{
		{name: "Squat", sets: []setEntry{{weight: "100", reps: "5"}, {weight: "100", reps: ""}}},
		{name: "Bench", sets: []setEntry{{weight: "80", reps: ""}}},
	}

	// 1) 같은 운동의 다음 세트로 전진.
	l.gi, l.si, l.col = 0, 0, colReps
	l2, _ := l.completeSet()
	if l2.gi != 0 || l2.si != 1 || l2.col != colWeight {
		t.Fatalf("expected focus at (0,1,weight); got (%d,%d,%v)", l2.gi, l2.si, l2.col)
	}

	// 2) 운동 마지막 세트 완료 → 다음 운동 첫 세트로 전진.
	l2.groups[0].sets[1].reps = "5"
	l2.col = colReps
	l3, _ := l2.completeSet()
	if l3.gi != 1 || l3.si != 0 {
		t.Fatalf("expected focus at next exercise (1,0); got (%d,%d)", l3.gi, l3.si)
	}

	// 3) 전체 마지막 세트 완료 → 제자리 유지.
	l3.groups[1].sets[0].reps = "8"
	l3.col = colReps
	l4, _ := l3.completeSet()
	if l4.gi != 1 || l4.si != 0 {
		t.Fatalf("expected focus to stay at (1,0); got (%d,%d)", l4.gi, l4.si)
	}
	if !l4.groups[1].sets[0].done {
		t.Fatal("last set should still be marked done")
	}
}
