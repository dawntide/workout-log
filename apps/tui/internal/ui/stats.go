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

type statsVolumeMsg struct {
	volume *api.VolumeSeries
	err    error
}

type statsView int

const (
	vwE1rm statsView = iota
	vwVolume
)

func statsVolumeCmd(c *api.Client, rangeDays int) tea.Cmd {
	return func() tea.Msg {
		v, err := c.VolumeSeries(context.Background(), rangeDays)
		return statsVolumeMsg{volume: v, err: err}
	}
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
	volume   *api.VolumeSeries
	view     statsView
	lift     int
	rangeIdx int
	braille  bool
	custom   string // exercise chosen via the picker (overrides the prs cycle)
	err      string
	w, h     int
}

func NewStats(c *api.Client) Stats { return Stats{client: c, braille: true, rangeIdx: 2} }

func (s Stats) Init() tea.Cmd { return statsBundleCmd(s.client) }

func (s Stats) currentLift() string {
	if s.custom != "" {
		return s.custom
	}
	if s.bundle == nil || s.lift >= len(s.bundle.Prs90d) {
		return ""
	}
	return s.bundle.Prs90d[s.lift].ExerciseName
}

func (s Stats) reload() (Stats, tea.Cmd) {
	if s.view == vwVolume {
		s.volume = nil
		return s, statsVolumeCmd(s.client, statsRanges[s.rangeIdx].days)
	}
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
	case statsVolumeMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		s.volume, s.err = m.volume, ""
		return s, nil
	case pickedMsg:
		if m.tag == "exercise" && strings.TrimSpace(m.value) != "" {
			s.custom, s.e1rm = m.value, nil
			return s, statsE1rmCmd(s.client, m.value, statsRanges[s.rangeIdx].days)
		}
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
	case "v":
		if s.view == vwE1rm {
			s.view = vwVolume
		} else {
			s.view = vwE1rm
		}
		return s.reload()
	case "/":
		if s.view == vwE1rm {
			return s, openStatsExercisePickerCmd(s.client)
		}
	case "j", "down", "n":
		if s.view == vwE1rm && n > 0 {
			s.custom = ""
			s.lift = (s.lift + 1) % n
			return s.reload()
		}
	case "k", "up", "p":
		if s.view == vwE1rm && n > 0 {
			s.custom = ""
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
	case "R":
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
	if s.view == vwVolume {
		return "주간 볼륨"
	}
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

func (s Stats) Hints() []hintItem {
	if s.view == vwVolume {
		return []hintItem{{"v", "e1RM"}, {"[ ]", "범위"}, {"b", "차트"}}
	}
	return []hintItem{{"jk", "운동"}, {"/", "검색"}, {"[ ]", "범위"}, {"b", "차트"}, {"v", "볼륨"}}
}

func (s Stats) Body(w, h int) string {
	if s.err != "" {
		return centered(theme.GlyphFail+" "+s.err, theme.Red, w, h)
	}
	if s.bundle == nil {
		return centered("불러오는 중…", theme.Dim, w, h)
	}
	pad := bodyPad(h)
	chartH := h - 4 - 2*pad // header(1)+blank(1)+summary(1)+1 slack; pad takes 2
	var b strings.Builder
	if s.view == vwVolume {
		b.WriteString(s.volumeHeader(w) + "\n\n")
		b.WriteString(s.volumeChart(w-2, chartH) + "\n")
		b.WriteString(s.volumeSummary())
	} else {
		if len(s.bundle.Prs90d) == 0 && s.custom == "" {
			return centered("기록이 충분하지 않습니다 (/ 운동 검색)", theme.Ghost, w, h)
		}
		b.WriteString(s.header(w) + "\n\n")
		b.WriteString(s.chart(w-2, chartH) + "\n")
		b.WriteString(s.summary())
	}
	return lipgloss.NewStyle().Width(w).Height(h).Padding(pad, 1).Render(b.String())
}

func (s Stats) rangeTabs() string {
	var tabs []string
	for i, r := range statsRanges {
		if i == s.rangeIdx {
			tabs = append(tabs, lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render("["+r.label+"]"))
		} else {
			tabs = append(tabs, lipgloss.NewStyle().Foreground(theme.Dim).Render(r.label))
		}
	}
	return strings.Join(tabs, " ")
}

func (s Stats) header(w int) string {
	left := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render("e1RM " + strings.ToUpper(s.currentLift()))
	return justify(left, s.rangeTabs(), w-2)
}

func (s Stats) volumeHeader(w int) string {
	left := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render("VOLUME 주간")
	return justify(left, s.rangeTabs(), w-2)
}

func (s Stats) volumeChart(w, h int) string {
	if h < 2 {
		h = 2
	}
	if s.volume == nil {
		return lipgloss.NewStyle().Foreground(theme.Dim).Render("불러오는 중…")
	}
	vals := make([]float64, len(s.volume.Series))
	for i, p := range s.volume.Series {
		vals[i] = float64(p.Tonnage)
	}
	if len(vals) == 0 {
		return lipgloss.NewStyle().Foreground(theme.Ghost).Render("이 범위에 데이터 없음")
	}
	if len(vals) == 1 {
		return lipgloss.NewStyle().Foreground(theme.Green).Render(fmt.Sprintf("● %.1ft  (1주)", vals[0]/1000))
	}
	return lineChart(vals, w, h, s.braille)
}

func (s Stats) volumeSummary() string {
	if s.volume == nil || len(s.volume.Series) == 0 {
		return ""
	}
	total, max := 0.0, 0.0
	for _, p := range s.volume.Series {
		t := float64(p.Tonnage)
		total += t
		if t > max {
			max = t
		}
	}
	avg := total / float64(len(s.volume.Series))
	out := lipgloss.NewStyle().Foreground(theme.Gold).Render(fmt.Sprintf("합 %.1ft", total/1000))
	out += "  " + dim("·") + "  " + lipgloss.NewStyle().Foreground(theme.Cyan).Render(fmt.Sprintf("평균 %.1ft/주", avg/1000))
	out += "  " + dim("·") + "  " + dim(fmt.Sprintf("최대 %.1ft", max/1000))
	return out
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
	// best e1RM = the PR high point; highlight it gold on the trend (§5 "gold ★ PR").
	peakIdx := 0
	for i, v := range vals {
		if v > vals[peakIdx] {
			peakIdx = i
		}
	}
	return lineChartMarked(vals, w, h, s.braille, peakIdx)
}

func (s Stats) summary() string {
	if s.e1rm == nil || len(s.e1rm.Series) == 0 {
		return ""
	}
	best, first := 0.0, float64(s.e1rm.Series[0].E1rm)
	for _, p := range s.e1rm.Series {
		if v := float64(p.E1rm); v > best {
			best = v
		}
	}
	out := lipgloss.NewStyle().Foreground(theme.Gold).Render(fmt.Sprintf("%s best %.0f", theme.GlyphPeak, best))
	if imp := best - first; imp != 0 {
		tone, sign := theme.Green, "+"
		if imp < 0 {
			tone, sign = theme.Red, ""
		}
		out += "  " + dim("·") + "  " + lipgloss.NewStyle().Foreground(tone).Render(fmt.Sprintf("%s%.0f", sign, imp))
	}
	if s.bundle != nil {
		out += "  " + dim(fmt.Sprintf("·  30d %.0ft", float64(s.bundle.Tonnage30d)/1000))
	}
	return out
}
