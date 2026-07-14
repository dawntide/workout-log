package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

type plansLoadedMsg struct {
	plans []api.Plan
	err   error
}

type planDeletedMsg struct {
	id  string
	err error
}

func plansLoadCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		plans, err := c.Plans(context.Background())
		return plansLoadedMsg{plans: plans, err: err}
	}
}

func deletePlanCmd(c *api.Client, id string) tea.Cmd {
	return func() tea.Msg {
		return planDeletedMsg{id: id, err: c.DeletePlan(context.Background(), id)}
	}
}

type templatesLoadedMsg struct {
	templates []api.Template
	err       error
}

type planCreatedMsg struct{ err error }

func templatesLoadCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		ts, err := c.Templates(context.Background())
		return templatesLoadedMsg{templates: ts, err: err}
	}
}

func createPlanCmd(c *api.Client, req api.CreatePlanRequest) tea.Cmd {
	return func() tea.Msg {
		return planCreatedMsg{err: c.CreatePlan(context.Background(), req)}
	}
}

// createTemplatePlanCmd is the existing one-step create path for ordinary
// templates. REF5 goes through the timezone picker before calling the sibling
// createRef5TemplatePlanCmd below.
func createTemplatePlanCmd(c *api.Client, t api.Template) tea.Cmd {
	return func() tea.Msg {
		if t.LatestVersion == nil {
			return planCreatedMsg{err: fmt.Errorf("프로그램 버전을 찾을 수 없습니다")}
		}
		planType := "SINGLE"
		if t.Type == "MANUAL" {
			planType = "MANUAL"
		}
		req := api.CreatePlanRequest{
			Name: t.Name, Type: planType, RootProgramVersionID: t.LatestVersion.ID,
		}
		return planCreatedMsg{err: c.CreatePlan(context.Background(), req)}
	}
}

func createRef5TemplatePlanCmd(c *api.Client, t api.Template, timezone string) tea.Cmd {
	return func() tea.Msg {
		if t.LatestVersion == nil {
			return planCreatedMsg{err: fmt.Errorf("프로그램 버전을 찾을 수 없습니다")}
		}
		timezone = strings.TrimSpace(timezone)
		if !isIANATimezone(timezone) {
			return planCreatedMsg{err: fmt.Errorf("올바른 IANA 시간대를 입력하세요")}
		}
		planType := "SINGLE"
		if t.Type == "MANUAL" {
			planType = "MANUAL"
		}
		return planCreatedMsg{err: c.CreatePlan(context.Background(), api.CreatePlanRequest{
			Name:                 t.Name,
			Type:                 planType,
			RootProgramVersionID: t.LatestVersion.ID,
			Params:               map[string]any{"timezone": timezone},
		})}
	}
}

func ref5TimezonePickerCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		settings, _ := c.Settings(context.Background())
		return ref5TimezonePickerMsg(ref5PlanTimezone(settings))
	}
}

func ref5TimezonePickerMsg(initial string) openPickerMsg {
	return openPickerMsg{
		prompt:  "REF5 시간대 ",
		tag:     "ref5-timezone",
		initial: strings.TrimSpace(initial),
		owner:   vPrograms,
		owned:   true,
	}
}

func ref5PlanTimezone(settings map[string]json.RawMessage) string {
	system := systemTimezone()
	if raw := settings["prefs.timezone"]; len(raw) > 0 {
		var value string
		if json.Unmarshal(raw, &value) == nil {
			value = strings.TrimSpace(value)
			// The settings API merges its UTC default into every response. Treat
			// that default as a fallback so a Seoul/Tokyo/etc. terminal starts at
			// its actual system zone; a non-UTC user preference remains authoritative.
			if isIANATimezone(value) && !strings.EqualFold(value, "UTC") {
				return value
			}
		}
	}
	return system
}

func systemTimezone() string {
	candidates := []string{os.Getenv("TZ"), time.Now().Location().String()}
	if raw, err := os.ReadFile("/etc/timezone"); err == nil {
		candidates = append(candidates, string(raw))
	}
	if target, err := filepath.EvalSymlinks("/etc/localtime"); err == nil {
		if _, zone, ok := strings.Cut(target, "/zoneinfo/"); ok {
			candidates = append(candidates, zone)
		}
	}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(strings.TrimPrefix(candidate, ":"))
		if isIANATimezone(candidate) {
			return candidate
		}
	}
	return "UTC"
}

func isIANATimezone(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" || strings.EqualFold(value, "Local") {
		return false
	}
	_, err := time.LoadLocation(value)
	return err == nil
}

type ref5StatusLoadedMsg struct {
	planID string
	status *api.Ref5Status
	err    error
}

func ref5StatusLoadCmd(c *api.Client, planID string) tea.Cmd {
	return func() tea.Msg {
		status, err := c.Ref5PlanStatus(context.Background(), planID)
		return ref5StatusLoadedMsg{planID: planID, status: status, err: err}
	}
}

type planRenamedMsg struct{ err error }

func renamePlanCmd(c *api.Client, id, name string) tea.Cmd {
	return func() tea.Msg {
		return planRenamedMsg{err: c.RenamePlan(context.Background(), id, name)}
	}
}

// Programs is the plans buffer: a navigable list of training plans. enter sets
// the active plan (loads today's session), d deletes (confirm).
type Programs struct {
	client                *api.Client
	plans                 []api.Plan
	templates             []api.Template
	activeID              string
	sel                   int
	renaming              bool
	input                 textinput.Model
	loaded                bool
	err                   string
	showRef5Status        bool
	statusPlanID          string
	ref5Status            *api.Ref5Status
	statusLoading         bool
	statusErr             string
	pendingRef5TemplateID string
	w, h                  int
}

func NewPrograms(c *api.Client) Programs { return Programs{client: c} }

func (s Programs) Init() tea.Cmd { return plansLoadCmd(s.client) }

func (s Programs) Update(msg tea.Msg) (Screen, tea.Cmd) {
	switch m := msg.(type) {
	case tea.WindowSizeMsg:
		s.w, s.h = m.Width, m.Height
		return s, nil
	case plansLoadedMsg:
		s.loaded = true
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		s.err = ""
		s.plans = m.plans
		// Mark the auto-resolved active plan (same pick as the today buffer) so
		// the ● lands on it before the user explicitly activates one.
		if s.activeID == "" {
			if p, ok := api.ActivePlan(m.plans); ok {
				s.activeID = p.ID
			}
		}
		if s.sel >= len(s.plans) {
			s.sel = 0
		}
		if s.showRef5Status && (len(s.plans) == 0 || s.plans[s.sel].ID != s.statusPlanID || !s.plans[s.sel].IsRef5()) {
			s.closeRef5Status()
		}
		return s, nil
	case ref5StatusLoadedMsg:
		if !s.showRef5Status || m.planID != s.statusPlanID {
			return s, nil
		}
		s.statusLoading = false
		if m.err != nil {
			s.statusErr = humanizeAuthErr(m.err)
			return s, nil
		}
		if m.status == nil {
			s.statusErr = "REF5 상태를 사용할 수 없습니다"
			return s, nil
		}
		s.statusErr = ""
		s.ref5Status = m.status
		return s, nil
	case planDeletedMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		if m.id == s.activeID {
			s.activeID = ""
		}
		return s, plansLoadCmd(s.client)
	case templatesLoadedMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		s.templates = m.templates
		items := make([]pickerItem, 0, len(m.templates))
		for _, t := range m.templates {
			if t.LatestVersion == nil {
				continue
			}
			items = append(items, pickerItem{label: t.Name, desc: strings.ToLower(t.Type), value: t.ID})
		}
		return s, func() tea.Msg {
			return openPickerMsg{prompt: "프로그램 스토어 ", tag: "template", items: items, owner: vPrograms, owned: true}
		}
	case planCreatedMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		return s, plansLoadCmd(s.client)
	case planRenamedMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		return s, plansLoadCmd(s.client)
	case pickedMsg:
		if m.tag == "template" {
			for _, t := range s.templates {
				if t.ID == m.value && t.LatestVersion != nil {
					s.err = ""
					if t.IsRef5() {
						s.pendingRef5TemplateID = t.ID
						return s, ref5TimezonePickerCmd(s.client)
					}
					s.pendingRef5TemplateID = ""
					return s, createTemplatePlanCmd(s.client, t)
				}
			}
		}
		if m.tag == "ref5-timezone" {
			timezone := strings.TrimSpace(m.value)
			if !isIANATimezone(timezone) {
				s.err = "올바른 IANA 시간대를 입력하세요 (예: Asia/Seoul)"
				return s, func() tea.Msg { return ref5TimezonePickerMsg(timezone) }
			}
			for _, t := range s.templates {
				if t.ID == s.pendingRef5TemplateID && t.LatestVersion != nil && t.IsRef5() {
					s.pendingRef5TemplateID = ""
					s.err = ""
					return s, createRef5TemplatePlanCmd(s.client, t, timezone)
				}
			}
			s.pendingRef5TemplateID = ""
			s.err = "선택한 REF5 프로그램을 찾을 수 없습니다"
		}
		return s, nil
	case tea.KeyPressMsg:
		if s.renaming {
			return s.updateRename(m)
		}
		return s.handleKey(m)
	}
	if s.renaming {
		var cmd tea.Cmd
		s.input, cmd = s.input.Update(msg)
		return s, cmd
	}
	return s, nil
}

func (s Programs) handleKey(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	if s.showRef5Status {
		switch m.String() {
		case "esc", "v":
			s.closeRef5Status()
			return s, nil
		case "R":
			if len(s.plans) == 0 || !s.plans[s.sel].IsRef5() {
				return s, nil
			}
			s.statusLoading = true
			s.statusErr = ""
			return s, ref5StatusLoadCmd(s.client, s.statusPlanID)
		}
		return s, nil
	}
	switch m.String() {
	case "j", "down":
		if s.sel < len(s.plans)-1 {
			s.sel++
		}
	case "k", "up":
		if s.sel > 0 {
			s.sel--
		}
	case "enter":
		if len(s.plans) == 0 {
			return s, nil
		}
		p := s.plans[s.sel]
		s.activeID = p.ID
		return s, func() tea.Msg { return planActivatedMsg{id: p.ID, name: p.Name, plan: p} }
	case "d":
		if len(s.plans) == 0 {
			return s, nil
		}
		p := s.plans[s.sel]
		return s, func() tea.Msg {
			return confirmMsg{
				prompt: p.Name + " 플랜 삭제?", onYes: deletePlanCmd(s.client, p.ID), planID: p.ID,
			}
		}
	case "n":
		return s, templatesLoadCmd(s.client)
	case "r":
		return s.beginRename()
	case "v":
		if len(s.plans) == 0 || !s.plans[s.sel].IsRef5() {
			return s, nil
		}
		p := s.plans[s.sel]
		s.showRef5Status = true
		s.statusPlanID = p.ID
		s.ref5Status = nil
		s.statusLoading = true
		s.statusErr = ""
		return s, ref5StatusLoadCmd(s.client, p.ID)
	}
	return s, nil
}

func (s *Programs) closeRef5Status() {
	s.showRef5Status = false
	s.statusPlanID = ""
	s.ref5Status = nil
	s.statusLoading = false
	s.statusErr = ""
}

func (s Programs) beginRename() (Screen, tea.Cmd) {
	if len(s.plans) == 0 {
		return s, nil
	}
	ti := textinput.New()
	ti.Prompt = ""
	ti.SetVirtualCursor(true)
	ti.SetWidth(24)
	ti.SetValue(s.plans[s.sel].Name)
	s.input, s.renaming = ti, true
	return s, ti.Focus()
}

func (s Programs) updateRename(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	switch m.String() {
	case "esc":
		s.renaming = false
		return s, nil
	case "enter":
		s.renaming = false
		name := strings.TrimSpace(s.input.Value())
		p := s.plans[s.sel]
		if name == "" || name == p.Name {
			return s, nil
		}
		return s, renamePlanCmd(s.client, p.ID, name)
	}
	var cmd tea.Cmd
	s.input, cmd = s.input.Update(m)
	return s, cmd
}

func (s Programs) Mode() Mode {
	if !s.loaded && s.err == "" {
		return Mode{Label: "LOADING", Tone: theme.Cyan}
	}
	if s.renaming {
		return Mode{Label: "INSERT", Tone: theme.Amber}
	}
	if s.showRef5Status {
		if s.statusLoading {
			return Mode{Label: "LOADING", Tone: theme.Cyan}
		}
		return Mode{Label: "REF5", Tone: theme.Cyan}
	}
	return ModeNormal
}

func (s Programs) Context() string {
	if len(s.plans) == 0 {
		return ""
	}
	return truncate(s.plans[s.sel].Name, 14)
}

func (s Programs) StatusRight() string {
	if len(s.plans) == 0 {
		return ""
	}
	if s.showRef5Status && s.ref5Status != nil {
		return fmt.Sprintf("REF5 REV %d", s.ref5Status.Revision)
	}
	return fmt.Sprintf("%d 플랜", len(s.plans))
}

func (s Programs) Editing() bool { return s.renaming }

func (s Programs) Hints() []hintItem {
	if s.renaming {
		return []hintItem{{"⏎", "이름변경"}, {"esc", "취소"}}
	}
	if s.showRef5Status {
		return []hintItem{{"v/esc", "목록"}, {"R", "새로고침"}}
	}
	hints := []hintItem{{"jk", "이동"}, {"⏎", "활성"}, {"r", "이름"}, {"n", "새플랜"}, {"d", "삭제"}}
	if len(s.plans) > 0 && s.plans[s.sel].IsRef5() {
		hints = append(hints, hintItem{"v", "상태"})
	}
	return hints
}

func (s Programs) Body(w, h int) string {
	if s.err != "" {
		return centered(theme.GlyphFail+" "+s.err, theme.Red, w, h)
	}
	if !s.loaded {
		return centered("불러오는 중…", theme.Dim, w, h)
	}
	if len(s.plans) == 0 {
		return s.renderEmpty(w, h)
	}
	if s.showRef5Status {
		return s.renderRef5Status(w, h)
	}

	lines := make([]string, 0, len(s.plans))
	active := 0
	for i, p := range s.plans {
		marker := "  "
		nameStyle := lipgloss.NewStyle().Foreground(theme.Fg)
		if i == s.sel {
			marker = lipgloss.NewStyle().Foreground(theme.Amber).Render("› ")
			nameStyle = lipgloss.NewStyle().Foreground(theme.Amber).Bold(true)
			active = len(lines)
		}
		bullet := lipgloss.NewStyle().Foreground(theme.Ghost).Render("○")
		if p.ID == s.activeID {
			bullet = lipgloss.NewStyle().Foreground(theme.Green).Render("●")
		}
		if i == s.sel && s.renaming {
			lines = append(lines, marker+bullet+" "+lipgloss.NewStyle().Foreground(theme.Amber).Render("["+s.input.View()+"]"))
			continue
		}
		sub := lipgloss.NewStyle().Foreground(theme.Dim).Render(programSubtitle(p))
		left := marker + bullet + " " + nameStyle.Render(truncate(p.Name, w-22))
		lines = append(lines, justify(left, sub, w-2))
	}
	// Window around the selection so a long plan list never overflows the body
	// and clips the frame's hint bar below it (matches history/exercises/today).
	pad := bodyPad(h)
	avail := h - 2*pad
	if avail < 1 {
		avail = 1
	}
	return lipgloss.NewStyle().Width(w).Height(h).Padding(pad, 1).Render(strings.Join(windowLines(lines, active, avail), "\n"))
}

func (s Programs) renderRef5Status(w, h int) string {
	if s.statusLoading {
		return centered("REF5 상태 불러오는 중…", theme.Dim, w, h)
	}
	if s.statusErr != "" {
		return centered(theme.GlyphFail+" "+s.statusErr, theme.Red, w, h)
	}
	if s.ref5Status == nil {
		return centered("REF5 상태를 사용할 수 없습니다", theme.Dim, w, h)
	}

	status := s.ref5Status
	name := "REF5"
	if len(s.plans) > 0 {
		name = s.plans[s.sel].Name
	}
	inner := w - 2
	if inner < 1 {
		inner = 1
	}
	amber := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true)
	dimStyle := lipgloss.NewStyle().Foreground(theme.Dim)
	cyan := lipgloss.NewStyle().Foreground(theme.Cyan)
	green := lipgloss.NewStyle().Foreground(theme.Green)

	lines := []string{
		justify(amber.Render("REF5 STATUS"), dimStyle.Render(truncate(name, 18)), inner),
		"",
		ref5StatusLine("NEXT", fmt.Sprintf("%s · SQ %s", orRef5Dash(status.NextFocus), orRef5Dash(status.NextSquatHard)), inner),
		ref5StatusLine("STD", fmt.Sprintf("SQ-H3 %skg · BP %skg · PULL %skg",
			ref5Kg(status.DirectStandardsKg.SqH3Kg), ref5Kg(status.DirectStandardsKg.BpFocusKg), ref5Kg(status.DirectStandardsKg.PullFocusTotalKg)), inner),
		ref5StatusLine("", fmt.Sprintf("DL %skg · OHP %skg",
			ref5Kg(status.DirectStandardsKg.DeadliftKg), ref5Kg(status.DirectStandardsKg.OhpKg)), inner),
		ref5StatusLine("WIN", ref5Windows(status.Windows, []string{"SQ", "BP", "PULL"}), inner),
		ref5StatusLine("", ref5Windows(status.Windows, []string{"DL", "OHP"}), inner),
	}

	lock := "OPEN · 다음 PULL 시작 시 고정"
	if status.PullLock != nil {
		lock = fmt.Sprintf("%s · F %skg / V %skg", status.PullLock.WindowID,
			ref5Kg(status.PullLock.FocusTargetTotalKg), ref5Kg(status.PullLock.VolumeTargetTotalKg))
	}
	lines = append(lines, ref5StatusLine("LOCK", lock, inner))
	if status.PendingMicro.Pending {
		lines = append(lines, ref5StatusLine("MICRO", strings.Join(status.PendingMicro.Reasons, ", "), inner))
	} else {
		lines = append(lines, ref5StatusLine("MICRO", "CLEAR", inner))
	}
	lines = append(lines, "", fitLine(cyan.Render(fmt.Sprintf("START %d", status.StartedSessionCount))+dimStyle.Render(" · ")+
		green.Render(fmt.Sprintf("DONE %d", status.CompletedSessionCount))+dimStyle.Render(fmt.Sprintf(" · REV %d", status.Revision)), inner))

	pad := bodyPad(h)
	avail := h - 2*pad
	if avail < 1 {
		avail = 1
	}
	for i := range lines {
		lines[i] = fitLine(lines[i], inner)
	}
	return lipgloss.NewStyle().Width(w).Height(h).Padding(pad, 1).Render(strings.Join(windowLines(lines, 0, avail), "\n"))
}

func ref5StatusLine(label, value string, w int) string {
	labelStyle := lipgloss.NewStyle().Foreground(theme.Cyan).Bold(true)
	valueStyle := lipgloss.NewStyle().Foreground(theme.Fg)
	if label == "" {
		return fitLine("      "+valueStyle.Render(value), w)
	}
	return fitLine(labelStyle.Width(5).Render(label)+" "+valueStyle.Render(value), w)
}

func ref5Windows(windows map[string]api.Ref5WindowStatus, lifts []string) string {
	parts := make([]string, 0, len(lifts))
	for _, lift := range lifts {
		window := windows[lift]
		parts = append(parts, fmt.Sprintf("%s %d/%d", lift, window.Current, window.Threshold))
	}
	return strings.Join(parts, " · ")
}

func ref5Kg(value api.Float64) string { return trimNum(float64(value)) }

func orRef5Dash(value string) string {
	if strings.TrimSpace(value) == "" {
		return "—"
	}
	return value
}

// renderEmpty draws the no-plans state with a prompt to open the program store
// (the n → template picker), so a fresh user knows where plans come from instead
// of facing a bare "플랜이 없습니다".
func (s Programs) renderEmpty(w, h int) string {
	ghost := lipgloss.NewStyle().Foreground(theme.Ghost)
	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	guide := ghost.Render("플랜이 없습니다.") + "\n\n" +
		hint("n", "프로그램 스토어") + dim.Render(" 열기")
	return lipgloss.Place(w, h, lipgloss.Center, lipgloss.Center, guide)
}

func programSubtitle(p api.Plan) string {
	if p.IsRef5() {
		if version, ok := p.Params["protocolVersion"].(string); ok && strings.TrimSpace(version) != "" {
			return "ref5 v" + strings.TrimSpace(version)
		}
		return "ref5"
	}
	if p.BaseProgramName != "" {
		return truncate(p.BaseProgramName, 16)
	}
	return strings.ToLower(p.Type)
}
