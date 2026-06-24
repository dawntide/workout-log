// Package ui implements the ironlog terminal shell and views.
package ui

import (
	"image/color"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// Tab identifies a top-level view.
type Tab int

const (
	TabHome Tab = iota
	TabLog
	TabStats
	TabCal
	TabSettings
)

var tabMeta = []struct {
	key  string
	name string
}{
	{"1", "home"},
	{"2", "log"},
	{"3", "stats"},
	{"4", "cal"},
	{"5", "set"},
}

// Mode is the status-bar mode label and its tone color (idle/logging/rest/...).
type Mode struct {
	Label string
	Tone  color.Color
}

// ModeNormal is the idle auto-label (NORMAL is a state label, not a vim mode).
var ModeNormal = Mode{Label: "NORMAL", Tone: theme.Dim}

// Shell is the persistent top-level chrome that hosts swappable view panes.
type Shell struct {
	width  int
	height int
	now    time.Time
	active Tab
	mode   Mode
	status string // statusRight text
}

// NewShell returns the shell with the log tab focused by default.
func NewShell() Shell {
	return Shell{active: TabLog, mode: ModeNormal, now: time.Now()}
}

type tickMsg time.Time

func tick() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

// Init starts the 1s clock tick.
func (m Shell) Init() tea.Cmd { return tick() }

// Update handles resize, the clock tick, and tab/quit keys.
func (m Shell) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
	case tickMsg:
		m.now = time.Time(msg)
		return m, tick()
	case tea.KeyPressMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "1":
			m.active = TabHome
		case "2":
			m.active = TabLog
		case "3":
			m.active = TabStats
		case "4":
			m.active = TabCal
		case "5":
			m.active = TabSettings
		}
	}
	return m, nil
}

// View renders the full shell: title · tabs · pane · status · hints.
func (m Shell) View() tea.View {
	w := m.width
	if w <= 0 {
		w = 36
	}
	h := m.height
	if h <= 0 {
		h = 24
	}

	const chromeRows = 4 // title + tabs + status + hints
	bodyH := h - chromeRows
	if bodyH < 1 {
		bodyH = 1
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		m.titleBar(w),
		m.tabStrip(),
		m.viewPane(w, bodyH),
		m.statusBar(w),
		m.keyHint(),
	)

	v := tea.NewView(content)
	v.BackgroundColor = theme.Bg
	v.AltScreen = true
	return v
}

func (m Shell) titleBar(w int) string {
	dot := func(c color.Color) string { return lipgloss.NewStyle().Foreground(c).Render("●") }
	dots := dot(theme.Red) + " " + dot(theme.Amber) + " " + dot(theme.Green)
	name := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render("ironlog")
	path := lipgloss.NewStyle().Foreground(theme.Dim).Render(" · " + tabMeta[m.active].name)
	clock := lipgloss.NewStyle().Foreground(theme.Dim).Render(m.now.Format("15:04:05"))
	return justify(dots+"  "+name+path, clock, w)
}

func (m Shell) tabStrip() string {
	parts := make([]string, len(tabMeta))
	for i, t := range tabMeta {
		key := lipgloss.NewStyle().Foreground(theme.Cyan).Render(t.key)
		nameStyle := lipgloss.NewStyle().Foreground(theme.Dim)
		marker := " "
		if Tab(i) == m.active {
			nameStyle = lipgloss.NewStyle().Foreground(theme.Amber).Bold(true)
			marker = lipgloss.NewStyle().Foreground(theme.Amber).Render("*")
		}
		parts[i] = key + ":" + nameStyle.Render(t.name) + marker
	}
	return strings.Join(parts, " ")
}

func (m Shell) viewPane(w, h int) string {
	heading := lipgloss.NewStyle().Foreground(theme.Fg).Bold(true).
		Render("  " + strings.ToUpper(tabMeta[m.active].name))
	sub := lipgloss.NewStyle().Foreground(theme.Ghost).
		Render("  (placeholder — A2 shell skeleton)")
	body := "\n" + heading + "\n\n" + sub
	return lipgloss.NewStyle().Width(w).Height(h).Render(body)
}

func (m Shell) statusBar(w int) string {
	pill := lipgloss.NewStyle().Foreground(m.mode.Tone).Bold(true).
		Render("-- " + m.mode.Label + " --")
	right := lipgloss.NewStyle().Foreground(theme.Dim).Render(m.status)
	return justify(pill, right, w)
}

func (m Shell) keyHint() string {
	hint := func(k, label string) string {
		return lipgloss.NewStyle().Foreground(theme.Cyan).Render("["+k+"]") +
			lipgloss.NewStyle().Foreground(theme.Dim).Render(" "+label)
	}
	return strings.Join([]string{
		hint("1-5", "tab"),
		hint("?", "help"),
		hint("q", "quit"),
	}, "  ")
}

// justify places left and right text on one line padded to width w.
func justify(left, right string, w int) string {
	gap := w - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 1 {
		gap = 1
	}
	return left + strings.Repeat(" ", gap) + right
}
