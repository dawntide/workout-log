package ui

import (
	"errors"
	"testing"
	"time"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

var errFake = errors.New("boom")

// memDraftStore is an in-memory draftStore for tests.
type memDraftStore struct {
	data   []byte
	clears int
}

func (m *memDraftStore) LoadDraft() ([]byte, error) { return m.data, nil }
func (m *memDraftStore) SaveDraft(b []byte) error {
	m.data = append([]byte(nil), b...)
	return nil
}
func (m *memDraftStore) ClearDraft() error {
	m.data = nil
	m.clears++
	return nil
}

type failingDraftStore struct {
	err    error
	saves  int
	clears int
}

func (f *failingDraftStore) LoadDraft() ([]byte, error) { return nil, nil }
func (f *failingDraftStore) SaveDraft([]byte) error {
	f.saves++
	return f.err
}
func (f *failingDraftStore) ClearDraft() error {
	f.clears++
	return f.err
}

func draftedLog(store draftStore) Log {
	l := NewLog(nil).withDrafts(store)
	l.groups = []exGroup{{
		name: "Back Squat", prev: "100×5", tgt: "102.5×5", blockTarget: "SQUAT", role: "MAIN",
		progressionTarget: "SQUAT", skipProgression: true,
		sets: []setEntry{
			{weight: "60", reps: "8", done: true, tgtReps: 5, restSeconds: 240, setType: "WARMUP"},
			{weight: "102.5", reps: "5", done: true, tgtReps: 5, restSeconds: 240},
			{weight: "102.5", reps: "", tgtReps: 5, restSeconds: 240},
		},
	}}
	l.planName, l.sessionKey, l.planID = "TB Operator", "C3W5D3", "plan-1"
	l.bodyweight = 75
	l.performedAt = time.Date(2026, 7, 6, 12, 0, 0, 0, time.UTC)
	l.editID = "log-1"
	return l
}

func TestDraftRoundTrip(t *testing.T) {
	store := &memDraftStore{}
	l := draftedLog(store)
	l.persistDraft()
	if store.data == nil {
		t.Fatal("expected a persisted draft")
	}

	d, ok := loadTodayDraft(store, time.Now())
	if !ok {
		t.Fatal("expected today's draft to load")
	}
	restored := NewLog(nil)
	restored.loadFromDraft(d)

	if len(restored.groups) != 1 || restored.groups[0].name != "Back Squat" {
		t.Fatalf("groups not restored: %+v", restored.groups)
	}
	g := restored.groups[0]
	if g.prev != "100×5" || g.tgt != "102.5×5" || g.blockTarget != "SQUAT" || g.role != "MAIN" {
		t.Errorf("group header fields lost: %+v", g)
	}
	if g.progressionKey != "" || g.progressionTarget != "SQUAT" || g.enforcePlannedReps || !g.skipProgression {
		t.Errorf("group progression fields lost: %+v", g)
	}
	if len(g.sets) != 3 || !g.sets[1].done || g.sets[1].weight != "102.5" || g.sets[2].tgtReps != 5 {
		t.Errorf("sets not restored faithfully: %+v", g.sets)
	}
	// 처방 휴식은 드래프트 왕복에서 보존돼야 한다. 이 리포에는 struct 필드를 리플렉션으로
	// 대조하는 테스트가 없어서, 새 필드는 이렇게 손으로 단언해야 회귀가 잡힌다.
	if g.sets[0].restSeconds != 240 || g.sets[1].restSeconds != 240 {
		t.Errorf("prescribed rest lost in draft round-trip: %+v", g.sets)
	}
	// 세트 타입도 마찬가지다. 작업 세트는 빈 문자열로 남아야 한다 — 태그가 아래 세트로
	// 번지면 그 세트가 통계에서 통째로 빠진다.
	if g.sets[0].setType != "WARMUP" || g.sets[1].setType != "" || g.sets[2].setType != "" {
		t.Errorf("set type lost or bled across sets in draft round-trip: %+v", g.sets)
	}
	if restored.editID != "log-1" || !restored.performedAt.Equal(l.performedAt) {
		t.Errorf("edit identity lost: editID=%q performedAt=%v", restored.editID, restored.performedAt)
	}
	if restored.planName != "TB Operator" || restored.sessionKey != "C3W5D3" || restored.planID != "plan-1" {
		t.Errorf("session header lost: %q %q %q", restored.planName, restored.sessionKey, restored.planID)
	}
	if restored.bodyweight != 75 {
		t.Errorf("bodyweight lost: %v", restored.bodyweight)
	}
	if restored.load != loadIdle || restored.status == "" {
		t.Errorf("expected idle load state with a restore notice, got %v %q", restored.load, restored.status)
	}
}

func TestDraftStaleDateIgnored(t *testing.T) {
	store := &memDraftStore{}
	l := draftedLog(store)
	l.editID = ""
	l.persistDraft()

	tomorrow := time.Now().Add(24 * time.Hour)
	if _, ok := loadTodayDraft(store, tomorrow); ok {
		t.Error("a draft from yesterday must not restore into a new day")
	}
}

func TestServerBoundDraftsSurviveMidnight(t *testing.T) {
	for _, tc := range []struct {
		name      string
		editID    string
		uncertain bool
	}{
		{name: "history edit", editID: "log-1"},
		{name: "unknown post outcome", uncertain: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := time.Date(2026, 7, 14, 23, 59, 0, 0, time.Local)
			store := &memDraftStore{}
			l := draftedLog(store)
			l.editID, l.saveUncertain = tc.editID, tc.uncertain
			draft := draftFromLog(&l, before)
			storeDraftForTest(t, store, draft)
			if _, ok := loadTodayDraft(store, before.Add(2*time.Minute)); !ok {
				t.Fatal("server-bound draft was dropped across midnight")
			}
		})
	}
}

func TestDraftCorruptIgnored(t *testing.T) {
	store := &memDraftStore{data: []byte("{not json")}
	if _, ok := loadTodayDraft(store, time.Now()); ok {
		t.Error("corrupt draft must be ignored")
	}
	if _, ok := loadTodayDraft(nil, time.Now()); ok {
		t.Error("nil store must yield no draft")
	}
}

func TestDraftEmptyBufferClears(t *testing.T) {
	store := &memDraftStore{}
	l := draftedLog(store)
	l.persistDraft()
	if store.data == nil {
		t.Fatal("expected a persisted draft")
	}
	l.groups = nil
	l.persistDraft()
	if store.data != nil {
		t.Error("persisting an empty buffer must clear the draft")
	}
}

func TestDraftClearedOnSaveSuccess(t *testing.T) {
	store := &memDraftStore{}
	l := draftedLog(store)
	l.persistDraft()

	scr, _ := l.Update(saveResultMsg{
		detail:      &api.LogDetail{ID: "log-1"},
		performedAt: time.Now(),
	})
	l2 := scr.(Log)
	if store.data != nil {
		t.Error("a successful save must clear the draft")
	}
	if l2.editID != "log-1" {
		t.Errorf("editID = %q, want log-1", l2.editID)
	}
}

func TestDraftKeptOnSaveFailure(t *testing.T) {
	store := &memDraftStore{}
	l := draftedLog(store)
	l.persistDraft()

	l.Update(saveResultMsg{err: errFake})
	if store.data == nil {
		t.Error("a failed save must keep the draft")
	}
}

func TestDraftRestoredMsgLoadsBuffer(t *testing.T) {
	store := &memDraftStore{}
	l := draftedLog(store)
	l.persistDraft()
	d, ok := loadTodayDraft(store, time.Now())
	if !ok {
		t.Fatal("expected draft")
	}

	scr, _ := NewLog(nil).Update(draftRestoredMsg{draft: d})
	l2 := scr.(Log)
	// done 세트는 둘이지만 하나가 웜업이라 진척도에는 하나만 잡힌다.
	if len(l2.groups) != 1 || l2.doneCount() != 1 {
		t.Fatalf("restore via Update failed: %+v", l2.groups)
	}
}

func TestClassifyBootDraft(t *testing.T) {
	todayLog := &api.LogItem{ID: "log-1"}
	cases := []struct {
		name     string
		hasDraft bool
		editID   string
		today    *api.LogItem
		listOK   bool
		want     draftBootAction
	}{
		{"no draft", false, "", todayLog, true, draftIgnore},
		{"draft edits the saved today-log", true, "log-1", todayLog, true, draftRestore},
		{"today-log saved elsewhere wins", true, "", todayLog, true, draftDrop},
		{"today-log saved elsewhere wins over mismatched edit", true, "log-9", todayLog, true, draftDrop},
		{"offline: restore untouched", true, "log-1", nil, false, draftRestore},
		{"dangling editId: restore as new", true, "log-9", nil, true, draftRestoreAsNew},
		{"fresh crash recovery", true, "", nil, true, draftRestore},
	}
	for _, c := range cases {
		if got := classifyBootDraft(c.hasDraft, c.editID, c.today, c.listOK); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
