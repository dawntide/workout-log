package ui

import (
	"context"
	"image/color"
	"strconv"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

func logoutCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		return loggedOutMsg{err: c.Logout(context.Background())}
	}
}

// ViewKind identifies a buffer. There is no tab bar; views are switched via the
// space-leader goto menu, the `:` command palette, or 1-5 accelerators.
type ViewKind int

const (
	vToday ViewKind = iota
	vStats
	vHistory
	vPrograms
	vSettings
	vExercises
)

var viewMeta = map[ViewKind]struct{ key, name string }{
	vToday:     {"t", "today"},
	vStats:     {"s", "stats"},
	vHistory:   {"h", "history"},
	vPrograms:  {"p", "programs"},
	vSettings:  {",", "settings"},
	vExercises: {"x", "exercises"},
}

var gotoOrder = []ViewKind{vToday, vStats, vHistory, vPrograms, vSettings, vExercises}

// Mode is the statusline mode label and its tone color.
type Mode struct {
	Label string
	Tone  color.Color
}

// ModeNormal is the idle auto-label.
var ModeNormal = Mode{Label: "NORMAL", Tone: theme.Dim}

// hintItem is one key/label pair for the bottom hint bar. Screens return these
// as data (not a pre-rendered string) so the frame can choose a full rendering
// (key + 라벨) or a keys-only compaction when the bar would overflow a narrow
// phone terminal — without re-deriving the keys from styled text.
type hintItem struct{ key, label string }

// globalHints are the everywhere keys appended to every screen's local hints.
// They sit at the right of the bar, so under the old hard-truncation they were
// the first to be cut — exactly the keys (goto/command/help) a newcomer needs.
var globalHints = []hintItem{{"space", "이동"}, {":", "명령"}, {"?", "키맵"}}

// hintsFull renders key + dim label chips joined by two spaces.
func hintsFull(items []hintItem) string {
	parts := make([]string, len(items))
	for i, it := range items {
		parts[i] = hint(it.key, it.label)
	}
	return strings.Join(parts, "  ")
}

// hintsKeys renders keys only (no labels) joined by single spaces — the compact
// fallback when the full bar exceeds the terminal width. The full labels stay
// discoverable via the ? keymap overlay.
func hintsKeys(items []hintItem) string {
	parts := make([]string, len(items))
	for i, it := range items {
		parts[i] = lipgloss.NewStyle().Foreground(theme.Cyan).Bold(true).Render(it.key)
	}
	return strings.Join(parts, " ")
}

type tickMsg time.Time

func tick() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

type overlayKind int

const (
	overlayNone overlayKind = iota
	overlayGoto
	overlayPicker
	overlayHelp
	overlayConfirm
)

// confirmMsg asks the frame to show a y/n prompt; onYes runs when confirmed.
type confirmMsg struct {
	prompt        string
	onYes         tea.Cmd
	onNo          tea.Cmd
	onCancel      tea.Cmd
	yesLabel      string
	noLabel       string
	cancelLabel   string
	planID        string // destructive action target; protects the plan owning Today work
	logID         string // destructive action target; protects the log being edited
	replacesData  bool   // confirmed command atomically replaces the account dataset
	accountDelete bool   // confirmed command irreversibly deletes the authenticated account
}

// openPickerMsg lets a view request a tagged fuzzy picker (e.g. exercise select).
type openPickerMsg struct {
	prompt  string
	tag     string
	initial string // optional pre-filled free-text value (e.g. today's bodyweight)
	items   []pickerItem
	owner   ViewKind
	owned   bool // asynchronous pickers must name the view that receives pickedMsg
}

// pickedMsg carries a tagged picker selection back to the active view.
type pickedMsg struct {
	tag   string
	value string
}

// planActivatedMsg is emitted when a plan is selected active; the frame stores
// it and hands off to the today buffer (which loads the session).
type planActivatedMsg struct {
	id   string
	name string
	plan api.Plan // complete params let Today select the REF5 start gate
}

// editLogMsg asks the frame to load a past session into the today buffer for
// editing (emitted by the history buffer). The today logger saves it via PATCH.
type editLogMsg struct {
	id                 string
	performedAt        time.Time
	sets               []api.LoggedSet
	planName           string // plan/program name for the today header (may be empty)
	plan               api.Plan
	sessionKey         string // generated-session key for the header label (may be empty)
	planID             string // active plan id for overrides (may be empty)
	generatedSessionID string
	generatedSession   *api.GeneratedSession // full immutable snapshot for REF5 edit
	bodyweight         float64               // user bodyweight; only set (>0) by the boot auto-load restore path
}

// Frame is the root chrome: a pure buffer area, a bottom region (hint line, goto
// menu, or command palette), and a statusline. No tab bar, no top chrome.
type Frame struct {
	client               *api.Client
	views                map[ViewKind]Screen
	active               ViewKind
	seen                 map[ViewKind]bool
	w, h                 int
	now                  time.Time
	overlay              overlayKind
	gotoSel              int
	picker               picker
	pickerOwner          ViewKind
	flash                string
	confirmPrompt        string
	confirmCmd           tea.Cmd
	confirmNoCmd         tea.Cmd
	confirmCancelCmd     tea.Cmd
	confirmYesLabel      string
	confirmNoLabel       string
	confirmCancelLabel   string
	confirmReplacesData  bool
	confirmAccountDelete bool
	confirmLogout        bool
	confirmPlanID        string
	confirmLogID         string
	pendingDeletePlanID  string
	pendingDeleteLogID   string
	deletedLogIDs        map[string]struct{}
	activePlanID         string
	activePlanName       string
	importing            bool
	importSeq            uint64
	pendingImportID      uint64
	deletingAccount      bool
	loggingOut           bool
}

// NewFrame builds the frame booted into the today (workout) buffer. drafts
// enables the today buffer's crash-recovery persistence (nil = disabled).

func NewFrame(client *api.Client, drafts draftStore, ownerIDs ...string) Frame {
	ownerID := ""
	if len(ownerIDs) > 0 {
		ownerID = ownerIDs[0]
	}
	return Frame{
		client: client,
		now:    time.Now(),
		active: vToday,
		views: map[ViewKind]Screen{
			vToday:     NewLog(client).withDrafts(drafts).withOwner(ownerID),
			vStats:     NewStats(client),
			vHistory:   NewHistory(client),
			vPrograms:  NewPrograms(client),
			vSettings:  NewSettings(client),
			vExercises: NewExercises(client),
		},
		seen:          map[ViewKind]bool{vToday: true},
		deletedLogIDs: make(map[string]struct{}),
	}
}

func (f Frame) Init() tea.Cmd {
	return tea.Batch(tick(), f.views[f.active].Init())
}

func (f Frame) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		f.w, f.h = msg.Width, msg.Height
		for k, v := range f.views {
			nv, _ := v.Update(msg)
			f.views[k] = nv
		}
		return f, nil
	case tickMsg:
		f.now = time.Time(msg)
		nv, cmd := f.views[f.active].Update(msg)
		f.views[f.active] = nv
		return f, tea.Batch(tick(), cmd)
	case confirmMsg:
		if msg.accountDelete {
			if today, ok := f.views[vToday].(Log); ok && today.hasUnsettledServerMutation() {
				today.status, today.statusErr = "저장 또는 시작 결과를 먼저 확인한 뒤 계정을 삭제하세요", true
				f.views[vToday], f.active = today, vToday
				return f, nil
			}
		}
		if today, ok := f.views[vToday].(Log); ok && today.hasBlockingReplacement() &&
			((msg.planID != "" && msg.planID == today.planID) ||
				(msg.logID != "" && msg.logID == today.editID)) {
			today.status, today.statusErr = "저장하지 않은 Today 입력이 있어 삭제할 수 없습니다", true
			f.views[vToday], f.active = today, vToday
			return f, nil
		}
		f.confirmPrompt, f.confirmCmd, f.confirmNoCmd = msg.prompt, msg.onYes, msg.onNo
		f.confirmCancelCmd = msg.onCancel
		f.confirmYesLabel, f.confirmNoLabel, f.confirmCancelLabel = msg.yesLabel, msg.noLabel, msg.cancelLabel
		f.confirmReplacesData, f.confirmAccountDelete = msg.replacesData, msg.accountDelete
		f.confirmPlanID, f.confirmLogID, f.overlay = msg.planID, msg.logID, overlayConfirm
		return f, nil
	case openPickerMsg:
		owner := f.active
		if msg.owned {
			owner, f.active = msg.owner, msg.owner
		}
		f.picker = newPicker(msg.prompt, msg.tag, msg.items)
		f.pickerOwner = owner
		if msg.initial != "" {
			f.picker.input.SetValue(msg.initial)
		}
		f.overlay = overlayPicker
		return f, f.picker.input.Focus()
	case exportDoneMsg:
		if msg.err != nil {
			f.flash = "내보내기 실패: " + msg.err.Error()
		} else {
			f.flash = "저장됨: " + msg.path
		}
		return f, nil
	case importDryRunMsg:
		if msg.requestID != f.pendingImportID {
			return f, nil
		}
		if msg.err != nil {
			f.pendingImportID = 0
			f.flash = "가져오기 실패: " + humanizeImportErr(msg.err)
			return f, nil
		}
		if today, ok := f.views[vToday].(Log); ok && today.hasBlockingReplacement() {
			f.pendingImportID = 0
			f.flash = "가져오기 전에 Today 입력을 저장하거나 D로 폐기하세요"
			f.active = vToday
			return f, nil
		}
		f.confirmPrompt = "기존 데이터 삭제 후 가져옴 (" + summarizeImport(msg.summary) + ")"
		f.confirmCmd = importReplaceCmd(f.client, msg.data, msg.requestID)
		f.confirmReplacesData, f.importing = true, false
		f.overlay = overlayConfirm
		return f, nil
	case importDoneMsg:
		if msg.requestID != f.pendingImportID {
			return f, nil
		}
		f.pendingImportID = 0
		f.importing = false
		if msg.err != nil {
			f.flash = "가져오기 실패: " + humanizeImportErr(msg.err)
		} else {
			today, _ := f.views[vToday].(Log)
			today.clearDraft()
			next := NewFrame(f.client, today.drafts, today.ownerID)
			next.w, next.h, next.now = f.w, f.h, f.now
			if next.w > 0 && next.h > 0 {
				fm, _ := next.Update(tea.WindowSizeMsg{Width: next.w, Height: next.h})
				next = fm.(Frame)
			}
			next.flash = "가져옴: " + summarizeImport(msg.summary)
			return next, next.views[vToday].Init()
		}
		return f, nil
	case planActivatedMsg:
		if today, ok := f.views[vToday].(Log); ok && today.hasBlockingReplacement() {
			// Programs optimistically moves its marker on Enter. Restore the
			// session-owning plan when Today rejects the replacement, otherwise
			// the UI would claim a different plan is active while preserving an
			// in-flight save or immutable in-progress REF5 buffer.
			if programs, ok := f.views[vPrograms].(Programs); ok {
				programs.activeID = today.planID
				f.views[vPrograms] = programs
			}
			f.active = vToday
			nv, cmd := f.views[vToday].Update(msg)
			f.views[vToday] = nv
			return f, cmd
		}
		f.activePlanID, f.activePlanName = msg.id, msg.name
		f.active = vToday
		nv, cmd := f.views[vToday].Update(msg)
		f.views[vToday] = nv
		return f, cmd
	case editLogMsg:
		if msg.id != "" {
			if msg.id == f.pendingDeleteLogID {
				return f, nil
			}
			if _, deleted := f.deletedLogIDs[msg.id]; deleted {
				return f, nil
			}
		}
		f.active = vToday
		nv, cmd := f.views[vToday].Update(msg)
		f.views[vToday] = nv
		return f, cmd
	case ref5PlanPreparedMsg:
		// This response can open the resume/start picker. Bring its owning
		// buffer forward so the eventual pickedMsg cannot land in another view.
		f.active = vToday
		nv, cmd := f.views[vToday].Update(msg)
		f.views[vToday] = nv
		return f, cmd
	case saveResultMsg, draftRestoredMsg, overrideDoneMsg, sessionLoadedMsg,
		ref5PreviewResultMsg, ref5StartConfirmedMsg, ref5StartResultMsg,
		ref5ResumeResultMsg, ref5CloseExerciseMsg, ref5SaveConfirmedMsg,
		genericDiscardConfirmedMsg:
		// Today owns these asynchronous results even when the user navigated to
		// another buffer while the request was in flight.
		nv, cmd := f.views[vToday].Update(msg)
		f.views[vToday] = nv
		return f, cmd
	case historyLoadedMsg, historyEditLoadedMsg:
		nv, cmd := f.views[vHistory].Update(msg)
		f.views[vHistory] = nv
		return f, cmd
	case logDeletedMsg:
		if f.pendingDeleteLogID != "" && msg.id != f.pendingDeleteLogID {
			return f, nil
		}
		f.pendingDeleteLogID, f.flash = "", ""
		nv, cmd := f.views[vHistory].Update(msg)
		f.views[vHistory] = nv
		if msg.err == nil {
			if msg.id != "" {
				f.deletedLogIDs[msg.id] = struct{}{}
			}
			if today, ok := f.views[vToday].(Log); ok && msg.id != "" && msg.id == today.editID {
				today.resetForSessionLoad()
				today.load = loadNoPlan
				today.status, today.statusErr = "현재 기록이 삭제됨 · 프로그램에서 세션을 다시 여세요", false
				f.views[vToday] = today
			}
		}
		return f, cmd
	case plansLoadedMsg, templatesLoadedMsg, planCreatedMsg,
		planRenamedMsg, ref5StatusLoadedMsg:
		nv, cmd := f.views[vPrograms].Update(msg)
		f.views[vPrograms] = nv
		return f, cmd
	case planDeletedMsg:
		if f.pendingDeletePlanID != "" && msg.id != f.pendingDeletePlanID {
			return f, nil
		}
		f.pendingDeletePlanID, f.flash = "", ""
		nv, cmd := f.views[vPrograms].Update(msg)
		f.views[vPrograms] = nv
		if msg.err == nil {
			if msg.id == f.activePlanID {
				f.activePlanID, f.activePlanName = "", ""
			}
			if today, ok := f.views[vToday].(Log); ok && msg.id != "" && msg.id == today.planID {
				today.resetForSessionLoad()
				today.load = loadNoPlan
				today.status, today.statusErr = "현재 플랜이 삭제됨 · 다른 프로그램을 선택하세요", false
				f.views[vToday] = today
			}
		}
		return f, cmd
	case statsBundleMsg, statsE1rmMsg, statsVolumeMsg:
		nv, cmd := f.views[vStats].Update(msg)
		f.views[vStats] = nv
		return f, cmd
	case settingsLoadedMsg, settingSavedMsg, accountInfoMsg:
		nv, cmd := f.views[vSettings].Update(msg)
		f.views[vSettings] = nv
		return f, cmd
	case accountActionMsg:
		if msg.accountDelete {
			f.deletingAccount = false
		}
		nv, cmd := f.views[vSettings].Update(msg)
		f.views[vSettings] = nv
		return f, cmd
	case exercisesLoadedMsg, exActionMsg:
		nv, cmd := f.views[vExercises].Update(msg)
		f.views[vExercises] = nv
		return f, cmd
	case tea.KeyPressMsg:
		return f.handleKey(msg)
	}
	nv, cmd := f.views[f.active].Update(msg)
	f.views[f.active] = nv
	return f, cmd
}

func (f Frame) handleKey(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if f.deletingAccount || f.loggingOut {
		return f, nil
	}
	if msg.String() == "ctrl+c" {
		return f, tea.Quit
	}
	if f.importing {
		return f, nil
	}
	if f.pendingDeletePlanID != "" || f.pendingDeleteLogID != "" {
		return f, nil
	}
	switch f.overlay {
	case overlayPicker:
		return f.handlePickerKey(msg)
	case overlayGoto:
		return f.handleGotoKey(msg)
	case overlayHelp:
		f.overlay = overlayNone // any key closes help
		return f, nil
	case overlayConfirm:
		return f.handleConfirmKey(msg)
	}
	// A view in INSERT/editing owns every key (digits, spaces in names, …).
	if f.views[f.active].Editing() {
		return f.routeKey(msg)
	}
	switch msg.String() {
	case " ":
		f.overlay, f.gotoSel, f.flash = overlayGoto, int(f.active), ""
		return f, nil
	case ":":
		f.picker = newPicker(":", "", commandItems())
		f.overlay, f.flash = overlayPicker, ""
		return f, f.picker.input.Focus()
	case "?":
		f.overlay = overlayHelp
		return f, nil
	case "q":
		return f, tea.Quit
	case "1", "2", "3", "4", "5", "6":
		if idx := int(msg.String()[0] - '1'); idx >= 0 && idx < len(gotoOrder) {
			return f.switchTo(gotoOrder[idx])
		}
	}
	return f.routeKey(msg)
}

func (f Frame) routeKey(msg tea.Msg) (tea.Model, tea.Cmd) {
	nv, cmd := f.views[f.active].Update(msg)
	f.views[f.active] = nv
	return f, cmd
}

func (f Frame) handleGotoKey(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", " ":
		f.overlay = overlayNone
		return f, nil
	case "j", "down":
		if f.gotoSel < len(gotoOrder)-1 {
			f.gotoSel++
		}
		return f, nil
	case "k", "up":
		if f.gotoSel > 0 {
			f.gotoSel--
		}
		return f, nil
	case "enter":
		f.overlay = overlayNone
		return f.switchTo(gotoOrder[f.gotoSel])
	}
	for _, vk := range gotoOrder {
		if viewMeta[vk].key == msg.String() {
			f.overlay = overlayNone
			return f.switchTo(vk)
		}
	}
	return f, nil
}

func (f Frame) handleConfirmKey(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	key := msg.String()
	if key != "y" && key != "Y" && key != "enter" && key != "n" && key != "N" && key != "esc" {
		return f, nil
	}
	if (key == "y" || key == "Y" || key == "enter") && f.confirmAccountDelete {
		if today, ok := f.views[vToday].(Log); ok && today.hasUnsettledServerMutation() {
			today.status, today.statusErr = "저장 또는 시작 결과를 먼저 확인한 뒤 계정을 삭제하세요", true
			f.views[vToday], f.active = today, vToday
			f.overlay, f.confirmCmd, f.confirmNoCmd, f.confirmCancelCmd, f.confirmPrompt = overlayNone, nil, nil, nil, ""
			f.confirmReplacesData, f.confirmAccountDelete, f.confirmLogout = false, false, false
			f.confirmYesLabel, f.confirmNoLabel, f.confirmCancelLabel = "", "", ""
			f.confirmPlanID, f.confirmLogID = "", ""
			return f, nil
		}
	}
	cmd := f.confirmCmd
	noCmd := f.confirmNoCmd
	cancelCmd := f.confirmCancelCmd
	replacesData := f.confirmReplacesData
	accountDelete := f.confirmAccountDelete
	logout := f.confirmLogout
	planID, logID := f.confirmPlanID, f.confirmLogID
	f.overlay, f.confirmCmd, f.confirmNoCmd, f.confirmCancelCmd, f.confirmPrompt = overlayNone, nil, nil, nil, ""
	f.confirmReplacesData, f.confirmAccountDelete, f.confirmLogout = false, false, false
	f.confirmYesLabel, f.confirmNoLabel, f.confirmCancelLabel = "", "", ""
	f.confirmPlanID, f.confirmLogID = "", ""
	switch key {
	case "y", "Y", "enter":
		if replacesData {
			f.importing, f.flash = true, "가져오는 중…"
		}
		if planID != "" {
			f.pendingDeletePlanID, f.flash = planID, "플랜 삭제 중…"
		}
		if logID != "" {
			f.pendingDeleteLogID, f.flash = logID, "기록 삭제 중…"
		}
		if accountDelete {
			f.deletingAccount, f.flash = true, "계정 삭제 중…"
		}
		if logout {
			f.loggingOut, f.flash = true, "로그아웃 중…"
		}
		return f, cmd
	case "n", "N":
		if replacesData {
			f.pendingImportID = 0
		}
		return f, noCmd
	default: // esc closes without treating the prompt as an explicit "no"
		if replacesData {
			f.pendingImportID = 0
		}
		return f, cancelCmd
	}
}

func (f Frame) handlePickerKey(msg tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		f.overlay = overlayNone
		return f, nil
	case "up", "ctrl+k", "ctrl+p":
		if f.picker.sel > 0 {
			f.picker.sel--
		}
		return f, nil
	case "down", "ctrl+j", "ctrl+n":
		if f.picker.sel < len(f.picker.filtered())-1 {
			f.picker.sel++
		}
		return f, nil
	case "enter":
		items := f.picker.filtered()
		tag := f.picker.tag
		f.overlay = overlayNone
		val := strings.TrimSpace(f.picker.input.Value())
		if len(items) > 0 && f.picker.sel < len(items) {
			val = items[f.picker.sel].value
		}
		if tag == "" {
			return f.runCommand(val)
		}
		owner := f.pickerOwner
		nv, cmd := f.views[owner].Update(pickedMsg{tag: tag, value: val})
		f.views[owner] = nv
		return f, cmd
	}
	var cmd tea.Cmd
	f.picker.input, cmd = f.picker.input.Update(msg)
	if f.picker.sel >= len(f.picker.filtered()) {
		f.picker.sel = 0
	}
	return f, cmd
}

func (f Frame) runCommand(cmd string) (tea.Model, tea.Cmd) {
	word := cmd
	if i := strings.IndexByte(cmd, ' '); i >= 0 {
		word = cmd[:i]
	}
	switch word {
	case "":
		return f, nil
	case "q", "quit":
		return f, tea.Quit
	case "logout", "signout":
		if today, ok := f.views[vToday].(Log); ok {
			if today.saving || today.pendingOverride ||
				(today.ref5 != nil && today.ref5.Phase == ref5Starting) {
				f.flash = "진행 중인 요청이 끝난 뒤 로그아웃하세요"
				return f, nil
			}
			if today.hasBlockingReplacement() {
				f.confirmPrompt = "미저장 초안은 이 계정에 보관됩니다 · 로그아웃할까요?"
				f.confirmCmd, f.confirmLogout, f.overlay = logoutCmd(f.client), true, overlayConfirm
				return f, nil
			}
		}
		f.loggingOut, f.flash = true, "로그아웃 중…"
		return f, logoutCmd(f.client)
	case "t", "today":
		return f.switchTo(vToday)
	case "s", "stats":
		return f.switchTo(vStats)
	case "h", "hist", "history", "cal":
		return f.switchTo(vHistory)
	case "p", "plan", "plans", "programs":
		return f.switchTo(vPrograms)
	case ",", "set", "settings":
		return f.switchTo(vSettings)
	case "x", "ex", "exercise", "exercises":
		return f.switchTo(vExercises)
	case "export":
		f.flash = "내보내는 중…"
		return f, exportCmd(f.client)
	case "import":
		if f.pendingImportID != 0 || f.importing {
			f.flash = "이미 가져오기를 처리 중입니다"
			return f, nil
		}
		if today, ok := f.views[vToday].(Log); ok && today.hasBlockingReplacement() {
			f.flash = "가져오기 전에 Today 입력을 저장하거나 D로 폐기하세요"
			f.active = vToday
			return f, nil
		}
		path := strings.TrimSpace(strings.TrimPrefix(cmd, word))
		if path == "" {
			f.flash = "사용법: import <파일경로>"
			return f, nil
		}
		f.importSeq++
		f.pendingImportID = f.importSeq
		f.flash = "검증 중…"
		return f, importDryRunCmd(f.client, path, f.pendingImportID)
	}
	f.flash = "알 수 없는 명령: " + word
	return f, nil
}

func (f Frame) switchTo(vk ViewKind) (tea.Model, tea.Cmd) {
	f.active, f.flash = vk, ""
	if !f.seen[vk] {
		f.seen[vk] = true
		return f, f.views[vk].Init()
	}
	return f, nil
}

// View renders the frame: buffer · region · statusline (or help · statusline).
func (f Frame) View() tea.View {
	w := f.w
	if w <= 0 {
		w = 40
	}
	h := f.h
	if h <= 0 {
		h = 24
	}
	s := f.views[f.active]

	var content string
	if f.overlay == overlayHelp {
		content = lipgloss.JoinVertical(lipgloss.Left,
			helpBody(w, h-1, f.active),
			fitLine(f.statusline(w, s), w),
		)
	} else {
		region, regionH := f.region(w, h, s)
		bodyH := h - regionH - 1
		if bodyH < 1 {
			bodyH = 1
		}
		content = lipgloss.JoinVertical(lipgloss.Left,
			s.Body(w, bodyH),
			region,
			fitLine(f.statusline(w, s), w),
		)
	}

	v := tea.NewView(content)
	v.BackgroundColor = theme.Bg
	v.AltScreen = true
	return v
}

func (f Frame) statusline(w int, s Screen) string {
	seg := lipgloss.NewStyle().Background(s.Mode().Tone).Foreground(theme.Bg).Bold(true).Render(" " + s.Mode().Label + " ")
	clock := lipgloss.NewStyle().Foreground(theme.Dim).Render(f.now.Format("15:04"))

	// The mode badge and the clock are the always-keep anchors. StatusRight (a
	// short count) joins the clock only while the badge still has room to its
	// left; otherwise it is dropped so a narrow phone width never sacrifices the
	// time to the right-edge truncation.
	right := clock
	if r := s.StatusRight(); r != "" {
		cand := lipgloss.NewStyle().Foreground(theme.Dim).Render(r) + "  " + clock
		if lipgloss.Width(seg)+2+lipgloss.Width(cand) <= w {
			right = cand
		}
	}

	var left string
	if f.flash != "" {
		left = seg + " " + lipgloss.NewStyle().Foreground(theme.Red).Render(f.flash)
	} else {
		left = seg + " " + lipgloss.NewStyle().Foreground(theme.Dim).Render(viewMeta[f.active].name)
		if ctx := s.Context(); ctx != "" {
			left += lipgloss.NewStyle().Foreground(theme.Dim).Render(" · ") +
				lipgloss.NewStyle().Foreground(theme.Fg).Render(ctx)
		}
	}

	// Truncate the left (view name + context) so left + a 1-col gap + right fits
	// w exactly, never eating into the right-aligned clock; the mode badge is
	// never cut.
	if maxLeft := w - lipgloss.Width(right) - 1; lipgloss.Width(left) > maxLeft {
		if maxLeft < lipgloss.Width(seg) {
			maxLeft = lipgloss.Width(seg)
		}
		left = ansi.Truncate(left, maxLeft, "")
	}
	return justify(left, right, w)
}

func (f Frame) region(w, h int, s Screen) (string, int) {
	switch f.overlay {
	case overlayPicker:
		return f.picker.render(w, h)
	case overlayGoto:
		return f.gotoMenu(), len(gotoOrder) + 1
	case overlayConfirm:
		yesLabel, noLabel := f.confirmYesLabel, f.confirmNoLabel
		if yesLabel == "" {
			yesLabel = "예"
		}
		if noLabel == "" {
			noLabel = "아니오"
		}
		line := lipgloss.NewStyle().Foreground(theme.Red).Bold(true).Render(f.confirmPrompt) + "  " +
			hint("y", yesLabel) + "  " + hint("n", noLabel)
		if f.confirmCancelLabel != "" {
			line += "  " + hint("esc", f.confirmCancelLabel)
		}
		return fitLine(line, w), 1
	default:
		items := s.Hints()
		// Prefer the full key+label bar; fall back to keys-only when it would
		// overflow w, so the globals (space/:/?) survive on a phone width
		// instead of being truncated off the right edge.
		full := hintsFull(items) + "   " + hintsFull(globalHints)
		if lipgloss.Width(full) <= w {
			return full, 1
		}
		return fitLine(hintsKeys(items)+"   "+hintsKeys(globalHints), w), 1
	}
}

func (f Frame) gotoMenu() string {
	lines := []string{lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render("이동")}
	for i, vk := range gotoOrder {
		m := viewMeta[vk]
		key := lipgloss.NewStyle().Foreground(theme.Cyan).Bold(true).Render(m.key)
		if i == f.gotoSel {
			lines = append(lines, lipgloss.NewStyle().Foreground(theme.Amber).Render("› ")+key+"  "+
				lipgloss.NewStyle().Foreground(theme.Fg).Bold(true).Render(m.name))
		} else {
			lines = append(lines, "  "+key+"  "+lipgloss.NewStyle().Foreground(theme.Dim).Render(m.name))
		}
	}
	return strings.Join(lines, "\n")
}

func commandItems() []pickerItem {
	return []pickerItem{
		{"today", "오늘 운동", "today"},
		{"stats", "통계", "stats"},
		{"history", "기록", "history"},
		{"programs", "프로그램", "programs"},
		{"exercises", "운동 관리", "exercises"},
		{"settings", "설정", "settings"},
		{"export", "데이터 내보내기", "export"},
		{"import", "데이터 가져오기 (import <경로>)", "import"},
		{"logout", "로그아웃", "logout"},
		{"quit", "종료", "quit"},
	}
}

// keymapSection is one buffer's local keymap, surfaced by the ? help overlay.
type keymapSection struct {
	view  ViewKind
	name  string
	pairs [][2]string
}

// bufferKeymaps documents each buffer's local keys; commonKeymap the keys that
// work in every buffer. helpBody renders the active buffer first, then these
// common keys, then the rest — so "what can I do here" and "what works
// everywhere" are answerable at a glance (lazygit-style).
var bufferKeymaps = []keymapSection{
	{vToday, "TODAY", [][2]string{{"i", "편집/reps"}, {"e/n", "운동/새세션"}, {"o", "세트"}, {"x", "완료/계획reps"}, {"t", "REF5 종료"}, {"d", "삭제"}, {"D", "입력폐기"}, {"u", "되돌리기"}, {"s", "저장/시작"}, {"a", "보강"}, {"c", "교체"}, {"hl", "셀"}}},
	{vStats, "STATS", [][2]string{{"v", "뷰"}, {"[ ]", "범위"}, {"b", "차트"}, {"/", "검색"}, {"R", "새로고침"}}},
	{vHistory, "HISTORY", [][2]string{{"⏎", "상세"}, {"e", "편집"}, {"d", "삭제"}, {"R", "새로고침"}}},
	{vPrograms, "PROGRAMS", [][2]string{{"⏎", "활성"}, {"v", "REF5 상태"}, {"R", "새로고침"}, {"n", "새플랜"}, {"r", "이름"}, {"d", "삭제"}}},
	{vExercises, "EXERCISES", [][2]string{{"/", "검색"}, {"r", "이름"}, {"a", "별칭"}, {"n", "추가"}, {"d", "삭제"}}},
	{vSettings, "SETTINGS", [][2]string{{"⏎", "토글"}, {"i", "숫자편집"}}},
}

// commonKeymap is the everywhere layer: learn these once and they hold in every
// buffer. Mirrors the bottom-hint globals (space/:/?) plus shared navigation.
var commonKeymap = [][2]string{{"jk ↑↓", "이동"}, {"⏎", "선택"}, {"esc", "취소"}, {"space", "이동"}, {":", "명령"}, {"?", "키맵"}, {"q", "종료"}, {"1-6", "버퍼"}}

// helpBody renders the keymap overlay lazygit-style: the active buffer's keys
// first (marked "현재 화면"), then the everywhere/common keys, then the other
// buffers. Rows wrap via flowHints so nothing overflows a narrow terminal (it
// only grows vertically, and the top — current + common — is what matters).
func helpBody(w, h int, active ViewKind) string {
	title := func(s string) string { return lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render(s) }
	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	row := func(pairs [][2]string) string {
		items := make([]string, len(pairs))
		for i, p := range pairs {
			items[i] = hint(p[0], p[1])
		}
		return "  " + flowHints(items, w-4)
	}

	var lines []string
	for _, sec := range bufferKeymaps {
		if sec.view == active {
			lines = append(lines, title("■ "+sec.name)+dim.Render(" 현재 화면"), row(sec.pairs), "")
			break
		}
	}
	lines = append(lines, title("어디서나")+dim.Render(" 모든 화면 공통"), row(commonKeymap), "")
	lines = append(lines, dim.Render("다른 화면"))
	for _, sec := range bufferKeymaps {
		if sec.view == active {
			continue
		}
		lines = append(lines, title(sec.name), row(sec.pairs))
	}
	lines = append(lines, "", dim.Render("  esc 닫기"))
	return lipgloss.NewStyle().Width(w).Height(h).Padding(1, 1).Render(strings.Join(lines, "\n"))
}

// justify places left and right text on one line padded to width w.
func justify(left, right string, w int) string {
	gap := w - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 1 {
		gap = 1
	}
	return left + strings.Repeat(" ", gap) + right
}

// fitLine hard-caps a line to w display columns (CJK-aware).
func fitLine(s string, w int) string {
	if lipgloss.Width(s) <= w {
		return s
	}
	return ansi.Truncate(s, w, "")
}

// compactView reports whether the viewport is short enough that the decorative
// top/bottom body padding (and inter-group blanks) cost too much: a phone SSH
// session with the on-screen keyboard up reports ~18-22 usable rows, where two
// blank rows are ~10% of the screen. Roomy terminals (>=24) keep the breathing
// room. width_audit renders at h=24, so its layout is unaffected.
func compactView(h int) bool { return h < 24 }

// bodyPad is the vertical padding a screen body should use for height h.
func bodyPad(h int) int {
	if compactView(h) {
		return 0
	}
	return 1
}

// windowLines returns at most h lines centered on the active line. When content
// is clipped it turns the top/bottom visible line into a dim "↑/↓ N" marker so
// there is always a visible cue that more rows exist. Centering guarantees the
// active line (cursor) is never the row replaced by a marker for h>=3.
func windowLines(lines []string, active, h int) []string {
	n := len(lines)
	if h < 1 {
		h = 1
	}
	if n <= h {
		return lines
	}
	start := active - h/2
	if start < 0 {
		start = 0
	}
	if start > n-h {
		start = n - h
	}
	out := make([]string, h)
	copy(out, lines[start:start+h])
	// A marker replaces (and thus hides) one content line, so the hidden count
	// includes that line: start+1 above, and the symmetric remainder below.
	if start > 0 {
		out[0] = moreLine("↑", start+1)
	}
	if start+h < n {
		out[h-1] = moreLine("↓", n-(start+h)+1)
	}
	return out
}

func moreLine(arrow string, n int) string {
	return lipgloss.NewStyle().Foreground(theme.Ghost).Render("  " + arrow + " " + strconv.Itoa(n))
}

// flowHints joins key-hint chips with a 3-space gap, wrapping to a new line
// when the next chip would exceed w display columns (CJK-aware). This keeps
// every hint visible on a narrow phone terminal instead of letting the row
// overflow and clip off-screen.
func flowHints(items []string, w int) string {
	var lines []string
	cur := ""
	for _, it := range items {
		switch {
		case cur == "":
			cur = it
		case lipgloss.Width(cur)+3+lipgloss.Width(it) > w:
			lines = append(lines, cur)
			cur = it
		default:
			cur += "   " + it
		}
	}
	if cur != "" {
		lines = append(lines, cur)
	}
	return strings.Join(lines, "\n")
}
