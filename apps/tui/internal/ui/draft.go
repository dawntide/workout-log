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
	Weight       string       `json:"weight"`
	Reps         string       `json:"reps"`
	RPE          string       `json:"rpe,omitempty"`
	Done         bool         `json:"done"`
	TgtReps      int          `json:"tgtReps,omitempty"`
	Total        float64      `json:"total,omitempty"`
	Amrap        bool         `json:"amrap,omitempty"`
	Prescribed   bool         `json:"prescribed,omitempty"`
	IsExtra      bool         `json:"isExtra,omitempty"`
	SetNumber    int          `json:"setNumber,omitempty"`
	OriginalMeta *api.SetMeta `json:"originalMeta,omitempty"`
}

type draftGroup struct {
	Name               string             `json:"name"`
	Prev               string             `json:"prev,omitempty"`
	Tgt                string             `json:"tgt,omitempty"`
	BlockTarget        string             `json:"blockTarget,omitempty"`
	Role               string             `json:"role,omitempty"`
	ProgressionKey     string             `json:"progressionKey,omitempty"`
	ProgressionTarget  string             `json:"progressionTarget,omitempty"`
	EnforcePlannedReps bool               `json:"enforcePlannedReps,omitempty"`
	Sets               []draftSet         `json:"sets"`
	Ref5               *ref5ExerciseEntry `json:"ref5,omitempty"`
}

type draftRef5State struct {
	Plan              api.Plan              `json:"plan"`
	Start             ref5StartValues       `json:"start"`
	Session           *api.GeneratedSession `json:"session"`
	CompletionEventID string                `json:"completionEventId"`
	StartPending      bool                  `json:"startPending,omitempty"`
}

// todayDraft is the serialized today buffer. Date is the local calendar day the
// draft belongs to — a stale draft is never restored into a new day.
type todayDraft struct {
	UserID             string          `json:"userId,omitempty"`
	Date               string          `json:"date"`
	EditID             string          `json:"editId,omitempty"`
	PerformedAt        time.Time       `json:"performedAt"`
	PlanName           string          `json:"planName,omitempty"`
	SessionKey         string          `json:"sessionKey,omitempty"`
	PlanID             string          `json:"planId,omitempty"`
	GeneratedSessionID string          `json:"generatedSessionId,omitempty"`
	ClientMutationID   string          `json:"clientMutationId,omitempty"`
	SaveUncertain      bool            `json:"saveUncertain,omitempty"`
	Bodyweight         float64         `json:"bodyweight,omitempty"`
	Groups             []draftGroup    `json:"groups"`
	Ref5               *draftRef5State `json:"ref5,omitempty"`
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
				Amrap: s.amrap, Prescribed: s.prescribed, IsExtra: s.isExtra,
				SetNumber: s.setNumber, OriginalMeta: cloneSetMetaIfPresent(s.originalMeta),
			})
		}
		groups = append(groups, draftGroup{
			Name: g.name, Prev: g.prev, Tgt: g.tgt,
			BlockTarget: g.blockTarget, Role: g.role, Sets: sets, Ref5: g.ref5,
			ProgressionKey: g.progressionKey, ProgressionTarget: g.progressionTarget,
			EnforcePlannedReps: g.enforcePlannedReps,
		})
	}
	draft := todayDraft{
		UserID:             l.ownerID,
		Date:               now.Local().Format("2006-01-02"),
		EditID:             l.editID,
		PerformedAt:        l.performedAt,
		PlanName:           l.planName,
		SessionKey:         l.sessionKey,
		PlanID:             l.planID,
		GeneratedSessionID: l.generatedSessionID,
		ClientMutationID:   l.clientMutationID,
		SaveUncertain:      l.saveUncertain,
		Bodyweight:         l.bodyweight,
		Groups:             groups,
	}
	if l.ref5 != nil && (l.ref5.Session != nil || l.ref5.StartUncertain) {
		draft.Ref5 = &draftRef5State{
			Plan: l.ref5.Plan, Start: l.ref5.Start, Session: l.ref5.Session,
			CompletionEventID: l.ref5.CompletionEventID,
			StartPending:      l.ref5.Session == nil && l.ref5.StartUncertain,
		}
	}
	return draft
}

// persistDraft snapshots the buffer after a user mutation. Most interactive
// callers intentionally treat this as best effort, but a command that is about
// to issue a non-idempotent write must check the returned error before allowing
// any network I/O.
func (l *Log) persistDraft() error {
	if l.ref5 == nil {
		l.genericDirty = len(l.groups) > 0
	}
	if l.drafts == nil {
		return nil
	}
	startPending := l.ref5 != nil && l.ref5.Session == nil && l.ref5.StartUncertain
	if len(l.groups) == 0 && !startPending {
		return l.drafts.ClearDraft()
	}
	b, err := json.Marshal(draftFromLog(l, time.Now()))
	if err != nil {
		return err
	}
	return l.drafts.SaveDraft(b)
}

func (l *Log) clearDraft() {
	if l.drafts == nil {
		return
	}
	_ = l.drafts.ClearDraft()
}

// loadTodayDraft reads the persisted draft and validates it belongs to now's
// local day; missing/stale/corrupt drafts are ignored.
func loadTodayDraft(s draftStore, now time.Time, ownerIDs ...string) (todayDraft, bool) {
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
	ownerID := ""
	if len(ownerIDs) > 0 {
		ownerID = ownerIDs[0]
	}
	// Production always supplies the authenticated user id. Unowned legacy
	// drafts and another account's draft stay on disk but are never rendered or
	// submitted under the current account.
	if ownerID != "" && d.UserID != ownerID {
		return todayDraft{}, false
	}
	// Ordinary ad-hoc drafts belong to one local calendar day. Server-bound work
	// (a started REF5 session, an exact PATCH target, or an outcome-unknown POST)
	// may legitimately cross midnight and must retain its identity until the
	// server state is reconciled or the user explicitly discards it.
	ref5Started := d.Ref5 != nil && d.Ref5.Session != nil && d.Ref5.Session.ID != ""
	ref5StartPending := d.Ref5 != nil && d.Ref5.StartPending && d.Ref5.Session == nil
	sessionBound := ref5Started || ref5StartPending || d.EditID != "" || d.SaveUncertain
	if (!sessionBound && d.Date != now.Local().Format("2006-01-02")) ||
		(len(d.Groups) == 0 && !ref5StartPending) {
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
	l.ref5 = nil
	groups := make([]exGroup, 0, len(d.Groups))
	for _, g := range d.Groups {
		sets := make([]setEntry, 0, len(g.Sets))
		for _, s := range g.Sets {
			sets = append(sets, setEntry{
				weight: s.Weight, reps: s.Reps, rpe: s.RPE,
				done: s.Done, tgtReps: s.TgtReps, total: s.Total, amrap: s.Amrap,
				prescribed: s.Prescribed, isExtra: s.IsExtra,
				setNumber: s.SetNumber, originalMeta: cloneSetMetaIfPresent(s.OriginalMeta),
			})
		}
		groups = append(groups, exGroup{
			name: g.Name, prev: g.Prev, tgt: g.Tgt,
			blockTarget: g.BlockTarget, role: g.Role, sets: sets, ref5: g.Ref5,
			progressionKey: g.ProgressionKey, progressionTarget: g.ProgressionTarget,
			enforcePlannedReps: g.EnforcePlannedReps,
		})
	}
	l.groups, l.gi, l.si, l.col = groups, 0, 0, colWeight
	l.editing, l.target = false, editNone
	l.editID, l.performedAt = d.EditID, d.PerformedAt
	l.planName, l.sessionKey, l.planID = d.PlanName, d.SessionKey, d.PlanID
	l.generatedSessionID = d.GeneratedSessionID
	l.clientMutationID = d.ClientMutationID
	l.saveUncertain = d.SaveUncertain
	if d.Ref5 != nil && d.Ref5.Session != nil {
		l.ref5 = &ref5SessionState{
			Phase: ref5Active, Plan: d.Ref5.Plan, Start: d.Ref5.Start,
			Session: d.Ref5.Session, CompletionEventID: d.Ref5.CompletionEventID,
			Dirty: true,
		}
		l.col = colReps
	} else if d.Ref5 != nil && d.Ref5.StartPending && d.Ref5.Start.valid() {
		l.ref5 = &ref5SessionState{
			Phase: ref5Starting, Plan: d.Ref5.Plan, Start: d.Ref5.Start,
			StartUncertain: true,
		}
		l.status, l.statusErr = "REF5 시작 결과 확인 필요 · s로 동일 사건 재시도", true
	}
	if d.Bodyweight > 0 {
		l.bodyweight = d.Bodyweight
	}
	l.load, l.undo = loadIdle, nil
	l.genericDirty = l.ref5 == nil
	if l.ref5 == nil || l.ref5.active() {
		l.status, l.statusErr = theme.GlyphDone+" 미저장 기록 복원됨 — 확인 후 s로 저장", false
	}
}
