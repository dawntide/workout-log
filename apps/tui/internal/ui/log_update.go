package ui

// log_update.go — 오늘 버퍼의 키 처리와 상태 변이(NORMAL/INSERT 키맵, 세트 이동·추가·삭제·
// 완료, 편집 로드/기록, 스냅샷 로드). 렌더링/커맨드와 분리 — god-component 분해 3단계.

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

func (l Log) updateNormal(m tea.KeyPressMsg) (Log, tea.Cmd) {
	if l.saving || l.pendingOverride {
		return l, nil
	}
	if l.load == loadPending {
		return l, nil
	}
	if l.saveUncertain {
		switch m.String() {
		case "s":
			return l.save()
		case "D":
			if l.ref5 != nil && l.ref5.active() {
				l.status, l.statusErr = "REF5 최초 저장 결과는 폐기할 수 없습니다 · s로 동일 저장 재시도", true
				return l, nil
			}
			return l, func() tea.Msg {
				return confirmMsg{prompt: "확인되지 않은 저장 시도를 포함해 입력을 폐기할까요?", onYes: func() tea.Msg { return genericDiscardConfirmedMsg{} }}
			}
		default:
			return l, nil
		}
	}
	if l.ref5 != nil {
		switch l.ref5.Phase {
		case ref5Decide:
			switch m.String() {
			case "e", "i", "enter":
				return l.openRef5StartTimePicker()
			case "p":
				return l.requestRef5Preview()
			case "esc":
				l.status, l.statusErr = "REF5 플랜은 시작 게이트를 거쳐야 합니다 · e로 입력", false
			}
			return l, nil
		case ref5Previewing:
			if m.String() == "esc" {
				l.ref5.Phase = ref5Decide
				l.ref5.Preview, l.ref5.PreviewSignature = nil, ""
				l.status, l.statusErr = "미리보기 취소됨 · REF5 시작 게이트 유지", false
			}
			return l, nil
		case ref5Starting:
			// Start/resume may already have reached the server. Keep the terminal
			// locked until the correlated response arrives so an immutable session
			// can never be orphaned by a local cancel.
			if l.ref5.StartUncertain && !l.ref5.StartRequestInFlight &&
				(m.String() == "s" || m.String() == "enter") {
				l.ref5.StartRequestInFlight = true
				l.status, l.statusErr = "동일 REF5 시작 사건 확인 중…", false
				return l, startRef5Cmd(l.client, l.ref5.Plan.ID, l.ref5.Start)
			}
			return l, nil
		case ref5PreviewReady:
			switch m.String() {
			case "s", "enter":
				return l.confirmRef5Start()
			case "p":
				return l.requestRef5Preview()
			case "e", "i":
				return l.openRef5StartTimePicker()
			case "esc":
				l.ref5.Phase = ref5Decide
				l.ref5.Preview, l.ref5.PreviewSignature = nil, ""
				l.status, l.statusErr = "미리보기 닫힘 · REF5 시작 게이트 유지", false
			}
			return l, nil
		case ref5Active:
			if l.saving {
				return l, nil
			}
			return l.updateRef5Active(m)
		}
	}
	switch m.String() {
	case "j", "down":
		l.moveSet(1)
	case "k", "up":
		l.moveSet(-1)
	case "h", "left":
		if l.col > colWeight {
			l.col--
		}
	case "l", "right":
		if l.col < colRPE {
			l.col++
		}
	case "i", "enter":
		if len(l.groups) == 0 {
			return l, openExercisePickerCmd(l.client)
		}
		return l.beginEdit(editCell)
	case "e", "n":
		return l, openExercisePickerCmd(l.client)
	case "a":
		return l.beginAccessory()
	case "c":
		return l.beginReplace()
	case "x":
		return l.toggleDone()
	case "o":
		return l.addSet()
	case "d":
		return l.deleteSet()
	case "u":
		return l.undoDelete()
	case "s":
		return l.save()
	case "D":
		if l.genericDirty {
			return l, func() tea.Msg {
				return confirmMsg{
					prompt: "저장하지 않은 Today 입력을 폐기할까요?",
					onYes:  func() tea.Msg { return genericDiscardConfirmedMsg{} },
				}
			}
		}
	}
	return l, nil
}

// hasBlockingRef5Work prevents the single crash-recovery draft from being
// replaced while a server-started session still needs its canonical log. A
// newly started session blocks even before the first rep is entered; an edited
// historical log blocks only after a local mutation (or while saving).
func (l Log) hasBlockingRef5Work() bool {
	if l.ref5 == nil {
		return false
	}
	if l.ref5.Phase == ref5Starting {
		return true
	}
	return l.ref5.active() && (l.editID == "" || l.ref5.Dirty || l.saving)
}

func (l Log) hasBlockingReplacement() bool {
	return l.saving || l.saveUncertain || l.pendingOverride || l.genericDirty || l.hasBlockingRef5Work()
}

// hasUnsettledServerMutation is narrower than unsaved local work: it marks
// writes that may still commit after an account-deletion cleanup. Deletion is
// blocked until these outcomes are correlated, preventing a late orphan row.
func (l Log) hasUnsettledServerMutation() bool {
	return l.saving || l.saveUncertain || l.pendingOverride ||
		(l.ref5 != nil && l.ref5.Phase == ref5Starting)
}

type genericDiscardConfirmedMsg struct{}

// resetForSessionLoad reserves a pristine Today buffer for one asynchronous
// plan-generation response. Callers first guard unsaved work, so clearing here
// is an intentional plan/override transition rather than a late-response wipe.
func (l *Log) resetForSessionLoad() {
	l.groups, l.gi, l.si, l.col = nil, 0, 0, colWeight
	l.editing, l.target = false, editNone
	l.editID, l.performedAt = "", time.Time{}
	l.planID, l.planName, l.sessionKey, l.generatedSessionID = "", "", "", ""
	l.clientMutationID = ""
	l.ref5, l.undo, l.feedback = nil, nil, nil
	l.clearRef5WindowStatus()
	l.pendAccsry, l.pendBlock = "", ""
	l.pendingOverride, l.overridePlanID = false, ""
	l.saveUncertain = false
	l.genericDirty = false
	l.clearDraft()
}

func (l Log) updateEditing(m tea.KeyPressMsg) (Log, tea.Cmd) {
	if l.ref5 != nil && l.ref5.active() {
		switch m.String() {
		case "esc":
			l.editing, l.target = false, editNone
			return l, nil
		case "enter", "tab":
			if l.gi >= len(l.groups) || l.si >= len(l.groups[l.gi].sets) {
				l.editing, l.target = false, editNone
				return l, nil
			}
			planned := l.groups[l.gi].sets[l.si].tgtReps
			if !validRef5Reps(l.edit.Value(), planned) {
				l.status, l.statusErr = fmt.Sprintf("reps는 0..%d 정수여야 합니다", planned), true
				return l, nil
			}
			l.groups[l.gi].sets[l.si].reps = strings.TrimSpace(l.edit.Value())
			l.groups[l.gi].sets[l.si].done = true
			l.ref5.Dirty = true
			l.editing, l.target = false, editNone
			l.status, l.statusErr = "", false
			l.persistDraft()
			l.moveSet(1)
			l.col = colReps
			return l, nil
		}
		var cmd tea.Cmd
		l.edit, cmd = l.edit.Update(m)
		return l, cmd
	}
	switch m.String() {
	case "esc":
		l.editing, l.target = false, editNone
		return l, nil
	case "enter":
		l.writeEdit()
		l.editing = false
		switch l.target {
		case editName:
			l.col = colWeight
			return l.beginEdit(editCell)
		case editCell:
			switch l.col {
			case colWeight:
				l.col = colReps
				return l.beginEdit(editCell)
			case colReps:
				return l.completeSet()
			}
			return l, nil // colRPE is optional; close the editor
		}
		return l, nil
	case "tab":
		l.writeEdit()
		l.editing = false
		if l.target == editName {
			l.col = colWeight
		} else {
			l.col = (l.col + 1) % 3 // weight → reps → rpe → weight
		}
		return l.beginEdit(editCell)
	}
	var cmd tea.Cmd
	l.edit, cmd = l.edit.Update(m)
	return l, cmd
}

func (l Log) updateRef5Active(m tea.KeyPressMsg) (Log, tea.Cmd) {
	switch m.String() {
	case "j", "down":
		l.moveSet(1)
	case "k", "up":
		l.moveSet(-1)
	case "i", "enter":
		if len(l.groups) > 0 {
			l.col = colReps
			return l.beginEdit(editCell)
		}
	case "x":
		if l.gi < len(l.groups) && l.si < len(l.groups[l.gi].sets) {
			set := &l.groups[l.gi].sets[l.si]
			set.reps, set.done = strconv.Itoa(set.tgtReps), true
			l.ref5.Dirty = true
			l.status, l.statusErr = "", false
			l.persistDraft()
			l.moveSet(1)
			l.col = colReps
		}
	case "t":
		return l.beginRef5Reason()
	case "s":
		return l.save()
	case "n":
		if l.editID != "" {
			if l.ref5.Dirty {
				l.status, l.statusErr = "저장하지 않은 REF5 변경이 있습니다", true
				return l, nil
			}
			return l.beginRef5Start(l.ref5.Plan, l.ref5.Start.BodyweightKg)
		}
	}
	return l, nil
}

func (l Log) beginRef5Reason() (Log, tea.Cmd) {
	if l.gi >= len(l.groups) || l.groups[l.gi].ref5 == nil {
		return l, nil
	}
	items := []pickerItem{
		{label: "NORMAL", desc: "전 reps 완료 · PASS", value: ref5ReasonNormal},
		{label: "CLEAR_SLOWDOWN", desc: "명확한 감속 · HOLD/FAIL", value: ref5ReasonSlowdown},
		{label: "FORCE_OR_TECHNIQUE", desc: "힘/기술 한계 · 미달 필요", value: ref5ReasonForce},
		{label: "SAFETY", desc: "안전 종료 · INVALID", value: ref5ReasonSafety},
		{label: "EXTERNAL", desc: "외부 사유 · INVALID", value: ref5ReasonExternal},
	}
	return l, func() tea.Msg {
		return openPickerMsg{prompt: "종료 사유 ", tag: "ref5-reason", items: items, owner: vToday, owned: true}
	}
}

func (l *Log) moveSet(dir int) {
	if len(l.groups) == 0 {
		return
	}
	if dir > 0 {
		if l.si < len(l.groups[l.gi].sets)-1 {
			l.si++
		} else if l.gi < len(l.groups)-1 {
			l.gi, l.si = l.gi+1, 0
		}
	} else {
		if l.si > 0 {
			l.si--
		} else if l.gi > 0 {
			l.gi = l.gi - 1
			l.si = len(l.groups[l.gi].sets) - 1
		}
	}
}

// beginAccessory starts the 보강 (ADD_ACCESSORY) override flow: pick an exercise,
// then enter its sets. Only valid on a generated plan session.
func (l Log) beginAccessory() (Log, tea.Cmd) {
	if l.genericDirty {
		l.status, l.statusErr = "입력 중인 세트를 먼저 저장하거나 D로 폐기하세요", true
		return l, nil
	}
	if l.planID == "" || l.sessionKey == "" {
		l.status, l.statusErr = "보강은 플랜 세션에서만 가능합니다", true
		return l, nil
	}
	return l, exercisePickerCmd(l.client, "보강 운동 ", "accessory")
}

// beginReplace starts the 교체 (REPLACE_EXERCISE) override flow for the selected
// MAIN exercise's block target.
func (l Log) beginReplace() (Log, tea.Cmd) {
	if l.genericDirty {
		l.status, l.statusErr = "입력 중인 세트를 먼저 저장하거나 D로 폐기하세요", true
		return l, nil
	}
	if l.planID == "" || l.sessionKey == "" {
		l.status, l.statusErr = "교체는 플랜 세션에서만 가능합니다", true
		return l, nil
	}
	if l.gi >= len(l.groups) {
		return l, nil
	}
	g := l.groups[l.gi]
	if g.role != "MAIN" || g.blockTarget == "" {
		l.status, l.statusErr = "메인 운동에서만 교체할 수 있습니다", true
		return l, nil
	}
	l.pendBlock = g.blockTarget
	return l, exercisePickerCmd(l.client, "교체할 운동 ", "replace")
}

func (l Log) addSet() (Log, tea.Cmd) {
	if len(l.groups) == 0 {
		return l, openExercisePickerCmd(l.client)
	}
	at := l.si + 1
	sets := l.groups[l.gi].sets
	nextNumber := 1
	for _, set := range sets {
		if set.setNumber >= nextNumber {
			nextNumber = set.setNumber + 1
		}
	}
	ns := make([]setEntry, 0, len(sets)+1)
	ns = append(ns, sets[:at]...)
	ns = append(ns, setEntry{setNumber: nextNumber, isExtra: true})
	ns = append(ns, sets[at:]...)
	l.groups[l.gi].sets = ns
	l.si, l.col = at, colWeight
	l.persistDraft()
	return l, nil
}

func (l Log) deleteSet() (Log, tea.Cmd) {
	if len(l.groups) == 0 {
		return l, nil
	}
	if l.groups[l.gi].sets[l.si].prescribed {
		l.status, l.statusErr = "처방 세트는 삭제할 수 없습니다 · 미수행은 reps 0으로 기록하세요", true
		return l, nil
	}
	l.undo = &undoSnapshot{groups: cloneGroups(l.groups), gi: l.gi, si: l.si}
	if len(l.groups[l.gi].sets) <= 1 {
		l.groups = append(l.groups[:l.gi], l.groups[l.gi+1:]...)
		if l.gi >= len(l.groups) {
			l.gi = len(l.groups) - 1
		}
		if l.gi < 0 {
			l.gi = 0
		}
		l.si = 0
		l.persistDraft()
		return l, nil
	}
	sets := l.groups[l.gi].sets
	l.groups[l.gi].sets = append(sets[:l.si], sets[l.si+1:]...)
	if l.si >= len(l.groups[l.gi].sets) {
		l.si = len(l.groups[l.gi].sets) - 1
	}
	l.persistDraft()
	return l, nil
}

// undoDelete restores the buffer to the state captured by the last deleteSet.
func (l Log) undoDelete() (Log, tea.Cmd) {
	if l.undo == nil {
		return l, nil
	}
	l.groups, l.gi, l.si, l.col = l.undo.groups, l.undo.gi, l.undo.si, colWeight
	l.undo = nil
	l.status, l.statusErr = theme.GlyphDone+" 삭제 되돌림", false
	l.persistDraft()
	return l, nil
}

func (l Log) toggleDone() (Log, tea.Cmd) {
	if len(l.groups) == 0 {
		return l, nil
	}
	s := &l.groups[l.gi].sets[l.si]
	if s.done {
		s.done = false
		l.persistDraft()
		return l, nil
	}
	if strings.TrimSpace(l.groups[l.gi].name) == "" || !validNum(s.weight) || !validInt(s.reps) {
		l.status, l.statusErr = "완료하려면 무게·reps가 필요합니다", true
		return l, nil
	}
	s.done = true
	l.status, l.statusErr = "", false
	l.persistDraft()
	return l, nil
}

func (l Log) completeSet() (Log, tea.Cmd) {
	s := l.groups[l.gi].sets[l.si]
	if strings.TrimSpace(l.groups[l.gi].name) == "" || !validNum(s.weight) || !validInt(s.reps) {
		l.status, l.statusErr = "무게·reps를 정확히 입력하세요", true
		return l, nil
	}
	l.groups[l.gi].sets[l.si].done = true
	l.status, l.statusErr = "", false
	l.persistDraft()
	// 세트 추가는 addSet("o")로만 — reps 엔터는 현재 세트 완료까지만 하고
	// 빈 세트를 자동으로 덧붙이지 않는다.
	// 입력 리듬: reps 완료 = 세트 완료이므로 커서를 다음 세트로 옮겨(운동 경계 넘어감)
	// 엔터 한 번으로 바로 이어 입력하게 한다. 마지막 세트면 제자리(moveSet이 no-op).
	// 에디터를 자동으로 열지는 않는다 — 이동/저장 키(j/k/s)를 편집기가 삼키면 안 된다.
	l.moveSet(1)
	l.col = colWeight
	return l, nil
}

func (l Log) save() (Log, tea.Cmd) {
	if l.saving {
		return l, nil
	}
	if l.ref5 != nil && l.ref5.active() {
		return l.confirmRef5Save()
	}
	for gi, group := range l.groups {
		for si, set := range group.sets {
			if !set.done {
				continue
			}
			if strings.TrimSpace(group.name) == "" || !validNum(set.weight) || !validInt(set.reps) {
				l.status, l.statusErr = fmt.Sprintf("%d번째 운동 #%d의 무게·reps를 확인하세요", gi+1, si+1), true
				return l, nil
			}
			if raw := strings.TrimSpace(set.rpe); raw != "" {
				rpe, err := strconv.Atoi(raw)
				if err != nil || rpe < 1 || rpe > 10 {
					l.status, l.statusErr = fmt.Sprintf("%s #%d의 RPE는 1..10 정수여야 합니다", group.name, si+1), true
					return l, nil
				}
			}
		}
	}
	if l.generatedSessionID != "" {
		for _, group := range l.groups {
			if isBodyweightExercise(group.name) && l.bodyweight <= 0 {
				for _, set := range group.sets {
					if set.prescribed {
						l.status, l.statusErr = "체중 운동 처방을 저장하려면 settings에서 체중을 먼저 설정하세요", true
						return l, nil
					}
				}
			}
			for _, set := range group.sets {
				if set.prescribed && !set.done {
					l.status, l.statusErr = "처방된 모든 세트를 기록하세요 · 미수행은 reps 0으로 완료", true
					return l, nil
				}
			}
		}
	}
	if l.doneCount() == 0 {
		l.status, l.statusErr = "완료된 세트가 없습니다 (x로 완료)", true
		return l, nil
	}
	// New drafts have a server-enforced stable mutation key, so an uncertain
	// retry can safely re-POST the exact payload in one step. Only pre-key legacy
	// drafts need the slower list/fingerprint reconciliation fallback.
	wasUncertain := l.saveUncertain
	reconcileFirst := wasUncertain && l.clientMutationID == ""
	if l.editID == "" {
		if l.performedAt.IsZero() {
			// Persist the exact POST timestamp before launching the request. On the
			// next boot this disambiguates a completed write from a distinct second
			// same-day ad-hoc session without relying on "first log today" heuristics.
			l.performedAt = time.Now().Truncate(time.Millisecond)
		}
		if l.clientMutationID == "" {
			l.clientMutationID = newTUIEventID()
		}
		// Mark the attempt durably before the command can reach the network. A
		// process exit or midnight rollover while the POST is in flight must boot
		// into verification, never into an ordinary re-postable draft.
		l.saveUncertain = true
		if err := l.persistDraft(); err != nil {
			l.saveUncertain = wasUncertain
			l.status, l.statusErr = "임시 저장 실패 · 디스크/권한 확인 후 다시 시도: "+err.Error(), true
			return l, nil
		}
	}
	l.saving, l.status, l.statusErr = true, "", false
	return l, saveCmd(
		l.client, l.groups, l.editID, l.performedAt, l.planID, l.generatedSessionID,
		l.clientMutationID, reconcileFirst,
	)
}

// loadForEdit replaces today's buffer with a past session's sets (grouped by
// exercise, every set pre-marked done) so the user can revise and PATCH it.
func (l *Log) loadForEdit(m editLogMsg) {
	if m.generatedSession != nil && m.generatedSession.Snapshot.IsRef5() {
		l.loadRef5ForEdit(m)
		return
	}
	l.ref5 = nil
	l.bodyweight = m.bodyweight
	var order []string
	byEx := map[string]*exGroup{}
	for _, st := range m.sets {
		n := strings.TrimSpace(st.ExerciseName)
		if n == "" {
			continue
		}
		g, ok := byEx[n]
		if !ok {
			byEx[n] = &exGroup{name: n}
			g = byEx[n]
			order = append(order, n)
		}
		setTotal := 0.0
		if isBodyweightExercise(n) && st.Meta != nil && float64(st.Meta.TotalLoadKg) > 0 {
			setTotal = round2(float64(st.Meta.TotalLoadKg)) // weightKg is the external added weight
			if l.bodyweight <= 0 && float64(st.Meta.BodyweightKg) > 0 {
				l.bodyweight = round2(float64(st.Meta.BodyweightKg))
			}
		}
		g.sets = append(g.sets, setEntry{
			weight: trimNum(float64(st.WeightKg)), reps: strconv.Itoa(st.Reps),
			rpe: rpeString(st.RPE), done: true, total: setTotal,
			prescribed: m.generatedSessionID != "" && !st.IsExtra, isExtra: st.IsExtra,
			setNumber: st.SetNumber, originalMeta: cloneSetMetaIfPresent(st.Meta),
		})
	}
	groups := make([]exGroup, 0, len(order))
	for _, n := range order {
		groups = append(groups, *byEx[n])
	}
	if len(groups) == 0 {
		return
	}
	l.groups, l.gi, l.si, l.col = groups, 0, 0, colWeight
	l.editing, l.target = false, editNone
	l.editID, l.performedAt = m.id, m.performedAt
	l.planName, l.sessionKey, l.planID = m.planName, m.sessionKey, m.planID
	l.generatedSessionID = m.generatedSessionID
	l.load, l.undo = loadIdle, nil
	l.genericDirty = false
	l.status, l.statusErr = theme.GlyphDone+" 편집 로드됨 — s로 저장", false
}

func (l *Log) loadRef5ForEdit(m editLogMsg) {
	if m.generatedSession == nil {
		return
	}
	if m.generatedSession.PlanID == "" {
		m.generatedSession.PlanID = m.planID
	}
	plan := m.plan
	if plan.ID == "" {
		plan.ID = m.planID
	}
	if plan.Name == "" {
		plan.Name = m.planName
	}
	if len(plan.Params) == 0 {
		timezone := strings.TrimSpace(m.generatedSession.Snapshot.Timezone)
		if timezone == "" && m.generatedSession.Snapshot.Ref5 != nil {
			timezone = strings.TrimSpace(m.generatedSession.Snapshot.Ref5.Timezone)
		}
		if timezone != "" {
			plan.Params = map[string]any{"timezone": timezone}
		}
	}
	l.ref5 = &ref5SessionState{Plan: plan}
	// Loading a completed history row is read-only until the first user edit;
	// suppress loadRef5Session's "started session" crash draft in this path.
	drafts := l.drafts
	l.drafts = nil
	if err := l.loadRef5Session(m.generatedSession); err != nil {
		l.drafts = drafts
		l.status, l.statusErr = "REF5 편집 로드 실패: "+err.Error(), true
		return
	}
	l.drafts = drafts
	byPrescription := make(map[string]int, len(l.groups))
	for i, group := range l.groups {
		if group.ref5 != nil {
			byPrescription[group.ref5.PrescriptionID] = i
		}
	}
	completionID := ""
	for _, logged := range m.sets {
		if logged.Meta == nil || logged.Meta.Ref5 == nil {
			continue
		}
		ref5 := logged.Meta.Ref5
		prescription, _ := ref5["prescription"].(map[string]any)
		prescriptionID := anyString(ref5, "prescriptionId")
		if prescriptionID == "" {
			prescriptionID = anyString(prescription, "prescriptionId")
		}
		gi, ok := byPrescription[prescriptionID]
		if !ok {
			continue
		}
		if reason := anyString(ref5, "terminationReason"); ref5ReasonValid(reason) {
			l.groups[gi].ref5.TerminationReason = reason
		}
		if len(prescription) > 0 {
			l.groups[gi].ref5.Prescription = copyAnyMap(prescription)
		}
		if value := anyString(ref5, "completionEventId"); value != "" {
			if completionID == "" {
				completionID = value
			}
		}
		setNumber := logged.SetNumber
		if setNumber <= 0 {
			if value, ok := ref5["setNumber"].(float64); ok {
				setNumber = int(value)
			}
		}
		for si := range l.groups[gi].sets {
			if l.groups[gi].sets[si].setNumber != setNumber {
				continue
			}
			l.groups[gi].sets[si].reps = strconv.Itoa(logged.Reps)
			l.groups[gi].sets[si].done = true
			l.groups[gi].sets[si].originalMeta = cloneSetMeta(logged.Meta)
			break
		}
	}
	if completionID != "" {
		l.ref5.CompletionEventID = completionID
	}
	l.editID, l.performedAt = m.id, m.performedAt
	l.planName, l.planID, l.sessionKey = m.planName, m.planID, m.generatedSession.SessionKey
	l.generatedSessionID = m.generatedSessionID
	if l.planName == "" {
		l.planName = m.generatedSession.Snapshot.Plan.Name
	}
	l.status, l.statusErr = theme.GlyphDone+" REF5 편집 로드됨 · reps/종료 사유만 변경", false
	l.ref5.Dirty = false
	l.clearDraft()
}

func (l Log) beginEdit(t editTarget) (Log, tea.Cmd) {
	ti := textinput.New()
	ti.Prompt = ""
	ti.SetVirtualCursor(true)
	switch t {
	case editName:
		ti.SetWidth(16)
		ti.SetValue(l.groups[l.gi].name)
	case editCell:
		s := l.groups[l.gi].sets[l.si]
		if l.ref5 != nil && l.ref5.active() {
			l.col = colReps
			ti.SetWidth(4)
			ti.SetValue(s.reps)
			break
		}
		switch l.col {
		case colWeight:
			ti.SetWidth(6)
			ti.SetValue(s.weight)
		case colReps:
			ti.SetWidth(4)
			ti.SetValue(s.reps)
		case colRPE:
			ti.SetWidth(3)
			ti.SetValue(s.rpe)
		}
	}
	l.edit, l.editing, l.target = ti, true, t
	return l, l.edit.Focus()
}

// recomputeTotal refreshes a set's bodyweight-inclusive total after its external
// weight changes: total = bodyweight + external for bodyweight lifts, else 0.
func (l *Log) recomputeTotal(gi, si int) {
	g := &l.groups[gi]
	if !isBodyweightExercise(g.name) || l.bodyweight <= 0 {
		g.sets[si].total = 0
		return
	}
	ext, _ := strconv.ParseFloat(strings.TrimSpace(g.sets[si].weight), 64)
	if ext < 0 {
		ext = 0
	}
	g.sets[si].total = round2(l.bodyweight + ext)
}

func (l *Log) writeEdit() {
	v := strings.TrimSpace(l.edit.Value())
	switch l.target {
	case editName:
		l.groups[l.gi].name = v
	case editCell:
		switch l.col {
		case colWeight:
			l.groups[l.gi].sets[l.si].weight = v
			l.recomputeTotal(l.gi, l.si)
		case colReps:
			l.groups[l.gi].sets[l.si].reps = v
		case colRPE:
			l.groups[l.gi].sets[l.si].rpe = v
		}
	}
	l.persistDraft()
}

// loadSnapshot replaces today's groups with a plan's generated session,
// pre-filling each set's weight with its target and showing tgt in the header.
func (l *Log) loadSnapshot(s *api.SessionSnapshot, prev map[string]string) {
	if s == nil {
		return
	}
	var groups []exGroup
	for _, ex := range s.Exercises {
		g := exGroup{
			name: ex.ExerciseName, prev: prev[strings.ToLower(strings.TrimSpace(ex.ExerciseName))],
			blockTarget: ex.SourceBlockTarget, role: ex.Role,
			progressionKey: ex.ProgressionKey, progressionTarget: ex.ProgressionTarget,
			enforcePlannedReps: ex.EnforcePlannedReps,
		}
		maxTgt, tgtReps := 0.0, 0
		bw := isBodyweightExercise(ex.ExerciseName)
		for si, st := range ex.Sets {
			// targetWeightKg is bodyweight-INCLUSIVE total for bodyweight lifts;
			// store the external added weight (total-bw) as the editable value and
			// keep the total for display.
			total := float64(st.TargetWeightKg)
			w, setTotal := total, 0.0
			if bw {
				w = bwExternalFromTotal(total, l.bodyweight)
				if l.bodyweight > 0 {
					setTotal = round2(l.bodyweight + w)
				}
			}
			setNumber := st.SetNumber
			if setNumber <= 0 {
				setNumber = si + 1
			}
			g.sets = append(g.sets, setEntry{
				weight: trimNum(w), reps: "", tgtReps: st.Reps, total: setTotal, amrap: st.Amrap,
				prescribed: true,
				setNumber:  setNumber, originalMeta: cloneSetMetaIfPresent(st.Meta),
			})
			if total >= maxTgt {
				maxTgt, tgtReps = total, st.Reps
			}
		}
		if len(g.sets) == 0 {
			g.sets = []setEntry{{}}
		}
		if maxTgt > 0 {
			g.tgt = fmt.Sprintf("%s×%d", trimNum(maxTgt), tgtReps)
		}
		groups = append(groups, g)
	}
	if len(groups) == 0 {
		return
	}
	l.groups, l.gi, l.si, l.col = groups, 0, 0, colWeight
	l.undo = nil
	l.status, l.statusErr = theme.GlyphDone+" 플랜 세션 로드됨", false
}

// keepDoneOnly drops not-done sets (and now-empty groups) so the saved session
// stays on screen as just the completed work.
func (l *Log) keepDoneOnly() {
	var groups []exGroup
	for _, g := range l.groups {
		var sets []setEntry
		for _, s := range g.sets {
			if s.done {
				sets = append(sets, s)
			}
		}
		if len(sets) > 0 {
			g.sets = sets
			groups = append(groups, g)
		}
	}
	l.groups, l.gi, l.si, l.col = groups, 0, 0, colWeight
}
