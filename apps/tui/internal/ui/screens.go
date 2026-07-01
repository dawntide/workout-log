package ui

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// Screen is an in-shell tab view (home/log/stats/cal/settings). The shell owns
// the chrome; a screen renders only its pane body and reports its mode + hints.
// Update returns a Screen so the shell can store it back generically.
type Screen interface {
	Init() tea.Cmd
	Update(tea.Msg) (Screen, tea.Cmd)
	Body(w, h int) string
	Mode() Mode
	Context() string // statusline middle segment
	StatusRight() string
	Hints() []hintItem // local key hints for the bottom bar; frame adds globals
	Editing() bool
}

// placeholder is a tab that has not been built yet.
type placeholder struct{ name string }

func (p placeholder) Init() tea.Cmd                    { return nil }
func (p placeholder) Update(tea.Msg) (Screen, tea.Cmd) { return p, nil }
func (p placeholder) Mode() Mode                       { return ModeNormal }
func (p placeholder) Context() string                  { return "" }
func (p placeholder) StatusRight() string              { return "" }
func (p placeholder) Editing() bool                    { return false }
func (p placeholder) Hints() []hintItem                { return []hintItem{{"1-5", "탭"}, {"q", "종료"}} }

func (p placeholder) Body(w, h int) string {
	heading := lipgloss.NewStyle().Foreground(theme.Fg).Bold(true).Render("  " + strings.ToUpper(p.name))
	sub := lipgloss.NewStyle().Foreground(theme.Ghost).Render("  준비 중…")
	return lipgloss.NewStyle().Width(w).Height(h).Render("\n" + heading + "\n\n" + sub)
}
