package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
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

type ref5StartingValues struct {
	SqH3Kg           float64
	BpFocusKg        float64
	PullFocusTotalKg float64
	DeadliftKg       float64
	OhpKg            float64
}

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

func createRef5TemplatePlanCmd(c *api.Client, t api.Template, timezone string, starts ref5StartingValues) tea.Cmd {
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
			Params: map[string]any{
				"timezone":        timezone,
				"programFamily":   api.Ref5ProgramFamily,
				"protocolVersion": api.Ref5ProtocolVersion,
				"ref5": map[string]any{
					"initializationVersion": api.Ref5StartConfigVersion,
					"schemaVersion":         api.Ref5RuntimeSchemaVersion,
					"protocolVersion":       api.Ref5ProtocolVersion,
					"startingValuesKg": map[string]any{
						"sqH3Kg": starts.SqH3Kg, "bpFocusKg": starts.BpFocusKg,
						"pullFocusTotalKg": starts.PullFocusTotalKg,
						"deadliftKg":       starts.DeadliftKg, "ohpKg": starts.OhpKg,
					},
				},
			},
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

func ref5WeightPickerMsg(tag, prompt, initial string) openPickerMsg {
	return openPickerMsg{
		prompt: prompt, tag: tag, initial: strings.TrimSpace(initial), owner: vPrograms, owned: true,
	}
}

func ref5StartNumber(value any) (float64, bool) {
	switch number := value.(type) {
	case float64:
		return number, true
	case float32:
		return float64(number), true
	case int:
		return float64(number), true
	case json.Number:
		parsed, err := number.Float64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func ref5StartingValuesFromTemplate(t api.Template) (ref5StartingValues, error) {
	if t.LatestVersion == nil {
		return ref5StartingValues{}, fmt.Errorf("프로그램 버전을 찾을 수 없습니다")
	}
	ref5Defaults, ok := t.LatestVersion.Defaults["ref5"].(map[string]any)
	if !ok {
		return ref5StartingValues{}, fmt.Errorf("REF5 시작 중량 기본값을 찾을 수 없습니다")
	}
	raw, ok := ref5Defaults["startingValuesKg"].(map[string]any)
	if !ok {
		return ref5StartingValues{}, fmt.Errorf("REF5 시작 중량 기본값을 찾을 수 없습니다")
	}
	read := func(key string) (float64, error) {
		value, ok := ref5StartNumber(raw[key])
		if !ok || !validRef5StartingWeight(value) {
			return 0, fmt.Errorf("REF5 %s 기본값이 올바르지 않습니다", key)
		}
		return value, nil
	}
	values := ref5StartingValues{}
	var err error
	if values.SqH3Kg, err = read("sqH3Kg"); err != nil {
		return values, err
	}
	if values.BpFocusKg, err = read("bpFocusKg"); err != nil {
		return values, err
	}
	if values.PullFocusTotalKg, err = read("pullFocusTotalKg"); err != nil {
		return values, err
	}
	if values.DeadliftKg, err = read("deadliftKg"); err != nil {
		return values, err
	}
	if values.OhpKg, err = read("ohpKg"); err != nil {
		return values, err
	}
	if values.DeadliftKg > ref5DeadliftCap(values)+1e-9 || values.OhpKg > ref5OhpCap(values)+1e-9 {
		return values, fmt.Errorf("REF5 보조종목 기본값이 상한을 넘습니다")
	}
	return values, nil
}

func validRef5StartingWeight(value float64) bool {
	return value >= 2.5 && value <= 500 && math.Abs(value/2.5-math.Round(value/2.5)) <= 1e-9
}

func ref5DeadliftCap(values ref5StartingValues) float64 {
	return math.Floor(((104*values.SqH3Kg/82.5)*72.5/100)/2.5) * 2.5
}

func ref5OhpCap(values ref5StartingValues) float64 {
	return math.Floor((((101*values.BpFocusKg/82.5)*0.5)*32.5/50)/2.5) * 2.5
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
	pendingRef5Timezone   string
	pendingRef5Starts     ref5StartingValues
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
						starts, err := ref5StartingValuesFromTemplate(t)
						if err != nil {
							s.err = err.Error()
							return s, nil
						}
						s.pendingRef5TemplateID = t.ID
						s.pendingRef5Timezone = ""
						s.pendingRef5Starts = starts
						return s, ref5TimezonePickerCmd(s.client)
					}
					s.pendingRef5TemplateID = ""
					s.pendingRef5Timezone = ""
					s.pendingRef5Starts = ref5StartingValues{}
					return s, createTemplatePlanCmd(s.client, t)
				}
			}
		}
		if strings.HasPrefix(m.tag, "ref5-") {
			return s.handleRef5SetupPick(m)
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

func ref5StartPrompt(tag string, values ref5StartingValues) string {
	switch tag {
	case "ref5-sq-h3":
		return "SQ H3 시작 kg (2.5 단위) "
	case "ref5-bp-focus":
		return "BP 집중 시작 kg (2.5 단위) "
	case "ref5-pull-total":
		return "PULL 집중 총중량 kg (2.5 단위) "
	case "ref5-deadlift":
		return fmt.Sprintf("DL 시작 kg (상한 %s) ", trimNum(ref5DeadliftCap(values)))
	case "ref5-ohp":
		return fmt.Sprintf("OHP 시작 kg (상한 %s) ", trimNum(ref5OhpCap(values)))
	default:
		return "REF5 시작 kg "
	}
}

func ref5StartPickerCmd(tag string, values ref5StartingValues, initial float64) tea.Cmd {
	return func() tea.Msg {
		return ref5WeightPickerMsg(tag, ref5StartPrompt(tag, values), trimNum(initial))
	}
}

func (s Programs) pendingRef5Template() (api.Template, bool) {
	for _, template := range s.templates {
		if template.ID == s.pendingRef5TemplateID && template.LatestVersion != nil && template.IsRef5() {
			return template, true
		}
	}
	return api.Template{}, false
}

func (s Programs) handleRef5SetupPick(m pickedMsg) (Screen, tea.Cmd) {
	template, ok := s.pendingRef5Template()
	if !ok {
		s.pendingRef5TemplateID = ""
		s.pendingRef5Timezone = ""
		s.pendingRef5Starts = ref5StartingValues{}
		s.err = "선택한 REF5 프로그램을 찾을 수 없습니다"
		return s, nil
	}

	if m.tag == "ref5-timezone" {
		timezone := strings.TrimSpace(m.value)
		if !isIANATimezone(timezone) {
			s.err = "올바른 IANA 시간대를 입력하세요 (예: Asia/Seoul)"
			return s, func() tea.Msg { return ref5TimezonePickerMsg(timezone) }
		}
		s.pendingRef5Timezone = timezone
		s.err = ""
		return s, ref5StartPickerCmd("ref5-sq-h3", s.pendingRef5Starts, s.pendingRef5Starts.SqH3Kg)
	}

	value, err := strconv.ParseFloat(strings.TrimSpace(m.value), 64)
	if err != nil || !validRef5StartingWeight(value) {
		s.err = "시작 중량은 2.5~500kg 범위에서 2.5kg 단위로 입력하세요"
		return s, func() tea.Msg {
			return ref5WeightPickerMsg(m.tag, ref5StartPrompt(m.tag, s.pendingRef5Starts), m.value)
		}
	}

	s.err = ""
	switch m.tag {
	case "ref5-sq-h3":
		s.pendingRef5Starts.SqH3Kg = value
		return s, ref5StartPickerCmd("ref5-bp-focus", s.pendingRef5Starts, s.pendingRef5Starts.BpFocusKg)
	case "ref5-bp-focus":
		s.pendingRef5Starts.BpFocusKg = value
		return s, ref5StartPickerCmd("ref5-pull-total", s.pendingRef5Starts, s.pendingRef5Starts.PullFocusTotalKg)
	case "ref5-pull-total":
		s.pendingRef5Starts.PullFocusTotalKg = value
		return s, ref5StartPickerCmd("ref5-deadlift", s.pendingRef5Starts, s.pendingRef5Starts.DeadliftKg)
	case "ref5-deadlift":
		capKg := ref5DeadliftCap(s.pendingRef5Starts)
		if value > capKg+1e-9 {
			s.err = fmt.Sprintf("DL 시작 중량은 현재 SQ 기준 상한 %skg 이하여야 합니다", trimNum(capKg))
			return s, func() tea.Msg {
				return ref5WeightPickerMsg(m.tag, ref5StartPrompt(m.tag, s.pendingRef5Starts), m.value)
			}
		}
		s.pendingRef5Starts.DeadliftKg = value
		return s, ref5StartPickerCmd("ref5-ohp", s.pendingRef5Starts, s.pendingRef5Starts.OhpKg)
	case "ref5-ohp":
		capKg := ref5OhpCap(s.pendingRef5Starts)
		if value > capKg+1e-9 {
			s.err = fmt.Sprintf("OHP 시작 중량은 현재 BP 기준 상한 %skg 이하여야 합니다", trimNum(capKg))
			return s, func() tea.Msg {
				return ref5WeightPickerMsg(m.tag, ref5StartPrompt(m.tag, s.pendingRef5Starts), m.value)
			}
		}
		s.pendingRef5Starts.OhpKg = value
		command := createRef5TemplatePlanCmd(
			s.client,
			template,
			s.pendingRef5Timezone,
			s.pendingRef5Starts,
		)
		s.pendingRef5TemplateID = ""
		s.pendingRef5Timezone = ""
		s.pendingRef5Starts = ref5StartingValues{}
		return s, command
	default:
		s.err = "알 수 없는 REF5 시작 설정 단계입니다"
		return s, nil
	}
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
		ref5StatusLine("WIN", "진행/기준 · 판정완료", inner),
	}
	windowWidth := inner - 6
	if windowWidth < 1 {
		windowWidth = 1
	}
	for _, windowLine := range ref5WindowPlainLines(status.Windows, windowWidth) {
		lines = append(lines, ref5StatusLine("", windowLine, inner))
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
