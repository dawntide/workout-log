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

const defaultRestSeconds = 90

type logCol int

const (
	colWeight logCol = iota
	colReps
)

type editTarget int

const (
	editNone editTarget = iota
	editName
	editCell
)

type setEntry struct {
	weight string
	reps   string
	done   bool
}

type exGroup struct {
	name string
	prev string // "100×5" previous performance (filled when a plan/session loads)
	tgt  string // target weight
	sets []setEntry
}

type restState struct {
	active    bool
	remaining int
	total     int
}

type saveResultMsg struct {
	detail *api.LogDetail
	err    error
	edited bool
}

// saveCmd persists the done sets: PATCH when editID is set (editing a past
// session), POST otherwise. A zero performedAt means "now" (new log); editing
// preserves the original timestamp.
func saveCmd(c *api.Client, groups []exGroup, editID string, performedAt time.Time) tea.Cmd {
	var sets []api.WorkoutSet
	for _, g := range groups {
		name := strings.TrimSpace(g.name)
		for _, s := range g.sets {
			if !s.done {
				continue
			}
			w, _ := strconv.ParseFloat(s.weight, 64)
			reps, _ := strconv.Atoi(s.reps)
			sets = append(sets, api.WorkoutSet{ExerciseName: name, WeightKg: w, Reps: reps})
		}
	}
	return func() tea.Msg {
		at := performedAt
		if at.IsZero() {
			at = time.Now()
		}
		req := api.CreateLogRequest{Sets: sets, PerformedAt: at}
		id, err := editID, error(nil)
		if editID != "" {
			err = c.UpdateLog(context.Background(), editID, req)
		} else {
			id, err = c.CreateLog(context.Background(), req)
		}
		if err != nil {
			return saveResultMsg{err: err, edited: editID != ""}
		}
		detail, err := c.GetLog(context.Background(), id)
		return saveResultMsg{detail: detail, err: err, edited: editID != ""}
	}
}

type sessionLoadedMsg struct {
	snapshot *api.SessionSnapshot
	prev     map[string]string // exerciseName(lower) → "weight×reps" last performance
	err      error
}

func loadSessionCmd(c *api.Client, planID string) tea.Cmd {
	return func() tea.Msg {
		s, err := c.GenerateSession(context.Background(), planID)
		if err != nil {
			return sessionLoadedMsg{err: err}
		}
		logs, _ := c.ListLogs(context.Background(), api.ListLogsParams{Limit: 50})
		return sessionLoadedMsg{snapshot: &s.Snapshot, prev: buildPrevMap(logs)}
	}
}

// buildPrevMap maps each exercise (lowercased) to its top set in the most
// recent session that contained it: "weight×reps".
func buildPrevMap(logs []api.LogItem) map[string]string {
	m := map[string]string{}
	for _, lg := range logs { // newest first
		top := map[string]api.LoggedSet{}
		for _, st := range lg.Sets {
			n := strings.ToLower(strings.TrimSpace(st.ExerciseName))
			if n == "" {
				continue
			}
			if b, ok := top[n]; !ok || float64(st.WeightKg) > float64(b.WeightKg) {
				top[n] = st
			}
		}
		for n, st := range top {
			if _, seen := m[n]; !seen {
				m[n] = fmt.Sprintf("%s×%d", trimNum(float64(st.WeightKg)), st.Reps)
			}
		}
	}
	return m
}

// Log is the today buffer: exercises grouped (a section header per exercise),
// each holding its sets. Navigate sets with j/k, cells (weight/reps) with h/l,
// edit inline in INSERT. `e` starts a new exercise.
type Log struct {
	client      *api.Client
	groups      []exGroup
	gi, si      int // active group / set index
	col         logCol
	editing     bool
	target      editTarget
	edit        textinput.Model
	rest        restState
	saving      bool
	editID      string    // non-empty when editing a past log (saves via PATCH)
	performedAt time.Time // preserved on edit; zero = now (new log)
	status      string
	statusErr   bool
	w, h        int
}

func NewLog(client *api.Client) Log { return Log{client: client} }

func (l Log) Editing() bool { return l.editing }
func (l Log) Init() tea.Cmd { return nil }

func (l Log) Mode() Mode {
	switch {
	case l.rest.active:
		return Mode{Label: fmt.Sprintf("REST %ds", l.rest.remaining), Tone: theme.Cyan}
	case l.saving:
		return Mode{Label: "SAVING", Tone: theme.Amber}
	case l.editing:
		return Mode{Label: "INSERT", Tone: theme.Amber}
	default:
		return ModeNormal
	}
}

func (l Log) Context() string {
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
	if n == 0 {
		return ""
	}
	return fmt.Sprintf("%d set%s", n, plural(n))
}

func (l Log) Hints(int) string {
	if l.editing {
		return joinHints(hint("⏎", "다음"), hint("tab", "셀"), hint("esc", "취소"))
	}
	return joinHints(hint("i", "편집"), hint("e", "운동"), hint("s", "저장"))
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
	case tickMsg:
		if l.rest.active && l.rest.remaining > 0 {
			l.rest.remaining--
			if l.rest.remaining <= 0 {
				l.rest.active = false
			}
		}
		return l, nil
	case saveResultMsg:
		l.saving = false
		verb := "저장"
		if m.edited {
			verb = "수정"
		}
		if m.err != nil {
			l.status, l.statusErr = verb+" 실패: "+humanizeAuthErr(m.err), true
			return l, nil
		}
		l.status, l.statusErr = summarizePRs(m.detail, m.edited), false
		l.groups, l.gi, l.si = nil, 0, 0
		l.editID, l.performedAt = "", time.Time{}
		return l, nil
	case editLogMsg:
		l.loadForEdit(m)
		return l, nil
	case pickedMsg:
		if m.tag == "exercise" && strings.TrimSpace(m.value) != "" {
			l.groups = append(l.groups, exGroup{name: m.value, sets: []setEntry{{}}})
			l.gi, l.si, l.col = len(l.groups)-1, 0, colWeight
			nl, cmd := l.beginEdit(editCell)
			return nl, cmd
		}
		return l, nil
	case planActivatedMsg:
		return l, loadSessionCmd(l.client, m.id)
	case sessionLoadedMsg:
		if m.err != nil {
			l.status, l.statusErr = "세션 로드 실패: "+humanizeAuthErr(m.err), true
			return l, nil
		}
		l.loadSnapshot(m.snapshot, m.prev)
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

func (l Log) updateNormal(m tea.KeyPressMsg) (Log, tea.Cmd) {
	switch m.String() {
	case "j", "down":
		l.moveSet(1)
	case "k", "up":
		l.moveSet(-1)
	case "h", "left":
		l.col = colWeight
	case "l", "right":
		l.col = colReps
	case "r":
		l.rest.active = false
	case "i", "enter":
		if len(l.groups) == 0 {
			return l, openExercisePickerCmd(l.client)
		}
		return l.beginEdit(editCell)
	case "e":
		return l, openExercisePickerCmd(l.client)
	case "x":
		return l.toggleDone()
	case "o":
		return l.addSet()
	case "d":
		return l.deleteSet()
	case "s":
		return l.save()
	}
	return l, nil
}

func (l Log) updateEditing(m tea.KeyPressMsg) (Log, tea.Cmd) {
	switch m.String() {
	case "esc":
		l.editing, l.target = false, editNone
		return l, nil
	case "enter":
		l.writeEdit()
		l.editing = false
		switch l.target {
		case editName:
			l.col = colWeight
			return l.beginEdit(editCell)
		case editCell:
			if l.col == colWeight {
				l.col = colReps
				return l.beginEdit(editCell)
			}
			return l.completeSet()
		}
		return l, nil
	case "tab":
		l.writeEdit()
		l.editing = false
		if l.target == editName {
			l.col = colWeight
		} else if l.col == colWeight {
			l.col = colReps
		} else {
			l.col = colWeight
		}
		return l.beginEdit(editCell)
	}
	var cmd tea.Cmd
	l.edit, cmd = l.edit.Update(m)
	return l, cmd
}

func (l *Log) moveSet(dir int) {
	if len(l.groups) == 0 {
		return
	}
	if dir > 0 {
		if l.si < len(l.groups[l.gi].sets)-1 {
			l.si++
		} else if l.gi < len(l.groups)-1 {
			l.gi, l.si = l.gi+1, 0
		}
	} else {
		if l.si > 0 {
			l.si--
		} else if l.gi > 0 {
			l.gi = l.gi - 1
			l.si = len(l.groups[l.gi].sets) - 1
		}
	}
}

// openExercisePickerCmd fetches the exercise dictionary and asks the frame to
// open a fuzzy picker tagged "exercise".
func openExercisePickerCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		exs, _ := c.Exercises(context.Background(), "")
		items := make([]pickerItem, len(exs))
		for i, e := range exs {
			items[i] = pickerItem{label: e.Name, value: e.Name}
		}
		return openPickerMsg{prompt: "운동 ", tag: "exercise", items: items}
	}
}

func (l Log) addSet() (Log, tea.Cmd) {
	if len(l.groups) == 0 {
		return l, openExercisePickerCmd(l.client)
	}
	at := l.si + 1
	sets := l.groups[l.gi].sets
	ns := make([]setEntry, 0, len(sets)+1)
	ns = append(ns, sets[:at]...)
	ns = append(ns, setEntry{})
	ns = append(ns, sets[at:]...)
	l.groups[l.gi].sets = ns
	l.si, l.col = at, colWeight
	return l, nil
}

func (l Log) deleteSet() (Log, tea.Cmd) {
	if len(l.groups) == 0 {
		return l, nil
	}
	if len(l.groups[l.gi].sets) <= 1 {
		l.groups = append(l.groups[:l.gi], l.groups[l.gi+1:]...)
		if l.gi >= len(l.groups) {
			l.gi = len(l.groups) - 1
		}
		if l.gi < 0 {
			l.gi = 0
		}
		l.si = 0
		return l, nil
	}
	sets := l.groups[l.gi].sets
	l.groups[l.gi].sets = append(sets[:l.si], sets[l.si+1:]...)
	if l.si >= len(l.groups[l.gi].sets) {
		l.si = len(l.groups[l.gi].sets) - 1
	}
	return l, nil
}

func (l Log) toggleDone() (Log, tea.Cmd) {
	if len(l.groups) == 0 {
		return l, nil
	}
	s := &l.groups[l.gi].sets[l.si]
	if s.done {
		s.done = false
		return l, nil
	}
	if strings.TrimSpace(l.groups[l.gi].name) == "" || !validNum(s.weight) || !validInt(s.reps) {
		l.status, l.statusErr = "완료하려면 무게·reps가 필요합니다", true
		return l, nil
	}
	s.done = true
	l.status, l.statusErr = "", false
	l.rest = restState{active: true, remaining: defaultRestSeconds, total: defaultRestSeconds}
	return l, nil
}

func (l Log) completeSet() (Log, tea.Cmd) {
	s := l.groups[l.gi].sets[l.si]
	if strings.TrimSpace(l.groups[l.gi].name) == "" || !validNum(s.weight) || !validInt(s.reps) {
		l.status, l.statusErr = "무게·reps를 정확히 입력하세요", true
		return l, nil
	}
	l.groups[l.gi].sets[l.si].done = true
	l.status, l.statusErr = "", false
	l.rest = restState{active: true, remaining: defaultRestSeconds, total: defaultRestSeconds}
	l.groups[l.gi].sets = append(l.groups[l.gi].sets, setEntry{})
	l.si, l.col = len(l.groups[l.gi].sets)-1, colWeight
	return l.beginEdit(editCell)
}

func (l Log) save() (Log, tea.Cmd) {
	if l.saving {
		return l, nil
	}
	if l.doneCount() == 0 {
		l.status, l.statusErr = "완료된 세트가 없습니다 (x로 완료)", true
		return l, nil
	}
	l.saving, l.status, l.statusErr = true, "", false
	return l, saveCmd(l.client, l.groups, l.editID, l.performedAt)
}

// loadForEdit replaces today's buffer with a past session's sets (grouped by
// exercise, every set pre-marked done) so the user can revise and PATCH it.
func (l *Log) loadForEdit(m editLogMsg) {
	var order []string
	byEx := map[string]*exGroup{}
	for _, st := range m.sets {
		n := strings.TrimSpace(st.ExerciseName)
		if n == "" {
			continue
		}
		g, ok := byEx[n]
		if !ok {
			byEx[n] = &exGroup{name: n}
			g = byEx[n]
			order = append(order, n)
		}
		g.sets = append(g.sets, setEntry{
			weight: trimNum(float64(st.WeightKg)),
			reps:   strconv.Itoa(st.Reps),
			done:   true,
		})
	}
	groups := make([]exGroup, 0, len(order))
	for _, n := range order {
		groups = append(groups, *byEx[n])
	}
	if len(groups) == 0 {
		return
	}
	l.groups, l.gi, l.si, l.col = groups, 0, 0, colWeight
	l.editing, l.target = false, editNone
	l.editID, l.performedAt = m.id, m.performedAt
	l.rest.active = false
	l.status, l.statusErr = theme.GlyphDone+" 편집 로드됨 — s로 저장", false
}

func (l Log) beginEdit(t editTarget) (Log, tea.Cmd) {
	ti := textinput.New()
	ti.Prompt = ""
	ti.SetVirtualCursor(true)
	switch t {
	case editName:
		ti.SetWidth(16)
		ti.SetValue(l.groups[l.gi].name)
	case editCell:
		s := l.groups[l.gi].sets[l.si]
		if l.col == colWeight {
			ti.SetWidth(6)
			ti.SetValue(s.weight)
		} else {
			ti.SetWidth(4)
			ti.SetValue(s.reps)
		}
	}
	l.edit, l.editing, l.target = ti, true, t
	return l, l.edit.Focus()
}

func (l *Log) writeEdit() {
	v := strings.TrimSpace(l.edit.Value())
	switch l.target {
	case editName:
		l.groups[l.gi].name = v
	case editCell:
		if l.col == colWeight {
			l.groups[l.gi].sets[l.si].weight = v
		} else {
			l.groups[l.gi].sets[l.si].reps = v
		}
	}
}

// loadSnapshot replaces today's groups with a plan's generated session,
// pre-filling each set's weight with its target and showing tgt in the header.
func (l *Log) loadSnapshot(s *api.SessionSnapshot, prev map[string]string) {
	if s == nil {
		return
	}
	var groups []exGroup
	for _, ex := range s.Exercises {
		g := exGroup{name: ex.ExerciseName, prev: prev[strings.ToLower(strings.TrimSpace(ex.ExerciseName))]}
		maxTgt, tgtReps := 0.0, 0
		for _, st := range ex.Sets {
			w := float64(st.TargetWeightKg)
			g.sets = append(g.sets, setEntry{weight: trimNum(w), reps: ""})
			if w >= maxTgt {
				maxTgt, tgtReps = w, st.Reps
			}
		}
		if len(g.sets) == 0 {
			g.sets = []setEntry{{}}
		}
		if maxTgt > 0 {
			g.tgt = fmt.Sprintf("%s×%d", trimNum(maxTgt), tgtReps)
		}
		groups = append(groups, g)
	}
	if len(groups) == 0 {
		return
	}
	l.groups, l.gi, l.si, l.col = groups, 0, 0, colWeight
	l.status, l.statusErr = theme.GlyphDone+" 플랜 세션 로드됨", false
}

// --- rendering ---

func (l Log) Body(w, h int) string {
	var b strings.Builder
	if l.editID != "" {
		b.WriteString(lipgloss.NewStyle().Foreground(theme.Amber).Render("■ 편집 중 · "+l.performedAt.Format("2006-01-02")) + "\n\n")
	}
	if len(l.groups) == 0 {
		b.WriteString(lipgloss.NewStyle().Foreground(theme.Ghost).Render("오늘 기록이 비어 있습니다.\n\n"))
		b.WriteString(hint("e", "운동 추가") + lipgloss.NewStyle().Foreground(theme.Dim).Render(" 로 시작"))
	} else {
		groups := make([]string, len(l.groups))
		for gi, g := range l.groups {
			groups[gi] = l.renderGroup(gi, g, w)
		}
		b.WriteString(strings.Join(groups, "\n\n"))
	}
	if l.rest.active {
		b.WriteString("\n\n" + l.restBar(w))
	}
	if l.status != "" {
		tone := theme.Green
		if l.statusErr {
			tone = theme.Red
		}
		b.WriteString("\n\n" + lipgloss.NewStyle().Foreground(tone).Render(l.status))
	}
	return lipgloss.NewStyle().Width(w).Height(h).Padding(1, 1).Render(b.String())
}

func (l Log) renderGroup(gi int, g exGroup, w int) string {
	var header string
	if gi == l.gi && l.editing && l.target == editName {
		header = l.edit.View()
	} else {
		name := g.name
		if strings.TrimSpace(name) == "" {
			name = "운동?"
		}
		header = lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render(strings.ToUpper(name))
		ctx := ""
		if g.prev != "" {
			ctx = "prev " + g.prev
		}
		if g.tgt != "" {
			if ctx != "" {
				ctx += "  "
			}
			ctx += "tgt " + g.tgt
		}
		if ctx != "" {
			header = justify(header, lipgloss.NewStyle().Foreground(theme.Dim).Render(ctx), w-2)
		}
	}

	lines := []string{header}
	for si, s := range g.sets {
		lines = append(lines, l.renderSet(gi, si, s))
	}
	return strings.Join(lines, "\n")
}

func (l Log) renderSet(gi, si int, s setEntry) string {
	active := gi == l.gi && si == l.si
	marker := "   "
	if active {
		marker = lipgloss.NewStyle().Foreground(theme.Amber).Render(" › ")
	}
	wcell := l.setCell(active, colWeight, orDot(s.weight), 6)
	rcell := l.setCell(active, colReps, orDot(s.reps), 3)
	sep := lipgloss.NewStyle().Foreground(theme.Dim).Render(" × ")

	done := lipgloss.NewStyle().Foreground(theme.Ghost).Render("·")
	if s.done {
		done = lipgloss.NewStyle().Foreground(theme.Green).Render(theme.GlyphDone)
	}
	e1rm := ""
	if v := setE1rm(s); v > 0 {
		e1rm = lipgloss.NewStyle().Foreground(theme.Dim).Render(fmt.Sprintf(" e%.0f", v))
	}
	return marker + wcell + sep + rcell + "   " + done + e1rm
}

func (l Log) setCell(active bool, c logCol, text string, width int) string {
	if active && l.editing && l.target == editCell && l.col == c {
		return l.edit.View()
	}
	if active && l.col == c {
		return lipgloss.NewStyle().Foreground(theme.Amber).Width(width).Render(truncate(text, width))
	}
	base := lipgloss.NewStyle().Foreground(theme.Cyan)
	if c == colReps {
		base = lipgloss.NewStyle().Foreground(theme.Fg)
	}
	return base.Width(width).Render(truncate(text, width))
}

func (l Log) restBar(w int) string {
	cells := 16
	if w < 44 {
		cells = 12
	}
	frac := 0.0
	if l.rest.total > 0 {
		frac = float64(l.rest.remaining) / float64(l.rest.total)
	}
	if frac < 0 {
		frac = 0
	}
	filled := int(frac * float64(cells))
	tone := theme.Green
	if frac < 0.5 {
		tone = theme.Amber
	}
	if frac < 0.2 {
		tone = theme.Red
	}
	gauge := lipgloss.NewStyle().Foreground(tone).Render(strings.Repeat("█", filled) + strings.Repeat("░", cells-filled))
	clock := lipgloss.NewStyle().Foreground(theme.Dim).Render(fmt.Sprintf(" rest %d:%02d  ", l.rest.remaining/60, l.rest.remaining%60))
	return "▕" + gauge + "▏" + clock + hint("r", "skip")
}

func summarizePRs(log *api.LogDetail, edited bool) string {
	verb := "저장됨"
	if edited {
		verb = "수정됨"
	}
	if log == nil || len(log.PersonalRecords) == 0 {
		return theme.GlyphDone + " " + verb
	}
	parts := make([]string, 0, len(log.PersonalRecords))
	for _, pr := range log.PersonalRecords {
		parts = append(parts, fmt.Sprintf("%s %s e1RM %.1f (+%.1f)",
			theme.GlyphPeak, pr.ExerciseName, float64(pr.EstOneRm), float64(pr.DeltaE1rm)))
	}
	return "[PR] " + strings.Join(parts, "   ")
}

// --- helpers ---

func orDot(s string) string {
	if strings.TrimSpace(s) == "" {
		return "·"
	}
	return s
}

func setE1rm(s setEntry) float64 {
	w, e1 := strconv.ParseFloat(strings.TrimSpace(s.weight), 64)
	reps, e2 := strconv.Atoi(strings.TrimSpace(s.reps))
	if e1 != nil || e2 != nil || reps <= 0 {
		return 0
	}
	return w * (1 + float64(reps)/30.0) // Epley estimate (display only)
}

func validNum(s string) bool {
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return err == nil && v >= 0
}

func validInt(s string) bool {
	v, err := strconv.Atoi(strings.TrimSpace(s))
	return err == nil && v > 0
}

func hint(k, label string) string {
	return lipgloss.NewStyle().Foreground(theme.Cyan).Bold(true).Render(k) + " " +
		lipgloss.NewStyle().Foreground(theme.Dim).Render(label)
}

func joinHints(parts ...string) string { return strings.Join(parts, "  ") }

func dim(s string) string { return lipgloss.NewStyle().Foreground(theme.Dim).Render(s) }

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	if n <= 1 {
		return string(r[:n])
	}
	return string(r[:n-1]) + "…"
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
