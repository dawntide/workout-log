package ui

import (
	"context"
	"encoding/json"
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
	colRPE
)

type editTarget int

const (
	editNone editTarget = iota
	editName
	editCell
)

// loadState tracks the boot-time auto-load of today's planned session, so the
// empty buffer can show "loading" / "no active plan" instead of a blank canvas.
type loadState int

const (
	loadIdle    loadState = iota // not auto-loading (manual entry, or load done)
	loadPending                  // fetching today's session
	loadNoPlan                   // no active plan — prompt to start a program
)

type setEntry struct {
	weight  string
	reps    string
	rpe     string // optional RPE 1–10
	done    bool
	tgtReps int     // planned reps, shown dimmed as a placeholder while reps is empty
	total   float64 // bodyweight-inclusive total load (>0 only for bodyweight sets)
}

type exGroup struct {
	name        string
	prev        string // "100×5" previous performance (filled when a plan/session loads)
	tgt         string // target weight
	blockTarget string // snapshot sourceBlockTarget (e.g. "SQUAT"); enables REPLACE_EXERCISE override
	role        string // MAIN | ASSIST | … (from the snapshot)
	sets        []setEntry
}

// undoSnapshot is the pre-delete buffer state restored by `u`. Today logging is
// a fast flow, so a delete is one keystroke (`d`) with one-level undo rather
// than a y/n confirm that would interrupt every set removal.
type undoSnapshot struct {
	groups []exGroup
	gi, si int
}

// cloneGroups deep-copies groups (each set slice too) so an undo snapshot is
// independent of later in-place mutation.
func cloneGroups(gs []exGroup) []exGroup {
	out := make([]exGroup, len(gs))
	for i, g := range gs {
		g.sets = append([]setEntry(nil), g.sets...)
		out[i] = g
	}
	return out
}

type restState struct {
	active    bool
	remaining int
	total     int
}

type saveResultMsg struct {
	detail      *api.LogDetail
	err         error
	edited      bool
	performedAt time.Time // when the saved log is dated, for the edit banner
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
			ws := api.WorkoutSet{ExerciseName: name, WeightKg: w, Reps: reps}
			if isBodyweightExercise(name) && s.total > 0 {
				// weightKg is the external added weight; attach bodyweight meta so
				// the total load survives (server stores meta as-is).
				ws.Meta = &api.SetMeta{
					BodyweightKg: api.Float64(round2(s.total - w)),
					TotalLoadKg:  api.Float64(s.total),
				}
			}
			if rpe, err := strconv.Atoi(strings.TrimSpace(s.rpe)); err == nil && rpe > 0 {
				ws.RPE = &rpe
			}
			sets = append(sets, ws)
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
		return saveResultMsg{detail: detail, err: err, edited: editID != "", performedAt: at}
	}
}

type sessionLoadedMsg struct {
	snapshot   *api.SessionSnapshot
	prev       map[string]string // exerciseName(lower) → "weight×reps" last performance
	planName   string            // plan/program name for the today header
	sessionKey string            // generated-session key for the header label
	planID     string            // active plan id, for session overrides
	bodyweight float64           // user bodyweight for bodyweight-exercise load math
	noPlan     bool              // auto-load found no active plan
	err        error
}

// generatedSessionMsg generates a plan's session and pairs it with the prev-map
// from recent logs. Shared by the manual plan-activation path and the boot-time
// auto-load.
func generatedSessionMsg(c *api.Client, planID string) sessionLoadedMsg {
	s, err := c.GenerateSession(context.Background(), planID)
	if err != nil {
		return sessionLoadedMsg{err: err}
	}
	logs, _ := c.ListLogs(context.Background(), api.ListLogsParams{Limit: 50})
	return sessionLoadedMsg{
		snapshot:   &s.Snapshot,
		prev:       buildPrevMap(logs),
		planName:   s.Snapshot.Plan.Name,
		sessionKey: s.SessionKey,
		planID:     planID,
		bodyweight: fetchBodyweight(c),
	}
}

// fetchBodyweight reads the user's bodyweight (kg) from settings
// (prefs.bodyweight.kg). 0 when unset/unavailable — bodyweight load math then
// falls back to showing the raw prescribed total (no breakdown).
func fetchBodyweight(c *api.Client) float64 {
	vals, err := c.Settings(context.Background())
	if err != nil {
		return 0
	}
	raw, ok := vals["prefs.bodyweight.kg"]
	if !ok {
		return 0
	}
	var f float64
	if json.Unmarshal(raw, &f) == nil {
		return f
	}
	var str string
	if json.Unmarshal(raw, &str) == nil {
		if v, err := strconv.ParseFloat(strings.TrimSpace(str), 64); err == nil {
			return v
		}
	}
	return 0
}

func loadSessionCmd(c *api.Client, planID string) tea.Cmd {
	return func() tea.Msg { return generatedSessionMsg(c, planID) }
}

// overrideDoneMsg reports the result of a session override (보강/교체); on success
// the today buffer regenerates so the change appears.
type overrideDoneMsg struct {
	err    error
	planID string
	desc   string
}

func addAccessoryCmd(c *api.Client, planID, sessionKey, name string, sets []api.OverrideSet) tea.Cmd {
	return func() tea.Msg {
		err := c.AddAccessory(context.Background(), planID, sessionKey, name, sets)
		return overrideDoneMsg{err: err, planID: planID, desc: "보강 " + name}
	}
}

func replaceExerciseCmd(c *api.Client, planID, sessionKey, blockTarget, name string) tea.Cmd {
	return func() tea.Msg {
		err := c.ReplaceExercise(context.Background(), planID, sessionKey, blockTarget, name)
		return overrideDoneMsg{err: err, planID: planID, desc: "교체 → " + name}
	}
}

// parseAccessorySets parses a compact "NxR" / "NxR@W" spec into N sets of R reps
// at optional weight W. Blank or unparseable → a 3×10 default.
func parseAccessorySets(spec string) []api.OverrideSet {
	n, reps, weight := 3, 10, 0.0
	if s := strings.TrimSpace(spec); s != "" {
		body, w, hasW := strings.Cut(s, "@")
		if hasW {
			if v, err := strconv.ParseFloat(strings.TrimSpace(w), 64); err == nil && v >= 0 {
				weight = v
			}
		}
		ns, rs, ok := strings.Cut(strings.TrimSpace(body), "x")
		if !ok {
			ns, rs, ok = strings.Cut(strings.TrimSpace(body), "×")
		}
		if ok {
			if v, err := strconv.Atoi(strings.TrimSpace(ns)); err == nil && v > 0 {
				n = v
			}
			if v, err := strconv.Atoi(strings.TrimSpace(rs)); err == nil && v > 0 {
				reps = v
			}
		}
	}
	sets := make([]api.OverrideSet, n)
	for i := range sets {
		sets[i] = api.OverrideSet{Reps: reps, WeightKg: weight}
	}
	return sets
}

// autoloadCmd boots today's buffer: resolve the active plan and generate its
// session, mirroring the web bootstrap so today is never a blank canvas. With
// no active plan it returns noPlan so the buffer prompts for a program instead.
func autoloadCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		// Resolve plans up front so both branches can name the session: the
		// restore branch maps a log's planId → name, the generate branch picks
		// the active plan.
		plans, plansErr := c.Plans(context.Background())
		// An existing log dated today (local) → restore it for editing (web
		// parity), so a re-open shows what was already done. Filter client-side
		// on each log's local date instead of a server date= query, so the day
		// boundary follows the user's timezone rather than the server's UTC
		// interpretation (an evening log won't slip to "yesterday").
		if logs, err := c.ListLogs(context.Background(), api.ListLogsParams{Limit: 5}); err == nil {
			if lg, ok := todaysLog(logs, time.Now()); ok {
				return editLogMsg{
					id: lg.ID, performedAt: lg.PerformedAt, sets: lg.Sets,
					planName: planNameByID(plans, lg.PlanID), sessionKey: sessionKeyOf(lg),
					planID: strOr(lg.PlanID), bodyweight: fetchBodyweight(c),
				}
			}
		}
		if plansErr != nil {
			return sessionLoadedMsg{err: plansErr}
		}
		p, ok := api.ActivePlan(plans)
		if !ok {
			return sessionLoadedMsg{noPlan: true}
		}
		return generatedSessionMsg(c, p.ID)
	}
}

// planNameByID finds a plan's name by id (nil-safe); "" when not found.
func planNameByID(plans []api.Plan, id *string) string {
	if id == nil {
		return ""
	}
	for _, p := range plans {
		if p.ID == *id {
			return p.Name
		}
	}
	return ""
}

// sessionKeyOf returns a log's generated-session key, or "" when absent.
func sessionKeyOf(lg api.LogItem) string {
	if lg.GeneratedSession != nil {
		return lg.GeneratedSession.SessionKey
	}
	return ""
}

func strOr(s *string) string {
	if s != nil {
		return *s
	}
	return ""
}

// todaysLog returns the first log whose performedAt falls on now's local
// calendar day. Comparing local dates (rather than a server date= filter) keeps
// the day boundary in the user's timezone, so a UTC-stored evening log still
// counts as "today".
func todaysLog(logs []api.LogItem, now time.Time) (api.LogItem, bool) {
	today := now.Local().Format("2006-01-02")
	for _, lg := range logs {
		if lg.PerformedAt.Local().Format("2006-01-02") == today {
			return lg, true
		}
	}
	return api.LogItem{}, false
}

// buildPrevMap maps each exercise (lowercased) to its top set in the most
// recent session that contained it: "weight×reps".
func buildPrevMap(logs []api.LogItem) map[string]string {
	m := map[string]string{}
	for _, lg := range logs { // newest first
		top := map[string]api.LoggedSet{}
		topLoad := map[string]float64{}
		for _, st := range lg.Sets {
			n := strings.ToLower(strings.TrimSpace(st.ExerciseName))
			if n == "" {
				continue
			}
			load := loggedTotalLoad(st.ExerciseName, float64(st.WeightKg), st.Meta)
			if _, ok := top[n]; !ok || load > topLoad[n] {
				top[n], topLoad[n] = st, load
			}
		}
		for n := range top {
			if _, seen := m[n]; !seen {
				m[n] = fmt.Sprintf("%s×%d", trimNum(topLoad[n]), top[n].Reps)
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
	editID      string        // non-empty when editing a past log (saves via PATCH)
	performedAt time.Time     // preserved on edit; zero = now (new log)
	planName    string        // active plan/program name for today's session header
	sessionKey  string        // generated-session key (e.g. "C2W6D1") for the header label
	planID      string        // active plan id, for session overrides (보강/교체)
	pendAccsry  string        // accessory exercise awaiting its sets input (override flow)
	pendBlock   string        // block target awaiting its replacement exercise (override flow)
	bodyweight  float64       // user bodyweight (kg) for bodyweight-exercise load math
	load        loadState     // boot-time auto-load of today's session
	undo        *undoSnapshot // last delete, restorable with `u`
	status      string
	statusErr   bool
	w, h        int
}

// NewLog starts in loadPending so the very first render shows "loading today's
// session" rather than the empty-canvas hint while autoloadCmd runs.
func NewLog(client *api.Client) Log { return Log{client: client, load: loadPending} }

func (l Log) Editing() bool { return l.editing }
func (l Log) Init() tea.Cmd { return autoloadCmd(l.client) }

func (l Log) Mode() Mode {
	switch {
	case l.rest.active:
		return Mode{Label: fmt.Sprintf("REST %ds", l.rest.remaining), Tone: theme.Cyan}
	case l.saving:
		return Mode{Label: "SAVING", Tone: theme.Amber}
	case l.editing:
		return Mode{Label: "INSERT", Tone: theme.Amber}
	case l.load == loadPending:
		return Mode{Label: "LOADING", Tone: theme.Cyan}
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

func (l Log) Hints() []hintItem {
	if l.editing {
		return []hintItem{{"⏎", "다음"}, {"tab", "셀"}, {"esc", "취소"}}
	}
	h := []hintItem{{"i", "편집"}, {"e", "운동"}, {"s", "저장"}}
	if l.planID != "" && l.sessionKey != "" {
		h = append(h, hintItem{"a", "보강"}, hintItem{"c", "교체"})
	}
	return h
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
		// Keep the saved session on screen (done sets only) and switch to PATCH,
		// so it reads as "today's record" instead of a blank canvas; re-saving
		// edits the same log.
		l.status, l.statusErr = summarizeSaved(l.groups, m.detail, m.edited), false
		l.keepDoneOnly()
		if m.detail != nil {
			l.editID = m.detail.ID
		}
		l.performedAt = m.performedAt
		l.load, l.undo = loadIdle, nil
		return l, nil
	case editLogMsg:
		l.loadForEdit(m)
		return l, nil
	case pickedMsg:
		switch m.tag {
		case "exercise":
			if strings.TrimSpace(m.value) != "" {
				l.groups = append(l.groups, exGroup{name: m.value, sets: []setEntry{{}}})
				l.gi, l.si, l.col = len(l.groups)-1, 0, colWeight
				return l.beginEdit(editCell)
			}
		case "accessory":
			if name := strings.TrimSpace(m.value); name != "" {
				l.pendAccsry = name
				l.status, l.statusErr = "보강: "+name, false
				// second step: free-text sets prompt (an item-less picker returns
				// whatever the user types).
				return l, func() tea.Msg {
					return openPickerMsg{prompt: "세트 (예 3x10@20) ", tag: "accessory-sets"}
				}
			}
		case "accessory-sets":
			name := l.pendAccsry
			l.pendAccsry = ""
			if name == "" {
				return l, nil
			}
			l.status, l.statusErr = "보강 추가 중…", false
			return l, addAccessoryCmd(l.client, l.planID, l.sessionKey, name, parseAccessorySets(m.value))
		case "replace":
			name, bt := strings.TrimSpace(m.value), l.pendBlock
			l.pendBlock = ""
			if name == "" || bt == "" {
				return l, nil
			}
			l.status, l.statusErr = "교체 중…", false
			return l, replaceExerciseCmd(l.client, l.planID, l.sessionKey, bt, name)
		}
		return l, nil
	case overrideDoneMsg:
		if m.err != nil {
			l.status, l.statusErr = "변경 실패: "+humanizeAuthErr(m.err), true
			return l, nil
		}
		l.status, l.statusErr = theme.GlyphDone+" "+m.desc+" — 세션 재생성", false
		l.load = loadPending
		return l, loadSessionCmd(l.client, m.planID)
	case planActivatedMsg:
		l.load = loadPending
		return l, loadSessionCmd(l.client, m.id)
	case sessionLoadedMsg:
		l.load = loadIdle
		if m.err != nil {
			l.status, l.statusErr = "세션 로드 실패: "+humanizeAuthErr(m.err), true
			return l, nil
		}
		if m.noPlan {
			l.load = loadNoPlan
			return l, nil
		}
		l.planName, l.sessionKey, l.planID = m.planName, m.sessionKey, m.planID
		l.bodyweight = m.bodyweight
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
		if l.col > colWeight {
			l.col--
		}
	case "l", "right":
		if l.col < colRPE {
			l.col++
		}
	case "r":
		l.rest.active = false
	case "i", "enter":
		if len(l.groups) == 0 {
			return l, openExercisePickerCmd(l.client)
		}
		return l.beginEdit(editCell)
	case "e", "n":
		return l, openExercisePickerCmd(l.client)
	case "a":
		return l.beginAccessory()
	case "c":
		return l.beginReplace()
	case "x":
		return l.toggleDone()
	case "o":
		return l.addSet()
	case "d":
		return l.deleteSet()
	case "u":
		return l.undoDelete()
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
			switch l.col {
			case colWeight:
				l.col = colReps
				return l.beginEdit(editCell)
			case colReps:
				return l.completeSet()
			}
			return l, nil // colRPE is optional; close the editor
		}
		return l, nil
	case "tab":
		l.writeEdit()
		l.editing = false
		if l.target == editName {
			l.col = colWeight
		} else {
			l.col = (l.col + 1) % 3 // weight → reps → rpe → weight
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
func openExercisePickerCmd(c *api.Client) tea.Cmd { return exercisePickerCmd(c, "운동 ", "exercise") }

// exercisePickerCmd opens an exercise picker with a custom prompt and routing
// tag (exercise add, accessory override, replace override).
func exercisePickerCmd(c *api.Client, prompt, tag string) tea.Cmd {
	return func() tea.Msg {
		exs, _ := c.Exercises(context.Background(), "")
		items := make([]pickerItem, len(exs))
		for i, e := range exs {
			items[i] = pickerItem{label: e.Name, value: e.Name}
		}
		return openPickerMsg{prompt: prompt, tag: tag, items: items}
	}
}

// beginAccessory starts the 보강 (ADD_ACCESSORY) override flow: pick an exercise,
// then enter its sets. Only valid on a generated plan session.
func (l Log) beginAccessory() (Log, tea.Cmd) {
	if l.planID == "" || l.sessionKey == "" {
		l.status, l.statusErr = "보강은 플랜 세션에서만 가능합니다", true
		return l, nil
	}
	return l, exercisePickerCmd(l.client, "보강 운동 ", "accessory")
}

// beginReplace starts the 교체 (REPLACE_EXERCISE) override flow for the selected
// MAIN exercise's block target.
func (l Log) beginReplace() (Log, tea.Cmd) {
	if l.planID == "" || l.sessionKey == "" {
		l.status, l.statusErr = "교체는 플랜 세션에서만 가능합니다", true
		return l, nil
	}
	if l.gi >= len(l.groups) {
		return l, nil
	}
	g := l.groups[l.gi]
	if g.role != "MAIN" || g.blockTarget == "" {
		l.status, l.statusErr = "메인 운동에서만 교체할 수 있습니다", true
		return l, nil
	}
	l.pendBlock = g.blockTarget
	return l, exercisePickerCmd(l.client, "교체할 운동 ", "replace")
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
	l.undo = &undoSnapshot{groups: cloneGroups(l.groups), gi: l.gi, si: l.si}
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

// undoDelete restores the buffer to the state captured by the last deleteSet.
func (l Log) undoDelete() (Log, tea.Cmd) {
	if l.undo == nil {
		return l, nil
	}
	l.groups, l.gi, l.si, l.col = l.undo.groups, l.undo.gi, l.undo.si, colWeight
	l.undo = nil
	l.status, l.statusErr = theme.GlyphDone+" 삭제 되돌림", false
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
	// 세트 추가는 addSet("o")로만 — reps 엔터는 현재 세트 완료까지만 하고
	// 빈 세트를 자동으로 덧붙이지 않는다.
	return l, nil
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
		setTotal := 0.0
		if isBodyweightExercise(n) && st.Meta != nil && float64(st.Meta.TotalLoadKg) > 0 {
			setTotal = round2(float64(st.Meta.TotalLoadKg)) // weightKg is the external added weight
		}
		g.sets = append(g.sets, setEntry{
			weight: trimNum(float64(st.WeightKg)),
			reps:   strconv.Itoa(st.Reps),
			rpe:    rpeString(st.RPE),
			done:   true,
			total:  setTotal,
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
	l.planName, l.sessionKey, l.planID = m.planName, m.sessionKey, m.planID
	if m.bodyweight > 0 {
		l.bodyweight = m.bodyweight
	}
	l.rest.active = false
	l.load, l.undo = loadIdle, nil
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
		switch l.col {
		case colWeight:
			ti.SetWidth(6)
			ti.SetValue(s.weight)
		case colReps:
			ti.SetWidth(4)
			ti.SetValue(s.reps)
		case colRPE:
			ti.SetWidth(3)
			ti.SetValue(s.rpe)
		}
	}
	l.edit, l.editing, l.target = ti, true, t
	return l, l.edit.Focus()
}

// recomputeTotal refreshes a set's bodyweight-inclusive total after its external
// weight changes: total = bodyweight + external for bodyweight lifts, else 0.
func (l *Log) recomputeTotal(gi, si int) {
	g := &l.groups[gi]
	if !isBodyweightExercise(g.name) || l.bodyweight <= 0 {
		g.sets[si].total = 0
		return
	}
	ext, _ := strconv.ParseFloat(strings.TrimSpace(g.sets[si].weight), 64)
	if ext < 0 {
		ext = 0
	}
	g.sets[si].total = round2(l.bodyweight + ext)
}

func (l *Log) writeEdit() {
	v := strings.TrimSpace(l.edit.Value())
	switch l.target {
	case editName:
		l.groups[l.gi].name = v
	case editCell:
		switch l.col {
		case colWeight:
			l.groups[l.gi].sets[l.si].weight = v
			l.recomputeTotal(l.gi, l.si)
		case colReps:
			l.groups[l.gi].sets[l.si].reps = v
		case colRPE:
			l.groups[l.gi].sets[l.si].rpe = v
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
		g := exGroup{name: ex.ExerciseName, prev: prev[strings.ToLower(strings.TrimSpace(ex.ExerciseName))], blockTarget: ex.SourceBlockTarget, role: ex.Role}
		maxTgt, tgtReps := 0.0, 0
		bw := isBodyweightExercise(ex.ExerciseName)
		for _, st := range ex.Sets {
			// targetWeightKg is bodyweight-INCLUSIVE total for bodyweight lifts;
			// store the external added weight (total-bw) as the editable value and
			// keep the total for display.
			total := float64(st.TargetWeightKg)
			w, setTotal := total, 0.0
			if bw && l.bodyweight > 0 {
				w, setTotal = bwExternalFromTotal(total, l.bodyweight), total
			}
			g.sets = append(g.sets, setEntry{weight: trimNum(w), reps: "", tgtReps: st.Reps, total: setTotal})
			if total >= maxTgt {
				maxTgt, tgtReps = total, st.Reps
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
	l.undo = nil
	l.status, l.statusErr = theme.GlyphDone+" 플랜 세션 로드됨", false
}

// --- rendering ---

func (l Log) Body(w, h int) string {
	pad := bodyPad(h)
	compact := compactView(h)
	inner := h - 2*pad
	if inner < 1 {
		inner = 1
	}

	// Pinned chrome: the session header (plan name + cycle label) and edit banner
	// stick to the top; the rest gauge and status line stick to the bottom so a
	// live countdown / save confirmation stays visible no matter how many
	// exercises scroll between them.
	var head, foot []string
	if sh := l.sessionHeader(); sh != "" {
		head = append(head, sh)
	}
	if l.editID != "" {
		head = append(head, lipgloss.NewStyle().Foreground(theme.Amber).Render("■ 편집 중 · "+l.performedAt.Format("2006-01-02")))
	}
	if len(head) > 0 && !compact {
		head = append(head, "")
	}
	if l.rest.active {
		foot = append(foot, l.restBar(w))
	}
	if l.status != "" {
		tone := theme.Green
		if l.statusErr {
			tone = theme.Red
		}
		foot = append(foot, lipgloss.NewStyle().Foreground(tone).Render(l.status))
	}

	all := append([]string{}, head...)
	if len(l.groups) == 0 {
		all = append(all, l.renderEmpty())
	} else {
		// Flatten groups to lines and window them around the active set so the
		// cursor stays on screen and, crucially, the frame's hint bar + mode
		// line below the body are never pushed off the bottom (the old Body
		// rendered every group and overflowed, clipping the footer entirely).
		lines, active := l.groupLines(w, compact)
		avail := inner - len(head) - len(foot)
		if avail < 1 {
			avail = 1
		}
		all = append(all, windowLines(lines, active, avail)...)
	}
	all = append(all, foot...)
	return lipgloss.NewStyle().Width(w).Height(h).Padding(pad, 1).Render(strings.Join(all, "\n"))
}

// groupLines flattens every exercise group into a single line slice (a header
// row followed by its set rows, with a blank line between groups unless compact)
// and reports the line index of the active set so windowLines can center it.
func (l Log) groupLines(w int, compact bool) (lines []string, active int) {
	for gi, g := range l.groups {
		if gi > 0 && !compact {
			lines = append(lines, "")
		}
		lines = append(lines, l.groupHeader(gi, g, w))
		for si, s := range g.sets {
			if gi == l.gi && si == l.si {
				active = len(lines)
			}
			lines = append(lines, l.renderSet(gi, si, s))
		}
	}
	return lines, active
}

// sessionHeader renders today's header — the active plan/program name and the
// cycle session label (e.g. "5/3/1 Leader · C2W6D1") — so it's clear which plan
// and which session today is. Empty when neither is known.
func (l Log) sessionHeader() string {
	var parts []string
	if name := strings.TrimSpace(l.planName); name != "" {
		parts = append(parts, lipgloss.NewStyle().Foreground(theme.Fg).Bold(true).Render(name))
	}
	if lab := sessionLabel(l.sessionKey); lab != "" {
		parts = append(parts, lipgloss.NewStyle().Foreground(theme.Cyan).Bold(true).Render(lab))
	}
	return strings.Join(parts, lipgloss.NewStyle().Foreground(theme.Dim).Render(" · "))
}

// renderEmpty draws the empty-buffer state: a loading line while today's
// session auto-loads, a program prompt when no active plan exists, or the
// manual-entry hint otherwise.
func (l Log) renderEmpty() string {
	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	ghost := lipgloss.NewStyle().Foreground(theme.Ghost)
	switch l.load {
	case loadPending:
		return dim.Render("오늘 세션 불러오는 중…")
	case loadNoPlan:
		return ghost.Render("활성 플랜이 없습니다.\n\n") +
			hint("p", "프로그램") + dim.Render(" 에서 플랜 시작\n") +
			hint("e", "운동 추가") + dim.Render(" 로 자유 기록")
	default:
		return ghost.Render("오늘 기록이 비어 있습니다.\n\n") +
			hint("e", "운동 추가") + dim.Render(" 로 시작")
	}
}

// groupHeader renders one exercise's header row: the name (or an inline rename
// input when editing the name), right-justified with its prev/tgt context.
func (l Log) groupHeader(gi int, g exGroup, w int) string {
	if gi == l.gi && l.editing && l.target == editName {
		return l.edit.View()
	}
	name := g.name
	if strings.TrimSpace(name) == "" {
		name = "운동?"
	}
	header := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render(strings.ToUpper(name))
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
	return header
}

func (l Log) renderSet(gi, si int, s setEntry) string {
	active := gi == l.gi && si == l.si
	marker := "   "
	if active {
		marker = lipgloss.NewStyle().Foreground(theme.Amber).Render(" › ")
	}
	// Bodyweight lifts: the cell shows the bodyweight-inclusive total, with the
	// external added weight broken out as a "(+20)" / "(체중)" suffix at the row
	// end (mirrors the web). While editing the weight, the cell shows the raw
	// external input instead and the suffix is hidden.
	wText, suffix := orDot(s.weight), ""
	if isBodyweightExercise(l.groups[gi].name) && s.total > 0 {
		wText = trimNum(s.total)
		if !(active && l.editing && l.col == colWeight) {
			added, _ := strconv.ParseFloat(strings.TrimSpace(s.weight), 64)
			suffix = " " + lipgloss.NewStyle().Foreground(theme.Dim).Render(addedSuffix(added))
		}
	}
	wcell := l.setCell(active, colWeight, wText, 6)
	rcell := l.repsCell(active, s)
	sep := lipgloss.NewStyle().Foreground(theme.Dim).Render(" × ")

	// RPE: an editable cell when the RPE column is active here, otherwise shown
	// only when a value exists (optional metric, never forced).
	rpe := "    " // reserved 4-col slot so done/e1rm stay aligned across sets
	if active && l.col == colRPE {
		rpe = lipgloss.NewStyle().Foreground(theme.Dim).Render(" @") + l.setCell(active, colRPE, orDot(s.rpe), 2)
	} else if s.rpe != "" {
		rpe = lipgloss.NewStyle().Foreground(theme.Dim).Render(fmt.Sprintf(" @%-2s", s.rpe))
	}

	done := lipgloss.NewStyle().Foreground(theme.Ghost).Render("·")
	if s.done {
		done = lipgloss.NewStyle().Foreground(theme.Green).Render(theme.GlyphDone)
	}
	e1rm := ""
	if v := setE1rm(s); v > 0 {
		e1rm = lipgloss.NewStyle().Foreground(theme.Dim).Render(fmt.Sprintf(" e%.0f", v))
	}
	return marker + wcell + sep + rcell + rpe + "   " + done + e1rm + suffix
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

// repsCell renders the reps column, showing the planned reps as a dim
// placeholder when empty and unfocused (plan session). Mirrors the web's
// placeholder={plannedReps} so each set's target is visible inline, while the
// actual value stays empty until the user types it.
func (l Log) repsCell(active bool, s setEntry) string {
	if !active && strings.TrimSpace(s.reps) == "" && s.tgtReps > 0 {
		return lipgloss.NewStyle().Foreground(theme.Ghost).Width(3).Render(strconv.Itoa(s.tgtReps))
	}
	return l.setCell(active, colReps, orDot(s.reps), 3)
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

// summarizeSaved builds the post-save status line: a count + tonnage headline
// plus any server-detected PRs. Keeps the "저장됨/수정됨" verb the rest of the
// UI expects.
func summarizeSaved(groups []exGroup, detail *api.LogDetail, edited bool) string {
	n := 0
	vol := 0.0
	for _, g := range groups {
		for _, s := range g.sets {
			if !s.done {
				continue
			}
			n++
			r, _ := strconv.Atoi(s.reps)
			vol += setLoad(s) * float64(r)
		}
	}
	verb := "저장됨"
	if edited {
		verb = "수정됨"
	}
	head := fmt.Sprintf("%s %s · %d세트 · %skg", theme.GlyphDone, verb, n, trimNum(vol))
	if detail != nil && len(detail.PersonalRecords) > 0 {
		parts := make([]string, 0, len(detail.PersonalRecords))
		for _, pr := range detail.PersonalRecords {
			parts = append(parts, fmt.Sprintf("%s %s e1RM %.1f", theme.GlyphPeak, pr.ExerciseName, float64(pr.EstOneRm)))
		}
		head += "   [PR] " + strings.Join(parts, "  ")
	}
	return head
}

// keepDoneOnly drops not-done sets (and now-empty groups) so the saved session
// stays on screen as just the completed work.
func (l *Log) keepDoneOnly() {
	var groups []exGroup
	for _, g := range l.groups {
		var sets []setEntry
		for _, s := range g.sets {
			if s.done {
				sets = append(sets, s)
			}
		}
		if len(sets) > 0 {
			g.sets = sets
			groups = append(groups, g)
		}
	}
	l.groups, l.gi, l.si, l.col = groups, 0, 0, colWeight
}

// --- helpers ---

func orDot(s string) string {
	if strings.TrimSpace(s) == "" {
		return "·"
	}
	return s
}

func rpeString(rpe *int) string {
	if rpe == nil || *rpe <= 0 {
		return ""
	}
	return strconv.Itoa(*rpe)
}

func setE1rm(s setEntry) float64 {
	reps, err := strconv.Atoi(strings.TrimSpace(s.reps))
	if err != nil || reps <= 0 {
		return 0
	}
	w := setLoad(s) // bodyweight-inclusive total for bodyweight lifts
	if w <= 0 {
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
