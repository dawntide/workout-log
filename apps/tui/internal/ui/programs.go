package ui

import (
	"context"
	"fmt"
	"strings"

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

type planDeletedMsg struct{ err error }

func plansLoadCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		plans, err := c.Plans(context.Background())
		return plansLoadedMsg{plans: plans, err: err}
	}
}

func deletePlanCmd(c *api.Client, id string) tea.Cmd {
	return func() tea.Msg {
		return planDeletedMsg{err: c.DeletePlan(context.Background(), id)}
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

type planRenamedMsg struct{ err error }

func renamePlanCmd(c *api.Client, id, name string) tea.Cmd {
	return func() tea.Msg {
		return planRenamedMsg{err: c.RenamePlan(context.Background(), id, name)}
	}
}

// Programs is the plans buffer: a navigable list of training plans. enter sets
// the active plan (loads today's session), d deletes (confirm).
type Programs struct {
	client    *api.Client
	plans     []api.Plan
	templates []api.Template
	activeID  string
	sel       int
	renaming  bool
	input     textinput.Model
	loaded    bool
	err       string
	w, h      int
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
		return s, nil
	case planDeletedMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
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
		return s, func() tea.Msg { return openPickerMsg{prompt: "프로그램 ", tag: "template", items: items} }
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
					planType := "SINGLE"
					if t.Type == "MANUAL" {
						planType = "MANUAL"
					}
					return s, createPlanCmd(s.client, api.CreatePlanRequest{
						Name: t.Name, Type: planType, RootProgramVersionID: t.LatestVersion.ID,
					})
				}
			}
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
		return s, func() tea.Msg { return planActivatedMsg{id: p.ID, name: p.Name} }
	case "d":
		if len(s.plans) == 0 {
			return s, nil
		}
		p := s.plans[s.sel]
		return s, func() tea.Msg {
			return confirmMsg{prompt: p.Name + " 플랜 삭제?", onYes: deletePlanCmd(s.client, p.ID)}
		}
	case "n":
		return s, templatesLoadCmd(s.client)
	case "r":
		return s.beginRename()
	}
	return s, nil
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
	return fmt.Sprintf("%d 플랜", len(s.plans))
}

func (s Programs) Editing() bool { return s.renaming }

func (s Programs) Hints(int) string {
	if s.renaming {
		return joinHints(hint("⏎", "이름변경"), hint("esc", "취소"))
	}
	return joinHints(hint("jk", "이동"), hint("⏎", "활성"), hint("r", "이름"), hint("n", "새플랜"), hint("d", "삭제"))
}

func (s Programs) Body(w, h int) string {
	if s.err != "" {
		return centered(theme.GlyphFail+" "+s.err, theme.Red, w, h)
	}
	if !s.loaded {
		return centered("불러오는 중…", theme.Dim, w, h)
	}
	if len(s.plans) == 0 {
		return centered("플랜이 없습니다", theme.Ghost, w, h)
	}

	lines := make([]string, 0, len(s.plans))
	for i, p := range s.plans {
		marker := "  "
		nameStyle := lipgloss.NewStyle().Foreground(theme.Fg)
		if i == s.sel {
			marker = lipgloss.NewStyle().Foreground(theme.Amber).Render("› ")
			nameStyle = lipgloss.NewStyle().Foreground(theme.Amber).Bold(true)
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
	return lipgloss.NewStyle().Width(w).Height(h).Padding(1, 1).Render(strings.Join(lines, "\n"))
}

func programSubtitle(p api.Plan) string {
	if p.BaseProgramName != "" {
		return truncate(p.BaseProgramName, 16)
	}
	return strings.ToLower(p.Type)
}
