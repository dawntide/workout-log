package ui

import (
	"context"
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

var statsRanges = []struct {
	label string
	days  int
}{
	{"7d", 7}, {"1m", 30}, {"3m", 90}, {"6m", 180}, {"1y", 365}, {"all", 0},
}

type statsBundleMsg struct {
	bundle *api.StatsBundle
	err    error
}

type statsE1rmMsg struct {
	e1rm *api.E1rmResult
	err  error
}

func statsBundleCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		b, err := c.Bundle(context.Background(), 90)
		return statsBundleMsg{bundle: b, err: err}
	}
}

func statsE1rmCmd(c *api.Client, exercise string, rangeDays int) tea.Cmd {
	return func() tea.Msg {
		e, err := c.E1rm(context.Background(), exercise, rangeDays)
		return statsE1rmMsg{e1rm: e, err: err}
	}
}

// Stats is the stats buffer: an e1RM trend chart for a selected lift over a
// selected range, plus a summary. Lifts come from the stats bundle (your
// tracked PRs); cycle them with j/k, range with [ ], chart style with b.
type Stats struct {
	client   *api.Client
	bundle   *api.StatsBundle
	e1rm     *api.E1rmResult
	lift     int
	rangeIdx int
	braille  bool
	err      string
	w, h     int
}

func NewStats(c *api.Client) Stats { return Stats{client: c, braille: true, rangeIdx: 2} }

func (s Stats) Init() tea.Cmd { return statsBundleCmd(s.client) }

func (s Stats) currentLift() string {
	if s.bundle == nil || s.lift >= len(s.bundle.Prs90d) {
		return ""
	}
	return s.bundle.Prs90d[s.lift].ExerciseName
}

func (s Stats) reload() (Stats, tea.Cmd) {
	lift := s.currentLift()
	if lift == "" {
		return s, nil
	}
	s.e1rm = nil
	return s, statsE1rmCmd(s.client, lift, statsRanges[s.rangeIdx].days)
}

func (s Stats) Update(msg tea.Msg) (Screen, tea.Cmd) {
	switch m := msg.(type) {
	case tea.WindowSizeMsg:
		s.w, s.h = m.Width, m.Height
		return s, nil
	case statsBundleMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		s.bundle, s.err = m.bundle, ""
		ns, cmd := s.reload()
		return ns, cmd
	case statsE1rmMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		s.e1rm, s.err = m.e1rm, ""
		return s, nil
	case tea.KeyPressMsg:
		return s.handleKey(m)
	}
	return s, nil
}

func (s Stats) handleKey(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	n := 0
	if s.bundle != nil {
		n = len(s.bundle.Prs90d)
	}
	switch m.String() {
	case "j", "down", "n":
		if n > 0 {
			s.lift = (s.lift + 1) % n
			return s.reload()
		}
	case "k", "up", "p":
		if n > 0 {
			s.lift = (s.lift - 1 + n) % n
			return s.reload()
		}
	case "]", "l":
		s.rangeIdx = (s.rangeIdx + 1) % len(statsRanges)
		return s.reload()
	case "[", "h":
		s.rangeIdx = (s.rangeIdx - 1 + len(statsRanges)) % len(statsRanges)
		return s.reload()
	case "b":
		s.braille = !s.braille
	case "r":
		return s, statsBundleCmd(s.client)
	}
	return s, nil
}

func (s Stats) Mode() Mode {
	if s.bundle == nil && s.err == "" {
		return Mode{Label: "LOADING", Tone: theme.Cyan}
	}
	return ModeNormal
}

func (s Stats) Context() string {
	if lift := s.currentLift(); lift != "" {
		return truncate(lift, 14)
	}
	return ""
}

func (s Stats) StatusRight() string {
	if s.bundle == nil {
		return ""
	}
	return statsRanges[s.rangeIdx].label
}

func (s Stats) Editing() bool { return false }

func (s Stats) Hints(int) string {
	return joinHints(hint("jk", "운동"), hint("[ ]", "범위"), hint("b", "차트"))
}

func (s Stats) Body(w, h int) string {
	if s.err != "" {
		return centered(theme.GlyphFail+" "+s.err, theme.Red, w, h)
	}
	if s.bundle == nil {
		return centered("불러오는 중…", theme.Dim, w, h)
	}
	if len(s.bundle.Prs90d) == 0 {
		return centered("기록이 충분하지 않습니다", theme.Ghost, w, h)
	}

	var b strings.Builder
	b.WriteString(s.header(w) + "\n\n")
	b.WriteString(s.chart(w-2, h-6) + "\n")
	b.WriteString(s.summary())
	return lipgloss.NewStyle().Width(w).Height(h).Padding(1, 1).Render(b.String())
}

func (s Stats) header(w int) string {
	left := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render("e1RM " + strings.ToUpper(s.currentLift()))
	var tabs []string
	for i, r := range statsRanges {
		if i == s.rangeIdx {
			tabs = append(tabs, lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render("["+r.label+"]"))
		} else {
			tabs = append(tabs, lipgloss.NewStyle().Foreground(theme.Dim).Render(r.label))
		}
	}
	return justify(left, strings.Join(tabs, " "), w-2)
}

func (s Stats) chart(w, h int) string {
	if h < 2 {
		h = 2
	}
	if s.e1rm == nil {
		return lipgloss.NewStyle().Foreground(theme.Dim).Render("불러오는 중…")
	}
	vals := make([]float64, len(s.e1rm.Series))
	for i, p := range s.e1rm.Series {
		vals[i] = float64(p.E1rm)
	}
	if len(vals) == 0 {
		return lipgloss.NewStyle().Foreground(theme.Ghost).Render("이 범위에 데이터 없음")
	}
	if len(vals) == 1 {
		return lipgloss.NewStyle().Foreground(theme.Green).Render(fmt.Sprintf("● %.0f  (1 세션)", vals[0]))
	}
	return lineChart(vals, w, h, s.braille)
}

func (s Stats) summary() string {
	pr := s.bundle.Prs90d[s.lift]
	best := lipgloss.NewStyle().Foreground(theme.Gold).Render(fmt.Sprintf("best %.0f", float64(pr.Best.E1rm)))
	imp := ""
	if pr.Improvement != 0 {
		sign := "+"
		if pr.Improvement < 0 {
			sign = ""
		}
		tone := theme.Green
		if pr.Improvement < 0 {
			tone = theme.Red
		}
		imp = "  " + lipgloss.NewStyle().Foreground(theme.Dim).Render("·") + "  " +
			lipgloss.NewStyle().Foreground(tone).Render(fmt.Sprintf("%s%.0f", sign, float64(pr.Improvement)))
	}
	vol := "  " + lipgloss.NewStyle().Foreground(theme.Dim).Render(fmt.Sprintf("·  30d %.0ft", float64(s.bundle.Tonnage30d)/1000))
	return best + imp + vol
}
