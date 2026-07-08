package ui

import (
	"encoding/json"
	"time"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// 2026-07-06 사고 재발 방지: today 버퍼의 미저장 세트는 메모리에만 있어 프로세스
// 재시작(tmux kill, 크래시, 배포 검증)과 함께 통째로 사라졌다. 사용자 입력이 생길
// 때마다 draft 파일로 스냅샷하고, 부팅 시 오늘 날짜의 draft를 복원한다.

// draftStore persists the today buffer across process restarts. config.Config
// implements it; nil disables persistence (unit tests, snapshot tests).
type draftStore interface {
	LoadDraft() ([]byte, error)
	SaveDraft([]byte) error
	ClearDraft() error
}

type draftSet struct {
	Weight  string  `json:"weight"`
	Reps    string  `json:"reps"`
	RPE     string  `json:"rpe,omitempty"`
	Done    bool    `json:"done"`
	TgtReps int     `json:"tgtReps,omitempty"`
	Total   float64 `json:"total,omitempty"`
}

type draftGroup struct {
	Name        string     `json:"name"`
	Prev        string     `json:"prev,omitempty"`
	Tgt         string     `json:"tgt,omitempty"`
	BlockTarget string     `json:"blockTarget,omitempty"`
	Role        string     `json:"role,omitempty"`
	Sets        []draftSet `json:"sets"`
}

// todayDraft is the serialized today buffer. Date is the local calendar day the
// draft belongs to — a stale draft is never restored into a new day.
type todayDraft struct {
	Date        string       `json:"date"`
	EditID      string       `json:"editId,omitempty"`
	PerformedAt time.Time    `json:"performedAt"`
	PlanName    string       `json:"planName,omitempty"`
	SessionKey  string       `json:"sessionKey,omitempty"`
	PlanID      string       `json:"planId,omitempty"`
	Bodyweight  float64      `json:"bodyweight,omitempty"`
	Groups      []draftGroup `json:"groups"`
}

// draftRestoredMsg carries a restored draft into the today buffer at boot.
type draftRestoredMsg struct{ draft todayDraft }

// draftFromLog snapshots the buffer for persistence.
func draftFromLog(l *Log, now time.Time) todayDraft {
	groups := make([]draftGroup, 0, len(l.groups))
	for _, g := range l.groups {
		sets := make([]draftSet, 0, len(g.sets))
		for _, s := range g.sets {
			sets = append(sets, draftSet{
				Weight: s.weight, Reps: s.reps, RPE: s.rpe,
				Done: s.done, TgtReps: s.tgtReps, Total: s.total,
			})
		}
		groups = append(groups, draftGroup{
			Name: g.name, Prev: g.prev, Tgt: g.tgt,
			BlockTarget: g.blockTarget, Role: g.role, Sets: sets,
		})
	}
	return todayDraft{
		Date:        now.Local().Format("2006-01-02"),
		EditID:      l.editID,
		PerformedAt: l.performedAt,
		PlanName:    l.planName,
		SessionKey:  l.sessionKey,
		PlanID:      l.planID,
		Bodyweight:  l.bodyweight,
		Groups:      groups,
	}
}

// persistDraft best-effort snapshots the buffer after a user mutation. An empty
// buffer clears the draft instead (deleting everything = no in-progress work).
// Failures are silent — correctness is owned by the save path, the draft is
// only a crash-recovery net.
func (l *Log) persistDraft() {
	if l.drafts == nil {
		return
	}
	if len(l.groups) == 0 {
		_ = l.drafts.ClearDraft()
		return
	}
	if b, err := json.Marshal(draftFromLog(l, time.Now())); err == nil {
		_ = l.drafts.SaveDraft(b)
	}
}

func (l *Log) clearDraft() {
	if l.drafts == nil {
		return
	}
	_ = l.drafts.ClearDraft()
}

// loadTodayDraft reads the persisted draft and validates it belongs to now's
// local day; missing/stale/corrupt drafts are ignored.
func loadTodayDraft(s draftStore, now time.Time) (todayDraft, bool) {
	if s == nil {
		return todayDraft{}, false
	}
	b, err := s.LoadDraft()
	if err != nil || len(b) == 0 {
		return todayDraft{}, false
	}
	var d todayDraft
	if json.Unmarshal(b, &d) != nil {
		return todayDraft{}, false
	}
	if d.Date != now.Local().Format("2006-01-02") || len(d.Groups) == 0 {
		return todayDraft{}, false
	}
	return d, true
}

// draftBootAction decides how a persisted draft interacts with the server's
// today-log at boot.
type draftBootAction int

const (
	draftIgnore       draftBootAction = iota // no usable draft
	draftRestore                             // restore as-is
	draftRestoreAsNew                        // restore, but save as a new log (editId cleared)
	draftDrop                                // discard — the server log wins
)

// classifyBootDraft: a draft editing the server's today-log is a superset of it
// (unsaved edits on top) → restore. A draft that doesn't match an existing
// today-log means the log was saved elsewhere (e.g. web) → drop, so restoring
// can't double-save the same workout. No server log + a dangling editId means
// the log was deleted server-side → restore as new. When the list call failed
// (offline) we can't know — restore untouched.
func classifyBootDraft(hasDraft bool, editID string, todayLog *api.LogItem, listOK bool) draftBootAction {
	switch {
	case !hasDraft:
		return draftIgnore
	case todayLog != nil && editID == todayLog.ID:
		return draftRestore
	case todayLog != nil:
		return draftDrop
	case !listOK:
		return draftRestore
	case editID != "":
		return draftRestoreAsNew
	default:
		return draftRestore
	}
}

// loadFromDraft replaces the buffer with a restored draft.
func (l *Log) loadFromDraft(d todayDraft) {
	groups := make([]exGroup, 0, len(d.Groups))
	for _, g := range d.Groups {
		sets := make([]setEntry, 0, len(g.Sets))
		for _, s := range g.Sets {
			sets = append(sets, setEntry{
				weight: s.Weight, reps: s.Reps, rpe: s.RPE,
				done: s.Done, tgtReps: s.TgtReps, total: s.Total,
			})
		}
		groups = append(groups, exGroup{
			name: g.Name, prev: g.Prev, tgt: g.Tgt,
			blockTarget: g.BlockTarget, role: g.Role, sets: sets,
		})
	}
	l.groups, l.gi, l.si, l.col = groups, 0, 0, colWeight
	l.editing, l.target = false, editNone
	l.editID, l.performedAt = d.EditID, d.PerformedAt
	l.planName, l.sessionKey, l.planID = d.PlanName, d.SessionKey, d.PlanID
	if d.Bodyweight > 0 {
		l.bodyweight = d.Bodyweight
	}
	l.load, l.undo = loadIdle, nil
	l.status, l.statusErr = theme.GlyphDone+" 미저장 기록 복원됨 — 확인 후 s로 저장", false
}
