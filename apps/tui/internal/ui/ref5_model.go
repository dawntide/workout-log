package ui

// ref5_model.go — REF5의 터미널 전용 상태와 순수 판정 헬퍼.
//
// REF5는 일반 workout editor의 변형이 아니다. 서버가 첫 스쿼트 시작 시
// 처방을 동결하고, TUI는 그 뒤 실제 reps와 운동별 종료 사유만 기록한다.

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

type ref5Phase int

const (
	ref5Off ref5Phase = iota
	ref5Decide
	ref5Previewing
	ref5PreviewReady
	ref5Starting
	ref5Active
)

const (
	ref5ReasonNormal   = "NORMAL"
	ref5ReasonSlowdown = "CLEAR_SLOWDOWN"
	ref5ReasonForce    = "FORCE_OR_TECHNIQUE"
	ref5ReasonSafety   = "SAFETY"
	ref5ReasonExternal = "EXTERNAL"
)

var ref5Reasons = []string{
	ref5ReasonNormal,
	ref5ReasonSlowdown,
	ref5ReasonForce,
	ref5ReasonSafety,
	ref5ReasonExternal,
}

type ref5StartValues struct {
	ActualStartAt string  `json:"actualStartAt"`
	BodyweightKg  float64 `json:"bodyweightKg"`
	ManualMicro   bool    `json:"manualMicro"`
	StartEventID  string  `json:"startEventId"`
}

func (v ref5StartValues) valid() bool {
	_, err := time.Parse(time.RFC3339Nano, v.ActualStartAt)
	return err == nil && v.BodyweightKg > 0 && v.BodyweightKg <= 500 && strings.TrimSpace(v.StartEventID) != ""
}

func (v ref5StartValues) signature() string {
	b, _ := json.Marshal(v)
	return string(b)
}

type ref5ExerciseEntry struct {
	PrescriptionID    string         `json:"prescriptionId"`
	Lift              string         `json:"lift"`
	Role              string         `json:"role"`
	Stream            string         `json:"stream"`
	Prescription      map[string]any `json:"prescription"`
	TerminationReason string         `json:"terminationReason,omitempty"`
}

type ref5SessionState struct {
	Phase                ref5Phase
	Plan                 api.Plan
	Start                ref5StartValues
	StartUncertain       bool // persisted start may have committed; only exact retry is safe
	StartRequestInFlight bool // ephemeral guard for the currently running exact retry
	Preview              *api.GeneratedSession
	PreviewSignature     string
	Session              *api.GeneratedSession
	CompletionEventID    string
	Resume               map[string]api.GeneratedSession
	PendingSessionID     string
	Dirty                bool // unsaved reps/reason edits on an existing log
}

func newRef5StartState(plan api.Plan, bodyweight float64, now time.Time) *ref5SessionState {
	return &ref5SessionState{
		Phase: ref5Decide,
		Plan:  plan,
		Start: ref5StartValues{
			ActualStartAt: now.UTC().Format(time.RFC3339Nano),
			BodyweightKg:  bodyweight,
			StartEventID:  newTUIEventID(),
		},
	}
}

func newTUIEventID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err == nil {
		return "tui-" + hex.EncodeToString(b[:])
	}
	return fmt.Sprintf("tui-%d", time.Now().UnixNano())
}

func (r *ref5SessionState) previewCurrent() bool {
	return r != nil && r.Preview != nil && r.PreviewSignature == r.Start.signature()
}

func (r *ref5SessionState) active() bool {
	return r != nil && r.Phase == ref5Active && r.Session != nil
}

// ref5PlanLocation is the calendar boundary that owns every REF5 decision.
// The server defaults legacy plans to UTC; new TUI plans always persist an
// explicit IANA timezone, while invalid/missing historical values fall back to
// the terminal's local zone for a predictable display.
func ref5PlanLocation(plan api.Plan) *time.Location {
	if timezone, ok := plan.Params["timezone"].(string); ok {
		if location, err := time.LoadLocation(strings.TrimSpace(timezone)); err == nil {
			return location
		}
	}
	return time.Local
}

func ref5SessionLocation(session *api.GeneratedSession) *time.Location {
	if session != nil {
		timezone := strings.TrimSpace(session.Snapshot.Timezone)
		if timezone == "" && session.Snapshot.Ref5 != nil {
			timezone = strings.TrimSpace(session.Snapshot.Ref5.Timezone)
		}
		if location, err := time.LoadLocation(timezone); err == nil {
			return location
		}
	}
	return time.Local
}

func ref5ReasonValid(reason string) bool {
	for _, candidate := range ref5Reasons {
		if reason == candidate {
			return true
		}
	}
	return false
}

// ref5Outcome is the UI projection of the authoritative core classifier. The
// server repeats this validation against the immutable generated snapshot.
func ref5Outcome(g exGroup) (string, error) {
	if g.ref5 == nil || !ref5ReasonValid(g.ref5.TerminationReason) {
		return "", fmt.Errorf("종료 사유 필요")
	}
	deficit := 0
	for _, set := range g.sets {
		if !set.done || strings.TrimSpace(set.reps) == "" {
			return "", fmt.Errorf("모든 reps 필요")
		}
		reps, err := strconv.Atoi(strings.TrimSpace(set.reps))
		if err != nil || reps < 0 || reps > set.tgtReps {
			return "", fmt.Errorf("reps는 0..%d", set.tgtReps)
		}
		deficit += set.tgtReps - reps
	}
	reason := g.ref5.TerminationReason
	if reason == ref5ReasonNormal && deficit > 0 {
		return "", fmt.Errorf("NORMAL은 전 reps 완료 필요")
	}
	if reason == ref5ReasonForce && deficit == 0 {
		return "", fmt.Errorf("FORCE_OR_TECHNIQUE는 미달 reps 필요")
	}
	switch {
	case reason == ref5ReasonSafety || reason == ref5ReasonExternal:
		return "INVALID", nil
	case reason == ref5ReasonNormal:
		return "PASS", nil
	case deficit == 1 || (deficit == 0 && reason == ref5ReasonSlowdown):
		return "HOLD", nil
	default:
		return "FAIL", nil
	}
}

func validRef5Reps(raw string, planned int) bool {
	v, err := strconv.Atoi(strings.TrimSpace(raw))
	return err == nil && v >= 0 && v <= planned
}

func cloneSetMeta(meta *api.SetMeta) *api.SetMeta {
	if meta == nil {
		return &api.SetMeta{}
	}
	b, err := json.Marshal(meta)
	if err != nil {
		return &api.SetMeta{}
	}
	var out api.SetMeta
	if json.Unmarshal(b, &out) != nil {
		return &api.SetMeta{}
	}
	return &out
}

func cloneSetMetaIfPresent(meta *api.SetMeta) *api.SetMeta {
	if meta == nil {
		return nil
	}
	return cloneSetMeta(meta)
}

func openJSON(value any) map[string]any {
	b, err := json.Marshal(value)
	if err != nil {
		return map[string]any{}
	}
	var out map[string]any
	if json.Unmarshal(b, &out) != nil || out == nil {
		return map[string]any{}
	}
	return out
}

func anyString(m map[string]any, key string) string {
	value, _ := m[key].(string)
	return strings.TrimSpace(value)
}

func anyStrings(value any) []string {
	values, _ := value.([]any)
	out := make([]string, 0, len(values))
	for _, item := range values {
		if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, strings.TrimSpace(s))
		}
	}
	return out
}

func ref5PreviewDecision(s *api.GeneratedSession) (mode, squat, focus string, reasons []string) {
	if s == nil {
		return "", "", "", nil
	}
	mode = s.Snapshot.SessionType
	root := openJSON(s.Snapshot.Ref5)
	decision, _ := root["decision"].(map[string]any)
	if mode == "" {
		mode = anyString(decision, "sessionType")
	}
	squat = anyString(decision, "squatPrescription")
	focus = anyString(decision, "focus")
	reasons = anyStrings(decision["microReasons"])
	return mode, squat, focus, reasons
}

func ref5ResumeLabel(session api.GeneratedSession) string {
	mode, squat, focus, _ := ref5PreviewDecision(&session)
	started := session.Snapshot.ActualStartAt
	if started == "" && session.Snapshot.Ref5 != nil {
		started = anyString(openJSON(session.Snapshot.Ref5), "actualStartAt")
	}
	clock := "--:--"
	if at, err := time.Parse(time.RFC3339Nano, started); err == nil {
		clock = at.In(ref5SessionLocation(&session)).Format("01-02 15:04")
	}
	parts := []string{clock, mode}
	if squat != "" {
		parts = append(parts, "SQ "+squat)
	}
	if focus != "" {
		parts = append(parts, focus)
	}
	return strings.Join(parts, " · ")
}

func ref5UnfinishedSessions(sessions []api.GeneratedSession, logs []api.LogItem) []api.GeneratedSession {
	logged := make(map[string]bool, len(logs))
	for _, log := range logs {
		if log.GeneratedSessionID != nil {
			logged[*log.GeneratedSessionID] = true
		}
	}
	var out []api.GeneratedSession
	for _, session := range sessions {
		if session.Status == "SKIPPED" || session.Status == "DONE" {
			continue
		}
		meta := session.Snapshot.Ref5
		committedOrLegacy := meta != nil &&
			(meta.StartCommitted || meta.ProtocolVersion == api.Ref5LegacyProtocolVersion)
		if session.ID != "" && session.Snapshot.IsRef5() && committedOrLegacy && !logged[session.ID] {
			out = append(out, session)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i].Snapshot.ActualStartAt, out[j].Snapshot.ActualStartAt
		return a > b
	})
	return out
}
