package ui

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

func (l Log) beginRef5Start(plan api.Plan, bodyweight float64) (Log, tea.Cmd) {
	l.clearDraft()
	l.groups, l.gi, l.si, l.col = nil, 0, 0, colReps
	l.editID, l.performedAt, l.sessionKey = "", time.Time{}, ""
	l.generatedSessionID = ""
	l.planID, l.planName = plan.ID, plan.Name
	l.ref5 = newRef5StartState(plan, bodyweight, time.Now())
	l.load, l.undo, l.feedback = loadIdle, nil, nil
	l.status, l.statusErr = "첫 스쿼트 워크 세트의 실제 시작 정보를 확인하세요", false
	return l.openRef5StartTimePicker()
}

func (l Log) openRef5StartTimePicker() (Log, tea.Cmd) {
	if l.ref5 == nil {
		return l, nil
	}
	if l.ref5.Phase == ref5PreviewReady {
		l.ref5.Phase = ref5Decide
		l.ref5.Preview, l.ref5.PreviewSignature = nil, ""
		l.status, l.statusErr = "시작 입력 변경 중 · 완료 후 새 미리보기를 계산합니다", false
	}
	initial := l.ref5.Start.ActualStartAt
	if at, err := time.Parse(time.RFC3339Nano, initial); err == nil {
		initial = at.In(ref5PlanLocation(l.ref5.Plan)).Format("2006-01-02 15:04:05")
	}
	return l, func() tea.Msg {
		return openPickerMsg{prompt: "실제 시작 시각 ", tag: "ref5-start-at", initial: initial, owner: vToday, owned: true}
	}
}

func parseRef5StartAt(raw string, now time.Time, location *time.Location) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.EqualFold(raw, "now") || raw == "지금" {
		return now.UTC().Format(time.RFC3339Nano), nil
	}
	if at, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return at.UTC().Format(time.RFC3339Nano), nil
	}
	if location == nil {
		location = time.Local
	}
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02 15:04", "2006-01-02T15:04:05", "2006-01-02T15:04"} {
		if at, err := time.ParseInLocation(layout, raw, location); err == nil {
			return at.UTC().Format(time.RFC3339Nano), nil
		}
	}
	return "", fmt.Errorf("예: 2026-07-14 14:03:21 또는 now")
}

func boolPicker(prompt, tag string) tea.Cmd {
	return func() tea.Msg {
		return openPickerMsg{prompt: prompt, tag: tag, owner: vToday, owned: true, items: []pickerItem{
			{label: "아니오", desc: "off", value: "false"},
			{label: "예", desc: "on", value: "true"},
		}}
	}
}

func (l Log) requestRef5Preview() (Log, tea.Cmd) {
	if l.ref5 == nil || !l.ref5.Start.valid() {
		l.status, l.statusErr = "정확한 시작 시각과 0보다 큰 체중이 필요합니다", true
		return l, nil
	}
	if l.ref5.Start.OmitPullVolume && !l.ref5.Start.ClimbingWithin48h {
		l.status, l.statusErr = "PULL 생략은 48시간 내 클라이밍일 때만 가능합니다", true
		return l, nil
	}
	l.ref5.Preview, l.ref5.PreviewSignature = nil, ""
	l.ref5.Phase = ref5Previewing
	l.status, l.statusErr = "REF5 처방 계산 중…", false
	return l, previewRef5Cmd(l.client, l.ref5.Plan.ID, l.ref5.Start)
}

func (l Log) openRef5ResumePicker() (Log, tea.Cmd) {
	if l.ref5 == nil {
		return l, nil
	}
	ids := make([]string, 0, len(l.ref5.Resume))
	for id := range l.ref5.Resume {
		ids = append(ids, id)
	}
	// Resume was populated newest-first; rebuild the visible order from the
	// immutable start timestamp so map iteration never randomizes the picker.
	sessions := make([]api.GeneratedSession, 0, len(ids))
	for _, session := range l.ref5.Resume {
		sessions = append(sessions, session)
	}
	for i := 0; i < len(sessions); i++ {
		for j := i + 1; j < len(sessions); j++ {
			if sessions[j].Snapshot.ActualStartAt > sessions[i].Snapshot.ActualStartAt {
				sessions[i], sessions[j] = sessions[j], sessions[i]
			}
		}
	}
	items := make([]pickerItem, 0, len(sessions)+1)
	for _, session := range sessions {
		items = append(items, pickerItem{label: ref5ResumeLabel(session), desc: "이어하기", value: session.ID})
	}
	items = append(items, pickerItem{label: "새 REF5 세션", desc: "새 시작 사건", value: "new"})
	return l, func() tea.Msg {
		return openPickerMsg{prompt: "REF5 시작 세션 ", tag: "ref5-resume", items: items, owner: vToday, owned: true}
	}
}

func (l Log) confirmRef5Start() (Log, tea.Cmd) {
	if l.ref5 == nil || !l.ref5.previewCurrent() {
		l.status, l.statusErr = "현재 입력으로 미리보기를 먼저 실행하세요", true
		return l, nil
	}
	at, err := time.Parse(time.RFC3339Nano, l.ref5.Start.ActualStartAt)
	if err != nil {
		l.status, l.statusErr = "시작 시각이 올바르지 않습니다", true
		return l, nil
	}
	values, planID := l.ref5.Start, l.ref5.Plan.ID
	prompt := "SQ 첫 워크 세트를 " + at.In(ref5PlanLocation(l.ref5.Plan)).Format("15:04:05 MST") + "에 시작?"
	return l, func() tea.Msg {
		return confirmMsg{
			prompt: prompt,
			onYes: func() tea.Msg {
				return ref5StartConfirmedMsg{planID: planID, values: values, signature: values.signature()}
			},
		}
	}
}

type ref5StartConfirmedMsg struct {
	planID    string
	values    ref5StartValues
	signature string
}

func (l Log) handleRef5Picked(m pickedMsg) (Log, tea.Cmd, bool) {
	if !strings.HasPrefix(m.tag, "ref5-") {
		return l, nil, false
	}
	if l.ref5 == nil {
		return l, nil, true
	}
	switch m.tag {
	case "ref5-resume":
		if m.value == "new" {
			returnValues, cmd := l.beginRef5Start(l.ref5.Plan, l.ref5.Start.BodyweightKg)
			return returnValues, cmd, true
		}
		if _, ok := l.ref5.Resume[m.value]; !ok {
			l.status, l.statusErr = "재개할 세션을 찾지 못했습니다", true
			return l, nil, true
		}
		l.ref5.Phase = ref5Starting
		l.ref5.PendingSessionID = m.value
		l.status, l.statusErr = "시작된 세션 확인 중…", false
		return l, resumeRef5Cmd(l.client, l.ref5.Plan.ID, m.value), true
	case "ref5-start-at":
		at, err := parseRef5StartAt(m.value, time.Now(), ref5PlanLocation(l.ref5.Plan))
		if err != nil {
			l.status, l.statusErr = "시작 시각: "+err.Error(), true
			return l, nil, true
		}
		l.ref5.Start.ActualStartAt = at
		initial := ""
		if l.ref5.Start.BodyweightKg > 0 {
			initial = trimNum(l.ref5.Start.BodyweightKg)
		}
		return l, func() tea.Msg {
			return openPickerMsg{prompt: "오늘 체중 kg ", tag: "ref5-bodyweight", initial: initial, owner: vToday, owned: true}
		}, true
	case "ref5-bodyweight":
		value, err := strconv.ParseFloat(strings.TrimSpace(m.value), 64)
		if err != nil || value <= 0 || value > 500 {
			l.status, l.statusErr = "체중은 0보다 크고 500kg 이하여야 합니다", true
			return l, nil, true
		}
		l.ref5.Start.BodyweightKg = round2(value)
		return l, boolPicker("수동 MICRO ", "ref5-manual-micro"), true
	case "ref5-manual-micro":
		l.ref5.Start.ManualMicro = m.value == "true"
		return l, boolPicker("48h 내 클라이밍 ", "ref5-climbing"), true
	case "ref5-climbing":
		l.ref5.Start.ClimbingWithin48h = m.value == "true"
		if !l.ref5.Start.ClimbingWithin48h {
			l.ref5.Start.OmitPullVolume = false
			updated, cmd := l.requestRef5Preview()
			return updated, cmd, true
		}
		return l, boolPicker("PULL 볼륨 생략 ", "ref5-omit-pull"), true
	case "ref5-omit-pull":
		l.ref5.Start.OmitPullVolume = m.value == "true"
		updated, cmd := l.requestRef5Preview()
		return updated, cmd, true
	case "ref5-reason":
		if !ref5ReasonValid(m.value) || l.gi >= len(l.groups) {
			return l, nil, true
		}
		gi, reason := l.gi, m.value
		if reason == ref5ReasonSafety || reason == ref5ReasonExternal {
			return l, func() tea.Msg {
				return confirmMsg{
					prompt: reason + " · 미입력 세트를 0 reps로 닫기?",
					onYes:  func() tea.Msg { return ref5CloseExerciseMsg{gi: gi, reason: reason, fillZero: true} },
				}
			}, true
		}
		l.groups[gi].ref5.TerminationReason = reason
		l.ref5.Dirty = true
		l.persistDraft()
		if _, err := ref5Outcome(l.groups[gi]); err != nil {
			l.status, l.statusErr = reason+" · "+err.Error(), true
		} else {
			l.status, l.statusErr = theme.GlyphDone+" 종료 사유 "+reason, false
		}
		return l, nil, true
	}
	return l, nil, true
}

type ref5CloseExerciseMsg struct {
	gi       int
	reason   string
	fillZero bool
}

func (l *Log) loadRef5Session(session *api.GeneratedSession) error {
	if session == nil || session.ID == "" || !session.Snapshot.IsRef5() || session.Snapshot.Ref5 == nil {
		return fmt.Errorf("서버가 동결된 REF5 세션을 반환하지 않았습니다")
	}
	meta := session.Snapshot.Ref5
	groups := make([]exGroup, 0, len(session.Snapshot.Exercises))
	for _, ex := range session.Snapshot.Exercises {
		if ex.Ref5 == nil || ex.Ref5.Omitted {
			continue
		}
		entry := &ref5ExerciseEntry{
			PrescriptionID: ex.Ref5.PrescriptionID, Lift: ex.Ref5.Lift,
			Role: ex.Ref5.Role, Stream: ex.Ref5.Stream, Prescription: openJSON(ex.Ref5),
		}
		g := exGroup{name: ex.ExerciseName, role: ex.Role, ref5: entry}
		maxExternal, maxTotal, targetReps := 0.0, 0.0, 0
		for i, planned := range ex.Sets {
			reps := planned.PlannedReps
			if reps == 0 {
				reps = planned.Reps
			}
			ext := float64(planned.ExternalLoadKg)
			if ext == 0 && float64(planned.TargetWeightKg) != 0 {
				ext = float64(planned.TargetWeightKg)
			}
			total := float64(planned.TotalLoadKg)
			if total == 0 {
				total = ext
			}
			setNumber := planned.SetNumber
			if setNumber <= 0 {
				setNumber = i + 1
			}
			g.sets = append(g.sets, setEntry{
				weight: trimNum(ext), tgtReps: reps, total: total,
				setNumber: setNumber, originalMeta: cloneSetMeta(planned.Meta),
			})
			if total >= maxTotal {
				maxTotal, maxExternal, targetReps = total, ext, reps
			}
		}
		if len(g.sets) == 0 {
			return fmt.Errorf("%s 처방에 세트가 없습니다", ex.ExerciseName)
		}
		if entry.Lift == "PULL" && maxTotal > 0 {
			g.tgt = fmt.Sprintf("+%s/%s×%d", trimNum(maxExternal), trimNum(maxTotal), targetReps)
		} else if maxExternal >= 0 {
			g.tgt = fmt.Sprintf("%s×%d", trimNum(maxExternal), targetReps)
		}
		groups = append(groups, g)
	}
	if len(groups) == 0 {
		return fmt.Errorf("기록할 REF5 처방이 없습니다")
	}
	plan := api.Plan{ID: session.PlanID, Name: session.Snapshot.Plan.Name}
	if l.ref5 != nil && l.ref5.Plan.ID != "" {
		plan = l.ref5.Plan
	}
	if plan.ID == "" {
		plan.ID = session.Snapshot.Plan.ID
	}
	start := ref5StartValues{
		ActualStartAt:     meta.ActualStartAt,
		BodyweightKg:      float64(meta.DomainSnapshot.StartInput.TodayBodyweightKg),
		ManualMicro:       meta.DomainSnapshot.StartInput.ManualMicro,
		ClimbingWithin48h: meta.DomainSnapshot.StartInput.ClimbingWithin48h,
		OmitPullVolume:    meta.DomainSnapshot.StartInput.OmitPullVolume,
		StartEventID:      meta.StartEventID,
	}
	if start.ActualStartAt == "" {
		start.ActualStartAt = session.Snapshot.ActualStartAt
	}
	if at, err := time.Parse(time.RFC3339Nano, start.ActualStartAt); err == nil {
		l.performedAt = at
	} else {
		return fmt.Errorf("REF5 실제 시작 시각이 올바르지 않습니다")
	}
	l.ref5 = &ref5SessionState{
		Phase: ref5Active, Plan: plan, Start: start, Session: session,
		CompletionEventID: meta.StartEventID + ":completion",
	}
	l.groups, l.gi, l.si, l.col = groups, 0, 0, colReps
	l.planID, l.planName, l.sessionKey = plan.ID, plan.Name, session.SessionKey
	l.generatedSessionID = session.ID
	if l.planName == "" {
		l.planName = session.Snapshot.Plan.Name
	}
	l.bodyweight = start.BodyweightKg
	l.editID, l.editing, l.target = "", false, editNone
	l.load, l.undo, l.feedback = loadIdle, nil, nil
	l.status, l.statusErr = theme.GlyphDone+" REF5 세션 시작됨 · reps와 종료 사유만 기록", false
	l.persistDraft()
	return nil
}
