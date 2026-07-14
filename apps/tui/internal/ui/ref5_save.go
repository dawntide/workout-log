package ui

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

// ref5SaveConfirmedMsg carries the exact request that was shown in the
// confirmation prompt. The handler re-correlates it with the current session
// and rejects it if the editable buffer changed while the modal was open.
type ref5SaveConfirmedMsg struct {
	request           api.CreateLogRequest
	editID            string
	planID            string
	sessionID         string
	completionEventID string
}

func (l Log) confirmRef5Save() (Log, tea.Cmd) {
	if l.ref5 == nil || !l.ref5.active() {
		return l, nil
	}
	parts := make([]string, 0, len(l.groups))
	for _, group := range l.groups {
		outcome, err := ref5Outcome(group)
		if err != nil {
			l.status, l.statusErr = group.name+": "+err.Error(), true
			return l, nil
		}
		lift := group.name
		if group.ref5 != nil && group.ref5.Lift != "" {
			lift = group.ref5.Lift
		}
		reason := ""
		if group.ref5 != nil {
			reason = group.ref5.TerminationReason
		}
		parts = append(parts, lift+" "+outcome+"/"+reason)
	}
	req, err := buildRef5SaveRequest(l)
	if err != nil {
		l.status, l.statusErr = err.Error(), true
		return l, nil
	}
	confirmed := ref5SaveConfirmedMsg{
		request:           req,
		editID:            l.editID,
		planID:            l.ref5.Plan.ID,
		sessionID:         l.ref5.Session.ID,
		completionEventID: l.ref5.CompletionEventID,
	}
	prompt := "저장 · " + strings.Join(parts, " · ") + "?"
	return l, func() tea.Msg {
		return confirmMsg{prompt: prompt, onYes: func() tea.Msg { return confirmed }}
	}
}

func copyAnyMap(in map[string]any) map[string]any {
	if in == nil {
		return map[string]any{}
	}
	return openJSON(in)
}

func buildRef5SaveRequest(l Log) (api.CreateLogRequest, error) {
	if l.ref5 == nil || !l.ref5.active() || l.ref5.Session == nil || l.ref5.Session.Snapshot.Ref5 == nil {
		return api.CreateLogRequest{}, fmt.Errorf("시작된 REF5 세션이 없습니다")
	}
	state := l.ref5
	sessionMeta := state.Session.Snapshot.Ref5
	at, err := time.Parse(time.RFC3339Nano, sessionMeta.ActualStartAt)
	if err != nil {
		at, err = time.Parse(time.RFC3339Nano, state.Start.ActualStartAt)
	}
	if err != nil {
		return api.CreateLogRequest{}, fmt.Errorf("REF5 실제 시작 시각이 올바르지 않습니다")
	}
	if strings.TrimSpace(state.CompletionEventID) == "" {
		return api.CreateLogRequest{}, fmt.Errorf("REF5 완료 사건 ID가 없습니다")
	}
	sets := make([]api.WorkoutSet, 0)
	for gi, group := range l.groups {
		if group.ref5 == nil {
			return api.CreateLogRequest{}, fmt.Errorf("%s의 REF5 처방 메타가 없습니다", group.name)
		}
		if _, err := ref5Outcome(group); err != nil {
			return api.CreateLogRequest{}, fmt.Errorf("%s: %w", group.name, err)
		}
		for si, set := range group.sets {
			reps, _ := strconv.Atoi(strings.TrimSpace(set.reps))
			weight, err := strconv.ParseFloat(strings.TrimSpace(set.weight), 64)
			if err != nil || weight < 0 {
				return api.CreateLogRequest{}, fmt.Errorf("%s #%d 처방 중량이 올바르지 않습니다", group.name, si+1)
			}
			meta := cloneSetMeta(set.originalMeta)
			ref5 := copyAnyMap(meta.Ref5)
			ref5["prescription"] = copyAnyMap(group.ref5.Prescription)
			ref5["prescriptionId"] = group.ref5.PrescriptionID
			ref5["terminationReason"] = group.ref5.TerminationReason
			ref5["protocolVersion"] = sessionMeta.ProtocolVersion
			ref5["actualStartAt"] = sessionMeta.ActualStartAt
			ref5["startEventId"] = sessionMeta.StartEventID
			ref5["completionEventId"] = state.CompletionEventID
			ref5["runtimeRevisionBefore"] = sessionMeta.RuntimeRevisionBefore
			ref5["runtimeRevisionAfter"] = sessionMeta.RuntimeRevisionAfter
			ref5["plannedReps"] = set.tgtReps
			ref5["actualReps"] = reps
			ref5["setIndex"] = si
			meta.Ref5 = ref5
			setNumber := set.setNumber
			if setNumber <= 0 {
				setNumber = si + 1
			}
			sets = append(sets, api.WorkoutSet{
				ExerciseName: group.name, SortOrder: gi, SetNumber: setNumber,
				Reps: reps, WeightKg: round2(weight), IsExtra: false, Meta: meta,
			})
		}
	}
	timezone := sessionMeta.Timezone
	if timezone == "" {
		timezone = state.Session.Snapshot.Timezone
	}
	return api.CreateLogRequest{
		PlanID: state.Plan.ID, GeneratedSessionID: state.Session.ID,
		Sets: sets, PerformedAt: at, Timezone: timezone,
	}, nil
}

func saveRef5Cmd(c *api.Client, req api.CreateLogRequest, editID string) tea.Cmd {
	return func() tea.Msg {
		id := editID
		var feedback *api.ProgressionFeedback
		var err error
		if editID != "" {
			feedback, err = c.UpdateLog(context.Background(), editID, req)
		} else {
			id, feedback, err = c.CreateLog(context.Background(), req)
		}
		if err != nil {
			return saveResultMsg{
				err: err, edited: editID != "", performedAt: req.PerformedAt,
				uncertain: editID == "" && writeOutcomeUncertain(err),
			}
		}
		detail, refreshErr := c.GetLog(context.Background(), id)
		return saveResultMsg{
			detail: detail, refreshErr: refreshErr, savedID: id, edited: editID != "",
			performedAt: req.PerformedAt, feedback: feedback,
		}
	}
}
