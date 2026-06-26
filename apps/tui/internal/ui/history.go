package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

type historyLoadedMsg struct {
	logs []api.LogItem
	err  error
}

type logDeletedMsg struct {
	err error
}

func historyLoadCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		logs, err := c.ListLogs(context.Background(), api.ListLogsParams{Limit: 100})
		return historyLoadedMsg{logs: logs, err: err}
	}
}

func deleteLogCmd(c *api.Client, id string) tea.Cmd {
	return func() tea.Msg {
		return logDeletedMsg{err: c.DeleteLog(context.Background(), id)}
	}
}

type sessionRow struct {
	id          string
	date        string
	performedAt time.Time
	summary     string
	volume      float64
	sets        []api.LoggedSet
}

// History is the history buffer: a recent-days heatmap strip + a navigable
// session list (j/k · enter detail · d delete). List-driven, terminal-native.
type History struct {
	client   *api.Client
	rows     []sessionRow
	dayVol   map[string]float64
	sel      int
	expanded bool
	err      string
	loaded   bool
	w, h     int
}

func NewHistory(c *api.Client) History { return History{client: c} }

func (s History) Init() tea.Cmd { return historyLoadCmd(s.client) }

func (s History) Update(msg tea.Msg) (Screen, tea.Cmd) {
	switch m := msg.(type) {
	case tea.WindowSizeMsg:
		s.w, s.h = m.Width, m.Height
		return s, nil
	case historyLoadedMsg:
		s.loaded = true
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		s.err = ""
		s.build(m.logs)
		if s.sel >= len(s.rows) {
			s.sel = 0
		}
		return s, nil
	case logDeletedMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		return s, historyLoadCmd(s.client) // refetch (progression may have rebuilt)
	case tea.KeyPressMsg:
		return s.handleKey(m)
	}
	return s, nil
}

func (s History) handleKey(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	switch m.String() {
	case "j", "down":
		if s.sel < len(s.rows)-1 {
			s.sel++
			s.expanded = false
		}
	case "k", "up":
		if s.sel > 0 {
			s.sel--
			s.expanded = false
		}
	case "enter":
		s.expanded = !s.expanded
	case "e":
		if len(s.rows) == 0 {
			return s, nil
		}
		r := s.rows[s.sel]
		return s, func() tea.Msg {
			return editLogMsg{id: r.id, performedAt: r.performedAt, sets: r.sets}
		}
	case "d":
		if len(s.rows) == 0 {
			return s, nil
		}
		r := s.rows[s.sel]
		return s, func() tea.Msg {
			return confirmMsg{prompt: r.date + " 세션 삭제?", onYes: deleteLogCmd(s.client, r.id)}
		}
	case "R":
		return s, historyLoadCmd(s.client)
	}
	return s, nil
}

func (s *History) build(logs []api.LogItem) {
	s.rows = make([]sessionRow, 0, len(logs))
	s.dayVol = make(map[string]float64)
	for _, lg := range logs {
		summary, vol := summarizeSets(lg.Sets)
		s.rows = append(s.rows, sessionRow{
			id:          lg.ID,
			date:        lg.PerformedAt.Format("01-02"),
			performedAt: lg.PerformedAt,
			summary:     summary,
			volume:      vol,
			sets:        lg.Sets,
		})
		s.dayVol[lg.PerformedAt.Format("2006-01-02")] += vol
	}
}

func summarizeSets(sets []api.LoggedSet) (string, float64) {
	var names []string
	seen := map[string]bool{}
	vol := 0.0
	for _, st := range sets {
		n := strings.TrimSpace(st.ExerciseName)
		if n != "" && !seen[n] {
			seen[n] = true
			names = append(names, n)
		}
		vol += float64(st.WeightKg) * float64(st.Reps)
	}
	disp := names
	extra := ""
	if len(names) > 3 {
		disp = names[:3]
		extra = fmt.Sprintf(" +%d", len(names)-3)
	}
	return strings.Join(disp, " · ") + extra, vol
}

func (s History) Mode() Mode {
	if !s.loaded && s.err == "" {
		return Mode{Label: "LOADING", Tone: theme.Cyan}
	}
	return ModeNormal
}

func (s History) Context() string {
	if len(s.rows) == 0 {
		return ""
	}
	return s.rows[s.sel].date
}

func (s History) StatusRight() string {
	if len(s.rows) == 0 {
		return ""
	}
	return fmt.Sprintf("%d 세션", len(s.rows))
}

func (s History) Editing() bool { return false }

func (s History) Hints() []hintItem {
	return []hintItem{{"jk", "세션"}, {"⏎", "상세"}, {"e", "편집"}, {"d", "삭제"}}
}

func (s History) Body(w, h int) string {
	if s.err != "" {
		return centered(theme.GlyphFail+" "+s.err, theme.Red, w, h)
	}
	if !s.loaded {
		return centered("불러오는 중…", theme.Dim, w, h)
	}
	if len(s.rows) == 0 {
		return centered("기록이 없습니다", theme.Ghost, w, h)
	}

	var b strings.Builder
	b.WriteString(s.heatStrip(w-2) + "\n")
	b.WriteString(lipgloss.NewStyle().Foreground(theme.Ghost).Render(strings.Repeat("─", w-2)) + "\n")
	pad := bodyPad(h)
	b.WriteString(s.list(w-2, h-2-2*pad)) // heat strip + divider take 2 rows
	return lipgloss.NewStyle().Width(w).Height(h).Padding(pad, 1).Render(b.String())
}

func (s History) heatStrip(w int) string {
	n := w - 8
	if n < 8 {
		n = 8
	}
	if n > 56 {
		n = 56
	}
	today := time.Now()
	vals := make([]float64, n)
	maxV := 0.0
	for i := 0; i < n; i++ {
		key := today.AddDate(0, 0, -(n - 1 - i)).Format("2006-01-02")
		vals[i] = s.dayVol[key]
		if vals[i] > maxV {
			maxV = vals[i]
		}
	}
	shades := []rune("░▒▓█")
	var sb strings.Builder
	for _, v := range vals {
		if v <= 0 {
			sb.WriteString(lipgloss.NewStyle().Foreground(theme.Ghost).Render("·"))
			continue
		}
		idx := 0
		if maxV > 0 {
			idx = int(v/maxV*float64(len(shades)-1) + 0.5)
		}
		if idx < 0 {
			idx = 0
		}
		if idx >= len(shades) {
			idx = len(shades) - 1
		}
		sb.WriteString(lipgloss.NewStyle().Foreground(theme.Green).Render(string(shades[idx])))
	}
	weeks := n / 7
	return sb.String() + lipgloss.NewStyle().Foreground(theme.Dim).Render(fmt.Sprintf("  %d주", weeks))
}

func (s History) list(w, h int) string {
	if h < 1 {
		h = 1
	}
	// window the list around the selection
	start := 0
	if s.sel >= h {
		start = s.sel - h + 1
	}
	end := start + h
	if end > len(s.rows) {
		end = len(s.rows)
	}

	var lines []string
	for i := start; i < end; i++ {
		r := s.rows[i]
		marker := "  "
		dateStyle := lipgloss.NewStyle().Foreground(theme.Dim)
		if i == s.sel {
			marker = lipgloss.NewStyle().Foreground(theme.Amber).Render("› ")
			dateStyle = lipgloss.NewStyle().Foreground(theme.Amber)
		}
		date := dateStyle.Render(r.date)
		vol := lipgloss.NewStyle().Foreground(theme.Dim).Render(fmt.Sprintf("%.1ft", r.volume/1000))
		left := marker + date + "  " + lipgloss.NewStyle().Foreground(theme.Fg).Render(truncate(r.summary, w-16))
		lines = append(lines, justify(left, vol, w))
		if i == s.sel && s.expanded {
			lines = append(lines, s.detail(r, w)...)
		}
	}
	return strings.Join(lines, "\n")
}

func (s History) detail(r sessionRow, w int) []string {
	// group sets by exercise → "  Squat  100×5 102.5×5"
	order := []string{}
	byEx := map[string][]string{}
	for _, st := range r.sets {
		n := strings.TrimSpace(st.ExerciseName)
		if n == "" {
			continue
		}
		if _, ok := byEx[n]; !ok {
			order = append(order, n)
		}
		byEx[n] = append(byEx[n], fmt.Sprintf("%s×%d", trimNum(float64(st.WeightKg)), st.Reps))
	}
	var out []string
	for _, n := range order {
		line := "    " + lipgloss.NewStyle().Foreground(theme.Dim).Render(truncate(n, 12)) + "  " +
			lipgloss.NewStyle().Foreground(theme.Cyan).Render(strings.Join(byEx[n], " "))
		out = append(out, fitLine(line, w))
	}
	return out
}

func trimNum(v float64) string {
	if v == float64(int64(v)) {
		return fmt.Sprintf("%d", int64(v))
	}
	return fmt.Sprintf("%.1f", v)
}
