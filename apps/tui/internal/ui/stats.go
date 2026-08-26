package ui

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"charm.land/bubbles/v2/textinput"
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

type statsBodyweightMsg struct {
	items []api.BodyweightEntry
	err   error
}

type statsFreshnessMsg struct {
	f   *api.MuscleFreshness
	err error
}

type statsVolumeMsg struct {
	volume *api.VolumeSeries
	err    error
}

type statsView int

const (
	vwE1rm statsView = iota
	vwVolume
	vwFreshness
	vwBodyweight
)

// statsViewCount is the cycle length for `v`.
const statsViewCount = 4

func statsBodyweightCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		items, err := c.Bodyweight(context.Background(), 365)
		return statsBodyweightMsg{items: items, err: err}
	}
}

func recordBodyweightCmd(c *api.Client, kg float64) tea.Cmd {
	return func() tea.Msg {
		if _, err := c.RecordBodyweight(context.Background(), kg, time.Now()); err != nil {
			return statsBodyweightMsg{err: err}
		}
		items, err := c.Bodyweight(context.Background(), 365)
		return statsBodyweightMsg{items: items, err: err}
	}
}

func statsFreshnessCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		f, err := c.MuscleFreshness(context.Background())
		return statsFreshnessMsg{f: f, err: err}
	}
}

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
	client    *api.Client
	bundle    *api.StatsBundle
	e1rm      *api.E1rmResult
	volume    *api.VolumeSeries
	view      statsView
	freshness *api.MuscleFreshness
	weights   []api.BodyweightEntry
	weightsOK bool // 로드 완료 — nil 슬라이스와 "아직 안 옴"을 구분한다
	bwInput   textinput.Model
	bwEditing bool
	lift      int
	rangeIdx  int
	braille   bool
	custom    string // exercise chosen via the picker (overrides the prs cycle)
	err       string
	w, h      int
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
	if s.view == vwBodyweight {
		s.weights, s.weightsOK = nil, false
		return s, statsBodyweightCmd(s.client)
	}
	if s.view == vwFreshness {
		// 매번 다시 받는다 — 신선도는 시간 함수라 캐시가 곧 거짓이 된다.
		s.freshness = nil
		return s, statsFreshnessCmd(s.client)
	}
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
	case statsFreshnessMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		s.freshness, s.err = m.f, ""
		return s, nil
	case statsBodyweightMsg:
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		s.weights, s.weightsOK, s.err = m.items, true, ""
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
	if s.bwEditing {
		return s.handleBodyweightInput(m)
	}
	n := 0
	if s.bundle != nil {
		n = len(s.bundle.Prs90d)
	}
	switch m.String() {
	case "v":
		// e1RM → 볼륨 → 신선도 → 체중 → e1RM. 뷰가 넷이 됐지만 키는 그대로 하나다 —
		// 새 바인딩을 만들면 외울 것이 늘고, 순환은 이미 있는 관습이다.
		s.view = (s.view + 1) % statsViewCount
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
		// 신선도는 범위 개념이 없다(모델이 8주 창을 고정으로 쓴다). 눌러도 반응하지
		// 않는 편이 낫다 — 범위를 바꾸는 척하고 같은 화면을 다시 그리면 거짓말이다.
		if s.view == vwFreshness || s.view == vwBodyweight {
			return s, nil
		}
		s.rangeIdx = (s.rangeIdx + 1) % len(statsRanges)
		return s.reload()
	case "[", "h":
		if s.view == vwFreshness || s.view == vwBodyweight {
			return s, nil
		}
		s.rangeIdx = (s.rangeIdx - 1 + len(statsRanges)) % len(statsRanges)
		return s.reload()
	case "a":
		// `n`은 이미 "다음 운동"이라 못 쓴다. `a`(add)로 연다 — exercises 버퍼도
		// 추가 계열에 이 자리를 쓰고 있어 손가락이 헷갈리지 않는다.
		if s.view == vwBodyweight {
			ti := textinput.New()
			ti.Placeholder = "72.5"
			ti.SetWidth(8)
			s.bwInput, s.bwEditing = ti, true
			return s, ti.Focus()
		}
	case "b":
		s.braille = !s.braille
	case "R":
		return s, statsBundleCmd(s.client)
	}
	return s, nil
}

// handleBodyweightInput drives the inline weight entry.
func (s Stats) handleBodyweightInput(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	switch m.String() {
	case "esc":
		s.bwEditing = false
		return s, nil
	case "enter":
		raw := strings.TrimSpace(s.bwInput.Value())
		s.bwEditing = false
		kg, err := strconv.ParseFloat(raw, 64)
		if err != nil || kg <= 0 {
			// 잘못된 입력은 조용히 버리지 않는다 — 왜 아무 일도 안 났는지 알려 준다.
			s.err = "체중은 숫자여야 합니다 (예: 72.5)"
			return s, nil
		}
		s.err = ""
		return s, recordBodyweightCmd(s.client, kg)
	}
	var cmd tea.Cmd
	s.bwInput, cmd = s.bwInput.Update(m)
	return s, cmd
}

func (s Stats) Mode() Mode {
	if s.bundle == nil && s.err == "" {
		return Mode{Label: "LOADING", Tone: theme.Cyan}
	}
	return ModeNormal
}

func (s Stats) Context() string {
	if s.view == vwBodyweight {
		return "체중 추이"
	}
	if s.view == vwFreshness {
		return "신선도"
	}
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
	// 신선도 뷰에서는 범위 라벨이 의미가 없다 — 모델이 8주 창을 고정으로 쓴다.
	// 그대로 두면 `[`·`]`가 먹히는 것처럼 보인다.
	if s.view == vwBodyweight {
		if !s.weightsOK {
			return ""
		}
		return fmt.Sprintf("%d건", len(s.weights))
	}
	if s.view == vwFreshness {
		if s.freshness == nil {
			return ""
		}
		return fmt.Sprintf("%d주 창", s.freshness.CapacityWeeks)
	}
	return statsRanges[s.rangeIdx].label
}

func (s Stats) Editing() bool { return s.bwEditing }

func (s Stats) Hints() []hintItem {
	if s.bwEditing {
		return []hintItem{{"⏎", "기록"}, {"esc", "취소"}}
	}
	switch s.view {
	case vwVolume:
		return []hintItem{{"v", "신선도"}, {"[ ]", "범위"}, {"b", "차트"}}
	case vwFreshness:
		return []hintItem{{"v", "체중"}}
	case vwBodyweight:
		return []hintItem{{"v", "e1RM"}, {"a", "기록"}, {"b", "차트"}}
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
	if s.view == vwBodyweight {
		if !s.weightsOK {
			return centered("불러오는 중…", theme.Dim, w, h)
		}
		body := bodyweightBody(s.weights, w-2, h-2*pad, s.braille)
		if s.bwEditing {
			body = "체중(kg): " + s.bwInput.View() + "\n\n" + body
		}
		return lipgloss.NewStyle().Width(w).Height(h).Padding(pad, 1).Render(body)
	}
	if s.view == vwFreshness {
		if s.freshness == nil {
			return centered("불러오는 중…", theme.Dim, w, h)
		}
		return lipgloss.NewStyle().Width(w).Height(h).Padding(pad, 1).
			Render(freshnessBody(s.freshness, w-2))
	}
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
