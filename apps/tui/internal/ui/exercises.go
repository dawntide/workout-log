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

type exMode int

const (
	exBrowse exMode = iota
	exSearch
	exRename
	exAlias
	exCreate
)

type exercisesLoadedMsg struct {
	items []api.Exercise
	err   error
}

// exActionMsg reports a rename/delete/alias result (ok on success, err on fail).
type exActionMsg struct {
	ok  string
	err error
}

func exercisesLoadCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		items, err := c.Exercises(context.Background(), "")
		return exercisesLoadedMsg{items: items, err: err}
	}
}

func renameExerciseCmd(c *api.Client, id, name string) tea.Cmd {
	return func() tea.Msg {
		if err := c.RenameExercise(context.Background(), id, name); err != nil {
			return exActionMsg{err: err}
		}
		return exActionMsg{ok: "이름을 변경했습니다"}
	}
}

func deleteExerciseCmd(c *api.Client, id string) tea.Cmd {
	return func() tea.Msg {
		if err := c.DeleteExercise(context.Background(), id); err != nil {
			return exActionMsg{err: err}
		}
		return exActionMsg{ok: "운동을 삭제했습니다"}
	}
}

func addAliasCmd(c *api.Client, id, alias string) tea.Cmd {
	return func() tea.Msg {
		if err := c.AddAlias(context.Background(), id, alias); err != nil {
			return exActionMsg{err: err}
		}
		return exActionMsg{ok: "별칭을 추가했습니다"}
	}
}

func createExerciseCmd(c *api.Client, name string) tea.Cmd {
	return func() tea.Msg {
		if _, err := c.CreateExercise(context.Background(), name); err != nil {
			return exActionMsg{err: err}
		}
		return exActionMsg{ok: "운동을 추가했습니다"}
	}
}

// Exercises is the exercise-catalog buffer: a searchable dictionary with inline
// rename (r), alias (a), and delete (d) actions. List-driven, terminal-native.
type Exercises struct {
	client  *api.Client
	all     []api.Exercise
	view    []int // indices into all after the query filter
	query   string
	sel     int // index into view
	mode    exMode
	input   textinput.Model
	loaded  bool
	err     string
	flash   string
	flashOk bool
	w, h    int
}

func NewExercises(c *api.Client) Exercises { return Exercises{client: c} }

func (s Exercises) Init() tea.Cmd { return exercisesLoadCmd(s.client) }

func (s Exercises) Editing() bool { return s.mode != exBrowse }

func (s Exercises) Update(msg tea.Msg) (Screen, tea.Cmd) {
	switch m := msg.(type) {
	case tea.WindowSizeMsg:
		s.w, s.h = m.Width, m.Height
		return s, nil
	case exercisesLoadedMsg:
		s.loaded = true
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		s.err, s.all = "", m.items
		s.refilter()
		return s, nil
	case exActionMsg:
		if m.err != nil {
			s.flash, s.flashOk = humanizeExErr(m.err), false
			return s, nil
		}
		s.flash, s.flashOk = m.ok, true
		return s, exercisesLoadCmd(s.client) // refetch the dictionary
	case tea.KeyPressMsg:
		if s.mode != exBrowse {
			return s.updateInput(m)
		}
		return s.handleKey(m)
	}
	if s.mode != exBrowse {
		var cmd tea.Cmd
		s.input, cmd = s.input.Update(msg)
		return s, cmd
	}
	return s, nil
}

func (s Exercises) handleKey(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	switch m.String() {
	case "j", "down":
		if s.sel < len(s.view)-1 {
			s.sel++
		}
	case "k", "up":
		if s.sel > 0 {
			s.sel--
		}
	case "/":
		return s.beginInput(exSearch, s.query)
	case "r":
		if ex, ok := s.current(); ok {
			return s.beginInput(exRename, ex.Name)
		}
	case "a":
		if _, ok := s.current(); ok {
			return s.beginInput(exAlias, "")
		}
	case "n":
		return s.beginInput(exCreate, "")
	case "d":
		ex, ok := s.current()
		if !ok {
			return s, nil
		}
		client := s.client
		return s, func() tea.Msg {
			return confirmMsg{prompt: ex.Name + " 운동 삭제?", onYes: deleteExerciseCmd(client, ex.ID)}
		}
	}
	return s, nil
}

func (s Exercises) beginInput(mode exMode, initial string) (Screen, tea.Cmd) {
	ti := textinput.New()
	ti.Prompt = ""
	ti.SetVirtualCursor(true)
	ti.SetWidth(24)
	ti.SetValue(initial)
	if mode != exSearch {
		s.flash = ""
	}
	s.input, s.mode = ti, mode
	return s, ti.Focus()
}

func (s Exercises) updateInput(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	switch m.String() {
	case "esc":
		if s.mode == exSearch {
			s.query = ""
			s.refilter()
		}
		s.mode = exBrowse
		return s, nil
	case "enter":
		return s.submitInput()
	}
	var cmd tea.Cmd
	s.input, cmd = s.input.Update(m)
	if s.mode == exSearch {
		s.query = s.input.Value()
		s.refilter()
	}
	return s, cmd
}

func (s Exercises) submitInput() (Screen, tea.Cmd) {
	val := strings.TrimSpace(s.input.Value())
	mode := s.mode
	s.mode = exBrowse
	switch mode {
	case exSearch:
		return s, nil
	case exRename:
		ex, ok := s.current()
		if !ok || val == "" || val == ex.Name {
			return s, nil
		}
		return s, renameExerciseCmd(s.client, ex.ID, val)
	case exAlias:
		ex, ok := s.current()
		if !ok || val == "" {
			return s, nil
		}
		return s, addAliasCmd(s.client, ex.ID, val)
	case exCreate:
		if val == "" {
			return s, nil
		}
		return s, createExerciseCmd(s.client, val)
	}
	return s, nil
}

func (s *Exercises) refilter() {
	q := strings.ToLower(strings.TrimSpace(s.query))
	s.view = s.view[:0]
	for i, e := range s.all {
		if q == "" || strings.Contains(strings.ToLower(e.Name), q) || strings.Contains(strings.ToLower(e.Category), q) {
			s.view = append(s.view, i)
		}
	}
	if s.sel >= len(s.view) {
		s.sel = 0
	}
}

func (s Exercises) current() (api.Exercise, bool) {
	if s.sel < 0 || s.sel >= len(s.view) {
		return api.Exercise{}, false
	}
	return s.all[s.view[s.sel]], true
}

func humanizeExErr(err error) string {
	switch {
	case err == nil:
		return ""
	case api.IsConflict(err):
		return "이미 같은 이름/별칭이 있습니다"
	case api.IsRateLimited(err):
		return "요청이 너무 많습니다. 잠시 후 다시 시도하세요"
	default:
		return err.Error()
	}
}

func (s Exercises) Mode() Mode {
	if !s.loaded && s.err == "" {
		return Mode{Label: "LOADING", Tone: theme.Cyan}
	}
	switch s.mode {
	case exSearch:
		return Mode{Label: "FILTER", Tone: theme.Cyan}
	case exRename, exAlias, exCreate:
		return Mode{Label: "INSERT", Tone: theme.Amber}
	}
	return ModeNormal
}

func (s Exercises) Context() string {
	if ex, ok := s.current(); ok {
		return truncate(ex.Name, 16)
	}
	return ""
}

func (s Exercises) StatusRight() string {
	if !s.loaded {
		return ""
	}
	if s.query != "" {
		return fmt.Sprintf("%d/%d", len(s.view), len(s.all))
	}
	return fmt.Sprintf("%d 운동", len(s.all))
}

func (s Exercises) Hints() []hintItem {
	switch s.mode {
	case exSearch:
		return []hintItem{{"⏎", "완료"}, {"esc", "지움"}}
	case exRename:
		return []hintItem{{"⏎", "이름변경"}, {"esc", "취소"}}
	case exAlias:
		return []hintItem{{"⏎", "별칭추가"}, {"esc", "취소"}}
	case exCreate:
		return []hintItem{{"⏎", "운동추가"}, {"esc", "취소"}}
	}
	return []hintItem{{"jk", "이동"}, {"/", "검색"}, {"r", "이름"}, {"a", "별칭"}, {"n", "추가"}, {"d", "삭제"}}
}

func (s Exercises) Body(w, h int) string {
	if s.err != "" {
		return centered(theme.GlyphFail+" "+s.err, theme.Red, w, h)
	}
	if !s.loaded {
		return centered("불러오는 중…", theme.Dim, w, h)
	}

	var b strings.Builder
	pad := bodyPad(h)
	listH := h - 2*pad
	switch {
	case s.mode == exCreate:
		b.WriteString(lipgloss.NewStyle().Foreground(theme.Amber).Render("+ ["+s.input.View()+"]") + "\n")
		listH--
	case s.mode == exSearch || s.query != "":
		cursor := s.query
		if s.mode == exSearch {
			cursor = s.input.View()
		}
		bar := lipgloss.NewStyle().Foreground(theme.Dim).Render("/ ") + lipgloss.NewStyle().Foreground(theme.Cyan).Render(cursor)
		b.WriteString(bar + "\n")
		listH--
	}
	if s.flash != "" {
		listH--
	}

	if len(s.view) == 0 {
		b.WriteString(lipgloss.NewStyle().Foreground(theme.Ghost).Render("일치하는 운동이 없습니다"))
	} else {
		b.WriteString(s.list(w-2, listH))
	}
	if s.flash != "" {
		tone := theme.Red
		if s.flashOk {
			tone = theme.Green
		}
		b.WriteString("\n" + lipgloss.NewStyle().Foreground(tone).Render(s.flash))
	}
	return lipgloss.NewStyle().Width(w).Height(h).Padding(pad, 1).Render(b.String())
}

func (s Exercises) list(w, h int) string {
	if h < 1 {
		h = 1
	}
	start := 0
	if s.sel >= h {
		start = s.sel - h + 1
	}
	end := start + h
	if end > len(s.view) {
		end = len(s.view)
	}

	lines := make([]string, 0, end-start)
	for i := start; i < end; i++ {
		ex := s.all[s.view[i]]
		marker := "  "
		nameStyle := lipgloss.NewStyle().Foreground(theme.Fg)
		if i == s.sel {
			marker = lipgloss.NewStyle().Foreground(theme.Amber).Render("› ")
			nameStyle = lipgloss.NewStyle().Foreground(theme.Amber).Bold(true)
		}
		cat := ""
		if ex.Category != "" {
			cat = lipgloss.NewStyle().Foreground(theme.Dim).Render(strings.ToLower(ex.Category))
		}
		// rename input replaces the name cell in-place on the selected row
		if i == s.sel && s.mode == exRename {
			lines = append(lines, marker+lipgloss.NewStyle().Foreground(theme.Amber).Render("["+s.input.View()+"]"))
			continue
		}
		left := marker + nameStyle.Render(truncate(ex.Name, w-18))
		if i == s.sel && len(ex.Aliases) > 0 {
			left += lipgloss.NewStyle().Foreground(theme.Ghost).Render(" ≈" + truncate(strings.Join(ex.Aliases, ","), 12))
		}
		lines = append(lines, justify(left, cat, w))
	}
	return strings.Join(lines, "\n")
}
