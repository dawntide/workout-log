package ui

// log.go — 오늘 버퍼(Log)의 진입점: 모델 구조체 + Screen 인터페이스 메서드 + Update 디스패처.
// 순수 헬퍼는 log_model.go, Tea 커맨드는 log_commands.go, 키 처리·변이는 log_update.go,
// 렌더링은 log_view.go (god-component 분해 3단계).

import (
	"fmt"
	"reflect"
	"strings"
	"time"

	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// Log is the today buffer: exercises grouped (a section header per exercise),
// each holding its sets. Navigate sets with j/k, cells (weight/reps) with h/l,
// edit inline in INSERT. `e` starts a new exercise.
type Log struct {
	client             *api.Client
	drafts             draftStore // crash-recovery persistence for unsaved sets (nil = off)
	ownerID            string     // authenticated owner of the persisted draft
	groups             []exGroup
	gi, si             int // active group / set index
	col                logCol
	editing            bool
	target             editTarget
	edit               textinput.Model
	saving             bool
	saveUncertain      bool              // prior POST outcome unknown; next s reconciles before any retry
	clientMutationID   string            // stable POST identity; server deduplicates retries across crashes/timeouts
	editID             string            // non-empty when editing a past log (saves via PATCH)
	performedAt        time.Time         // preserved on edit; zero = now (new log)
	planName           string            // active plan/program name for today's session header
	sessionKey         string            // generated-session key (e.g. "C2W6D1") for the header label
	planID             string            // active plan id, for session overrides (보강/교체)
	generatedSessionID string            // canonical log↔generated-session identity
	genericDirty       bool              // unsaved non-REF5 input; blocks destructive buffer replacement
	ref5               *ref5SessionState // REF5 start gate / frozen-session identity (nil for generic logs)
	ref5Progress       ref5WindowProgressState
	pendAccsry         string // accessory exercise awaiting its sets input (override flow)
	pendBlock          string // block target awaiting its replacement exercise (override flow)
	pendingOverride    bool   // server override in flight; locks/re-correlates Today
	overridePlanID     string
	bodyweight         float64       // user bodyweight (kg) for bodyweight-exercise load math
	load               loadState     // boot-time auto-load of today's session
	undo               *undoSnapshot // last delete, restorable with `u`
	// v0.5.1 피드백: 세션 태그(스냅샷 승격 메타)와 저장 직후 판정 라인(서버 조립 문구).
	amrapDeferred bool     // 오늘 AMRAP 보류(연속일) — 헤더 태그
	lightBlock    bool     // 라이트(회복) 블록 — 헤더 태그
	feedback      []string // 저장 응답의 판정 카드/배너 라인(styled) — 다음 로드/편집 시 소거
	status        string
	statusErr     bool
	w, h          int
}

// NewLog starts in loadPending so the very first render shows "loading today's
// session" rather than the empty-canvas hint while autoloadCmd runs.
func NewLog(client *api.Client) Log { return Log{client: client, load: loadPending} }

// withDrafts enables crash-recovery draft persistence (frame wiring; tests use
// the zero value = disabled).
func (l Log) withDrafts(d draftStore) Log {
	l.drafts = d
	return l
}

func (l Log) withOwner(ownerID string) Log {
	l.ownerID = ownerID
	return l
}

func (l Log) Editing() bool { return l.editing }
func (l Log) Init() tea.Cmd { return autoloadCmd(l.client, l.drafts, l.ownerID) }

func (l Log) Mode() Mode {
	switch {
	case l.saving:
		return Mode{Label: "SAVING", Tone: theme.Amber}
	case l.saveUncertain:
		return Mode{Label: "VERIFY", Tone: theme.Amber}
	case l.ref5 != nil && l.ref5.Phase == ref5Starting && l.ref5.StartUncertain && !l.ref5.StartRequestInFlight:
		return Mode{Label: "VERIFY", Tone: theme.Amber}
	case l.pendingOverride:
		return Mode{Label: "SYNC", Tone: theme.Amber}
	case l.editing:
		return Mode{Label: "INSERT", Tone: theme.Amber}
	case l.ref5 != nil && l.ref5.Phase == ref5Previewing:
		return Mode{Label: "PREVIEW", Tone: theme.Cyan}
	case l.ref5 != nil && l.ref5.Phase == ref5PreviewReady:
		return Mode{Label: "REVIEW", Tone: theme.Cyan}
	case l.ref5 != nil && l.ref5.Phase == ref5Starting:
		return Mode{Label: "STARTING", Tone: theme.Amber}
	case l.ref5 != nil && l.ref5.Phase == ref5Decide:
		return Mode{Label: "REF5", Tone: theme.Cyan}
	case l.load == loadPending:
		return Mode{Label: "LOADING", Tone: theme.Cyan}
	default:
		return ModeNormal
	}
}

func (l Log) Context() string {
	if l.ref5 != nil && !l.ref5.active() {
		return "session decision"
	}
	if l.gi >= len(l.groups) {
		return ""
	}
	g := l.groups[l.gi]
	if strings.TrimSpace(g.name) == "" {
		return ""
	}
	return fmt.Sprintf("%s %d/%d", truncate(g.name, 12), l.si+1, len(g.sets))
}

func (l Log) StatusRight() string {
	n := l.doneCount()
	if l.ref5 != nil && l.ref5.active() {
		total := 0
		for _, g := range l.groups {
			total += len(g.sets)
		}
		return fmt.Sprintf("%d/%d sets", n, total)
	}
	if n == 0 {
		return ""
	}
	return fmt.Sprintf("%d set%s", n, plural(n))
}

func (l Log) Hints() []hintItem {
	if l.editing {
		if l.ref5 != nil && l.ref5.active() {
			return []hintItem{{"⏎", "reps완료"}, {"esc", "취소"}}
		}
		return []hintItem{{"⏎", "다음"}, {"tab", "셀"}, {"esc", "취소"}}
	}
	if l.saveUncertain {
		if l.ref5 != nil && l.ref5.active() {
			return []hintItem{{"s", "동일저장재시도"}}
		}
		return []hintItem{{"s", "저장확인"}, {"D", "입력폐기"}}
	}
	if l.ref5 != nil {
		switch l.ref5.Phase {
		case ref5Decide:
			return []hintItem{{"p", "미리보기"}, {"e", "입력"}, {"esc", "취소"}}
		case ref5Previewing:
			return []hintItem{{"esc", "취소"}}
		case ref5PreviewReady:
			return []hintItem{{"s/⏎", "세션시작"}, {"e", "입력"}, {"p", "새로보기"}, {"esc", "취소"}}
		case ref5Starting:
			if l.ref5.StartUncertain && !l.ref5.StartRequestInFlight {
				return []hintItem{{"s/⏎", "동일시작재시도"}}
			}
			return nil
		case ref5Active:
			h := []hintItem{{"i/⏎", "reps"}, {"x", "계획완료"}, {"t", "종료"}, {"s", "저장"}}
			if l.editID != "" {
				h = append(h, hintItem{"n", "새세션"})
			}
			return h
		}
	}
	h := []hintItem{{"i", "편집"}, {"e", "운동"}, {"s", "저장"}}
	if l.genericDirty {
		h = append(h, hintItem{"D", "입력폐기"})
	}
	if l.planID != "" && l.sessionKey != "" {
		h = append(h, hintItem{"a", "보강"}, hintItem{"c", "교체"})
	}
	return h
}

func (l Log) doneCount() int {
	n := 0
	for _, g := range l.groups {
		for _, s := range g.sets {
			if s.done {
				n++
			}
		}
	}
	return n
}

func (l Log) Update(msg tea.Msg) (Screen, tea.Cmd) {
	switch m := msg.(type) {
	case tea.WindowSizeMsg:
		l.w, l.h = m.Width, m.Height
		return l, nil
	case saveResultMsg:
		l.saving = false
		verb := "저장"
		if m.edited {
			verb = "수정"
		}
		if m.retryReady {
			l.saveUncertain = false
			l.status, l.statusErr = "서버에 저장되지 않은 것을 확인했습니다 · s로 다시 저장", true
			l.persistDraft()
			return l, nil
		}
		if m.err != nil {
			l.saveUncertain = m.uncertain
			if m.uncertain {
				l.status, l.statusErr = verb+" 결과를 확인할 수 없습니다 · s로 서버 상태 확인", true
				l.persistDraft()
				return l, nil
			}
			l.status, l.statusErr = verb+" 실패: "+humanizeAuthErr(m.err), true
			l.persistDraft()
			return l, nil
		}
		// Keep the saved session on screen (done sets only) and switch to PATCH,
		// so it reads as "today's record" instead of a blank canvas; re-saving
		// edits the same log.
		l.status, l.statusErr = summarizeSaved(l.groups, m.detail, m.edited), false
		if m.refreshErr != nil {
			l.status += " · 상세 새로고침 실패 (저장은 완료됨)"
		}
		l.feedback = feedbackLines(m.feedback)
		l.keepDoneOnly()
		if m.savedID != "" {
			l.editID = m.savedID
		} else if m.detail != nil {
			l.editID = m.detail.ID
		}
		l.performedAt = m.performedAt
		if l.ref5 != nil {
			l.ref5.Dirty = false
		}
		l.genericDirty = false
		l.saveUncertain = false
		l.clientMutationID = ""
		l.load, l.undo = loadIdle, nil
		l.clearDraft() // 서버 상태 == 버퍼 — draft는 역할 종료
		if l.ref5 != nil && l.planID != "" {
			return l, l.beginRef5WindowStatusLoad(l.planID)
		}
		return l, nil
	case editLogMsg:
		if l.hasBlockingReplacement() {
			l.status, l.statusErr = "저장하지 않은 Today 입력 또는 진행 중인 저장을 먼저 완료하세요", true
			return l, nil
		}
		l.amrapDeferred, l.lightBlock, l.feedback = false, false, nil
		l.clearRef5WindowStatus()
		l.loadForEdit(m)
		if l.ref5 != nil && l.planID != "" {
			return l, l.beginRef5WindowStatusLoad(l.planID)
		}
		return l, nil
	case ref5PlanPreparedMsg:
		if l.load != loadPending || l.hasBlockingRef5Work() || len(l.groups) != 0 ||
			l.editID != "" || l.generatedSessionID != "" || l.ref5 != nil {
			return l, nil
		}
		if m.plan.ID == "" {
			l.status, l.statusErr = "REF5 플랜 정보가 없습니다", true
			return l, nil
		}
		if l.planID != "" && l.planID != m.plan.ID {
			return l, nil
		}
		progressCmd := l.beginRef5WindowStatusLoad(m.plan.ID)
		l.load = loadIdle
		l.planID, l.planName = m.plan.ID, m.plan.Name
		if m.err != nil {
			next, cmd := l.beginRef5Start(m.plan, m.bodyweight)
			next.status, next.statusErr = "미완료 세션 확인 실패: "+humanizeAuthErr(m.err), true
			return next, tea.Batch(cmd, progressCmd)
		}
		if len(m.sessions) == 0 {
			next, cmd := l.beginRef5Start(m.plan, m.bodyweight)
			return next, tea.Batch(cmd, progressCmd)
		}
		l.groups, l.planID, l.planName = nil, m.plan.ID, m.plan.Name
		l.ref5 = newRef5StartState(m.plan, m.bodyweight, time.Now())
		l.ref5.Resume = make(map[string]api.GeneratedSession, len(m.sessions))
		for _, session := range m.sessions {
			l.ref5.Resume[session.ID] = session
		}
		l.status, l.statusErr = fmt.Sprintf("미완료 REF5 세션 %d개 · 이어하기 또는 새 시작", len(m.sessions)), false
		next, cmd := l.openRef5ResumePicker()
		return next, tea.Batch(cmd, progressCmd)
	case ref5WindowStatusLoadedMsg:
		if m.planID == "" || m.planID != l.planID || m.planID != l.ref5Progress.planID ||
			m.requestID != l.ref5Progress.requestID {
			return l, nil
		}
		l.ref5Progress.loading = false
		if m.err != nil {
			l.ref5Progress.err = humanizeAuthErr(m.err)
			return l, nil
		}
		if m.status == nil {
			l.ref5Progress.err = "REF5 판정창 상태가 없습니다"
			return l, nil
		}
		l.ref5Progress.status, l.ref5Progress.err = m.status, ""
		return l, nil
	case ref5PreviewResultMsg:
		if l.ref5 == nil || l.ref5.Phase != ref5Previewing ||
			m.planID != l.ref5.Plan.ID || (l.planID != "" && m.planID != l.planID) ||
			m.signature != l.ref5.Start.signature() {
			return l, nil
		}
		if m.err != nil {
			l.ref5.Phase = ref5Decide
			l.status, l.statusErr = "미리보기 실패: "+humanizeAuthErr(m.err), true
			return l, nil
		}
		if m.session == nil || !m.session.Snapshot.IsRef5() {
			l.ref5.Phase = ref5Decide
			l.status, l.statusErr = "서버가 REF5 미리보기를 반환하지 않았습니다", true
			return l, nil
		}
		l.ref5.Preview, l.ref5.PreviewSignature = m.session, m.signature
		l.ref5.Phase = ref5PreviewReady
		l.status, l.statusErr = "미리보기는 상태를 변경하지 않음 · s/Enter로 첫 SQ 시작 확정", false
		return l, nil
	case ref5StartConfirmedMsg:
		if l.ref5 == nil || l.ref5.Phase != ref5PreviewReady ||
			m.planID != l.ref5.Plan.ID || (l.planID != "" && m.planID != l.planID) ||
			m.signature != m.values.signature() || m.signature != l.ref5.Start.signature() ||
			!l.ref5.previewCurrent() {
			return l, nil
		}
		l.ref5.Phase = ref5Starting
		l.ref5.StartUncertain = true
		l.ref5.StartRequestInFlight = true
		l.status, l.statusErr = "첫 SQ 시작 확정 중…", false
		if err := l.persistDraft(); err != nil {
			l.ref5.Phase = ref5PreviewReady
			l.ref5.StartUncertain = false
			l.ref5.StartRequestInFlight = false
			l.status, l.statusErr = "REF5 시작 보류 · 임시 저장 실패: "+err.Error(), true
			return l, nil
		}
		return l, startRef5Cmd(l.client, m.planID, m.values)
	case ref5StartResultMsg:
		if l.ref5 == nil || l.ref5.Phase != ref5Starting ||
			m.planID != l.ref5.Plan.ID || (l.planID != "" && m.planID != l.planID) ||
			m.signature != m.values.signature() || m.signature != l.ref5.Start.signature() {
			return l, nil
		}
		l.ref5.StartRequestInFlight = false
		if m.err != nil {
			if writeOutcomeUncertain(m.err) {
				l.ref5.StartUncertain = true
				l.status, l.statusErr = "REF5 시작 결과를 확인할 수 없습니다 · s로 동일 사건 재시도", true
				l.persistDraft()
				return l, nil
			}
			l.ref5.Phase = ref5PreviewReady
			l.ref5.StartUncertain = false
			l.status, l.statusErr = "REF5 시작 실패: "+humanizeAuthErr(m.err)+" · 입력을 확인해 다시 시작", true
			l.persistDraft()
			return l, nil
		}
		if err := l.loadRef5Session(m.session); err != nil {
			l.ref5.StartUncertain = true
			l.status, l.statusErr = err.Error()+" · s로 동일 사건 재시도", true
			l.persistDraft()
			return l, nil
		}
		return l, nil
	case ref5ResumeResultMsg:
		if l.ref5 == nil || l.ref5.Phase != ref5Starting ||
			m.planID != l.ref5.Plan.ID || (l.planID != "" && m.planID != l.planID) ||
			m.sessionID == "" || m.sessionID != l.ref5.PendingSessionID {
			return l, nil
		}
		if m.err != nil {
			l.ref5.PendingSessionID = ""
			l.ref5.Phase = ref5Decide
			l.status, l.statusErr = "REF5 재개 실패: "+humanizeAuthErr(m.err), true
			return l, nil
		}
		if m.session == nil || m.session.ID != m.sessionID ||
			(m.session.PlanID != "" && m.session.PlanID != m.planID) {
			l.ref5.PendingSessionID = ""
			l.ref5.Phase = ref5Decide
			l.status, l.statusErr = "REF5 재개 응답의 세션 ID가 일치하지 않습니다", true
			return l, nil
		}
		l.ref5.PendingSessionID = ""
		if err := l.loadRef5Session(m.session); err != nil {
			l.ref5.Phase = ref5Decide
			l.status, l.statusErr = err.Error(), true
		}
		return l, nil
	case ref5CloseExerciseMsg:
		if l.ref5 != nil && l.ref5.active() && m.gi >= 0 && m.gi < len(l.groups) && l.groups[m.gi].ref5 != nil {
			l.groups[m.gi].ref5.TerminationReason = m.reason
			l.ref5.Dirty = true
			if m.fillZero {
				for i := range l.groups[m.gi].sets {
					if !l.groups[m.gi].sets[i].done {
						l.groups[m.gi].sets[i].reps = "0"
						l.groups[m.gi].sets[i].done = true
					}
				}
			}
			l.persistDraft()
			l.status, l.statusErr = theme.GlyphDone+" "+m.reason+" · INVALID", false
		}
		return l, nil
	case ref5SaveConfirmedMsg:
		if l.saving || l.ref5 == nil || !l.ref5.active() || l.ref5.Session == nil {
			return l, nil
		}
		if m.planID != l.ref5.Plan.ID || m.sessionID != l.ref5.Session.ID ||
			m.completionEventID != l.ref5.CompletionEventID || m.editID != l.editID {
			l.status, l.statusErr = "REF5 저장 확인이 만료됨 · s로 다시 확인", true
			return l, nil
		}
		current, err := buildRef5SaveRequest(l)
		if err != nil {
			l.status, l.statusErr = err.Error(), true
			return l, nil
		}
		if !reflect.DeepEqual(current, m.request) {
			l.status, l.statusErr = "확인 후 REF5 입력이 변경됨 · s로 다시 확인", true
			return l, nil
		}
		if l.editID == "" {
			// The completion event and exact reps/reasons are now immutable until a
			// response proves whether this first POST committed.
			wasUncertain := l.saveUncertain
			l.saveUncertain = true
			if err := l.persistDraft(); err != nil {
				l.saveUncertain = wasUncertain
				l.status, l.statusErr = "REF5 저장 보류 · 임시 저장 실패: "+err.Error(), true
				return l, nil
			}
		}
		l.saving, l.status, l.statusErr = true, "", false
		return l, saveRef5Cmd(l.client, m.request, m.editID)
	case genericDiscardConfirmedMsg:
		planID := l.planID
		l.resetForSessionLoad()
		if planID != "" {
			l.planID, l.load = planID, loadPending
			l.status, l.statusErr = "입력 폐기됨 · 플랜 세션 다시 불러오는 중…", false
			return l, loadSessionCmd(l.client, planID)
		}
		l.load = loadNoPlan
		l.status, l.statusErr = "입력 폐기됨", false
		return l, nil
	case draftRestoredMsg:
		// Boot restoration is one-shot and only owns a pristine loading buffer.
		// Any plan choice or user input made while the disk/network command was
		// in flight wins over that late result.
		if l.load != loadPending || len(l.groups) != 0 || l.editID != "" ||
			l.planID != "" || l.generatedSessionID != "" || l.ref5 != nil {
			return l, nil
		}
		l.loadFromDraft(m.draft)
		if l.ref5 != nil && l.planID != "" {
			return l, l.beginRef5WindowStatusLoad(l.planID)
		}
		return l, nil
	case pickedMsg:
		if l.load == loadPending {
			return l, nil
		}
		if next, cmd, handled := l.handleRef5Picked(m); handled {
			return next, cmd
		}
		switch m.tag {
		case "exercise":
			if strings.TrimSpace(m.value) != "" {
				l.groups = append(l.groups, exGroup{name: m.value, sets: []setEntry{{setNumber: 1, isExtra: true}}})
				l.gi, l.si, l.col = len(l.groups)-1, 0, colWeight
				l.persistDraft()
				return l.beginEdit(editCell)
			}
		case "accessory":
			if name := strings.TrimSpace(m.value); name != "" {
				l.pendAccsry = name
				l.status, l.statusErr = "보강: "+name, false
				// second step: free-text sets prompt (an item-less picker returns
				// whatever the user types).
				return l, func() tea.Msg {
					return openPickerMsg{prompt: "세트 (예 3x10@20) ", tag: "accessory-sets", owner: vToday, owned: true}
				}
			}
		case "accessory-sets":
			name := l.pendAccsry
			l.pendAccsry = ""
			if name == "" {
				return l, nil
			}
			l.pendingOverride, l.overridePlanID = true, l.planID
			l.status, l.statusErr = "보강 추가 중…", false
			return l, addAccessoryCmd(l.client, l.planID, l.sessionKey, name, parseAccessorySets(m.value))
		case "replace":
			name, bt := strings.TrimSpace(m.value), l.pendBlock
			l.pendBlock = ""
			if name == "" || bt == "" {
				return l, nil
			}
			l.pendingOverride, l.overridePlanID = true, l.planID
			l.status, l.statusErr = "교체 중…", false
			return l, replaceExerciseCmd(l.client, l.planID, l.sessionKey, bt, name)
		}
		return l, nil
	case overrideDoneMsg:
		if !l.pendingOverride || m.planID == "" || m.planID != l.overridePlanID || m.planID != l.planID {
			return l, nil
		}
		l.pendingOverride, l.overridePlanID = false, ""
		if m.err != nil {
			l.status, l.statusErr = "변경 실패: "+humanizeAuthErr(m.err), true
			return l, nil
		}
		l.resetForSessionLoad()
		l.planID = m.planID
		l.status, l.statusErr = theme.GlyphDone+" "+m.desc+" — 세션 재생성", false
		l.load = loadPending
		return l, loadSessionCmd(l.client, m.planID)
	case planActivatedMsg:
		if l.hasBlockingReplacement() {
			l.status, l.statusErr = "저장하지 않은 Today 입력 또는 진행 중인 저장을 먼저 완료하세요", true
			return l, nil
		}
		l.resetForSessionLoad()
		l.load = loadPending
		l.planID, l.planName = m.id, m.name
		if m.plan.IsRef5() {
			l.status, l.statusErr = "미완료 REF5 세션 확인 중…", false
			return l, prepareRef5PlanCmd(l.client, m.plan)
		}
		l.ref5 = nil
		return l, loadSessionCmd(l.client, m.id)
	case sessionLoadedMsg:
		// Generate/autoload results are one-shot and only own the pristine buffer
		// reserved for that request. Late/duplicate results must never replace
		// terminal input or resurrect a previous edit identity.
		if l.load != loadPending || len(l.groups) != 0 || l.editID != "" ||
			l.generatedSessionID != "" || l.ref5 != nil || l.genericDirty {
			return l, nil
		}
		if m.planID != "" && l.planID != "" && m.planID != l.planID {
			return l, nil
		}
		l.load = loadIdle
		if m.err != nil {
			l.status, l.statusErr = "세션 로드 실패: "+humanizeAuthErr(m.err), true
			return l, nil
		}
		if m.noPlan {
			l.load = loadNoPlan
			return l, nil
		}
		l.planName, l.sessionKey, l.planID = m.planName, m.sessionKey, m.planID
		l.generatedSessionID = m.generatedSessionID
		l.editID, l.performedAt = "", time.Time{}
		l.ref5 = nil
		l.bodyweight = m.bodyweight
		l.amrapDeferred, l.lightBlock = false, false
		if m.snapshot != nil {
			l.amrapDeferred, l.lightBlock = m.snapshot.AmrapDeferred, m.snapshot.LightBlockMode
		}
		l.feedback = nil
		l.loadSnapshot(m.snapshot, m.prev)
		l.genericDirty = false
		l.clearDraft()
		return l, nil
	case tea.KeyPressMsg:
		if l.editing {
			nl, cmd := l.updateEditing(m)
			return nl, cmd
		}
		nl, cmd := l.updateNormal(m)
		return nl, cmd
	}
	if l.editing {
		var cmd tea.Cmd
		l.edit, cmd = l.edit.Update(msg)
		return l, cmd
	}
	return l, nil
}
