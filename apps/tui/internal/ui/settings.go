package ui

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

type settingKind int

const (
	skEnum settingKind = iota
	skNumber
)

type settingDef struct {
	label   string
	key     string
	kind    settingKind
	options []string // enum
	unit    string   // number suffix
}

var settingDefs = []settingDef{
	{label: "언어", key: "prefs.locale", kind: skEnum, options: []string{"ko", "en"}},
	{label: "목표", key: "prefs.trainingGoal.primary", kind: skEnum, options: []string{"general", "strength", "hypertrophy", "endurance", "powerlifting"}},
	{label: "체중", key: "prefs.bodyweight.kg", kind: skNumber, unit: "kg"},
	{label: "증가단위", key: "prefs.minimumPlate.defaultKg", kind: skNumber, unit: "kg"},
}

type settingsLoadedMsg struct {
	values map[string]json.RawMessage
	err    error
}

type settingSavedMsg struct{ err error }

func settingsLoadCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		v, err := c.Settings(context.Background())
		return settingsLoadedMsg{values: v, err: err}
	}
}

func setSettingCmd(c *api.Client, key string, value any) tea.Cmd {
	return func() tea.Msg {
		return settingSavedMsg{err: c.SetSetting(context.Background(), key, value)}
	}
}

// Settings is the settings buffer: a list of preference rows. j/k moves, enter
// toggles/cycles enums, i edits numbers inline.
type Settings struct {
	client  *api.Client
	values  map[string]json.RawMessage
	sel     int
	editing bool
	edit    textinput.Model
	loaded  bool
	err     string
	flash   string
	w, h    int
}

func NewSettings(c *api.Client) Settings { return Settings{client: c} }

func (s Settings) Init() tea.Cmd { return settingsLoadCmd(s.client) }

func (s Settings) Editing() bool { return s.editing }

func (s Settings) Update(msg tea.Msg) (Screen, tea.Cmd) {
	switch m := msg.(type) {
	case tea.WindowSizeMsg:
		s.w, s.h = m.Width, m.Height
		return s, nil
	case settingsLoadedMsg:
		s.loaded = true
		if m.err != nil {
			s.err = humanizeAuthErr(m.err)
			return s, nil
		}
		s.err, s.values = "", m.values
		return s, nil
	case settingSavedMsg:
		if m.err != nil {
			s.flash = "저장 실패"
			return s, settingsLoadCmd(s.client) // revert to server truth
		}
		return s, nil
	case tea.KeyPressMsg:
		if s.editing {
			return s.updateEditing(m)
		}
		return s.handleKey(m)
	}
	if s.editing {
		var cmd tea.Cmd
		s.edit, cmd = s.edit.Update(msg)
		return s, cmd
	}
	return s, nil
}

func (s Settings) handleKey(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	switch m.String() {
	case "j", "down":
		if s.sel < len(settingDefs)-1 {
			s.sel++
		}
	case "k", "up":
		if s.sel > 0 {
			s.sel--
		}
	case "enter", " ":
		def := settingDefs[s.sel]
		if def.kind == skEnum {
			return s.cycle(def)
		}
		return s.beginEdit(def)
	case "i":
		def := settingDefs[s.sel]
		if def.kind == skNumber {
			return s.beginEdit(def)
		}
	}
	return s, nil
}

func (s Settings) cycle(def settingDef) (Screen, tea.Cmd) {
	cur := s.rawString(def.key)
	next := def.options[0]
	for i, o := range def.options {
		if o == cur {
			next = def.options[(i+1)%len(def.options)]
			break
		}
	}
	s.setRaw(def.key, fmt.Sprintf("%q", next))
	return s, setSettingCmd(s.client, def.key, next)
}

func (s Settings) beginEdit(def settingDef) (Screen, tea.Cmd) {
	ti := textinput.New()
	ti.Prompt = ""
	ti.SetVirtualCursor(true)
	ti.SetWidth(8)
	ti.SetValue(s.numberString(def.key))
	s.edit = ti
	s.editing = true
	return s, s.edit.Focus()
}

func (s Settings) updateEditing(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	switch m.String() {
	case "esc":
		s.editing = false
		return s, nil
	case "enter":
		s.editing = false
		def := settingDefs[s.sel]
		v, err := strconv.ParseFloat(strings.TrimSpace(s.edit.Value()), 64)
		if err != nil || v < 0 {
			s.flash = "숫자를 입력하세요"
			return s, nil
		}
		s.setRaw(def.key, strconv.FormatFloat(v, 'f', -1, 64))
		return s, setSettingCmd(s.client, def.key, v)
	}
	var cmd tea.Cmd
	s.edit, cmd = s.edit.Update(m)
	return s, cmd
}

func (s Settings) Mode() Mode {
	if !s.loaded && s.err == "" {
		return Mode{Label: "LOADING", Tone: theme.Cyan}
	}
	if s.editing {
		return Mode{Label: "INSERT", Tone: theme.Amber}
	}
	return ModeNormal
}

func (s Settings) Context() string     { return settingDefs[s.sel].label }
func (s Settings) StatusRight() string { return "" }

func (s Settings) Hints(int) string {
	if s.editing {
		return joinHints(hint("⏎", "저장"), hint("esc", "취소"))
	}
	return joinHints(hint("jk", "이동"), hint("⏎", "변경"), hint("i", "숫자편집"))
}

func (s Settings) Body(w, h int) string {
	if s.err != "" {
		return centered(theme.GlyphFail+" "+s.err, theme.Red, w, h)
	}
	if !s.loaded {
		return centered("불러오는 중…", theme.Dim, w, h)
	}
	lines := make([]string, 0, len(settingDefs)+1)
	for i, def := range settingDefs {
		marker := "  "
		labelStyle := lipgloss.NewStyle().Foreground(theme.Dim)
		if i == s.sel {
			marker = lipgloss.NewStyle().Foreground(theme.Amber).Render("› ")
			labelStyle = lipgloss.NewStyle().Foreground(theme.Fg)
		}
		label := labelStyle.Width(12).Render(def.label)
		var val string
		if s.editing && i == s.sel && def.kind == skNumber {
			val = lipgloss.NewStyle().Foreground(theme.Amber).Render("["+s.edit.View()+"]") + def.unit
		} else {
			val = lipgloss.NewStyle().Foreground(theme.Cyan).Render(s.displayValue(def))
		}
		lines = append(lines, marker+label+val)
	}
	if s.flash != "" {
		lines = append(lines, "", lipgloss.NewStyle().Foreground(theme.Red).Render(s.flash))
	}
	return lipgloss.NewStyle().Width(w).Height(h).Padding(1, 1).Render(strings.Join(lines, "\n"))
}

func (s Settings) displayValue(def settingDef) string {
	switch def.kind {
	case skEnum:
		v := s.rawString(def.key)
		if def.key == "prefs.locale" {
			if v == "en" {
				return "English"
			}
			return "한국어"
		}
		if v == "" {
			return def.options[0]
		}
		return v
	default: // skNumber
		n := s.numberString(def.key)
		if n == "" || n == "0" {
			return lipgloss.NewStyle().Foreground(theme.Ghost).Render("—")
		}
		return n + def.unit
	}
}

// --- raw value helpers ---

func (s Settings) rawString(key string) string {
	r, ok := s.values[key]
	if !ok {
		return ""
	}
	var str string
	if json.Unmarshal(r, &str) == nil {
		return str
	}
	return strings.Trim(string(r), `"`)
}

func (s Settings) numberString(key string) string {
	r, ok := s.values[key]
	if !ok {
		return ""
	}
	var f float64
	if json.Unmarshal(r, &f) == nil {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	return ""
}

func (s *Settings) setRaw(key, rawJSON string) {
	if s.values == nil {
		s.values = map[string]json.RawMessage{}
	}
	s.values[key] = json.RawMessage(rawJSON)
	s.flash = ""
}
