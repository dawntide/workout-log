package ui

import (
	"strings"

	"charm.land/bubbles/v2/textinput"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// pickerItem is one selectable row: label is shown, value is acted on.
type pickerItem struct{ label, desc, value string }

// picker is a fuzzy filter + list rendered as a bottom panel (fzf/telescope
// style) — never a centered modal.
type picker struct {
	prompt string
	tag    string // "" = command palette; otherwise routed to the active view
	input  textinput.Model
	items  []pickerItem
	sel    int
}

func newPicker(prompt, tag string, items []pickerItem) picker {
	ti := textinput.New()
	ti.Prompt = ""
	ti.SetVirtualCursor(true)
	ti.SetWidth(18)
	ti.Focus()
	return picker{prompt: prompt, tag: tag, input: ti, items: items}
}

func (p picker) filtered() []pickerItem {
	q := strings.ToLower(strings.TrimSpace(p.input.Value()))
	if q == "" {
		return p.items
	}
	out := make([]pickerItem, 0, len(p.items))
	for _, it := range p.items {
		if strings.Contains(strings.ToLower(it.label), q) || strings.Contains(strings.ToLower(it.value), q) {
			out = append(out, it)
		}
	}
	return out
}

// pickerMaxRows caps how tall the item list grows on a roomy terminal so the
// picker stays a panel rather than swallowing the whole screen; on a short phone
// it shrinks to the available height (see render).
const pickerMaxRows = 12

// render returns the picker panel string and its line count. The item list is a
// cursor-following viewport: it grows to use height h (capped at pickerMaxRows),
// and when the catalog is longer than that it windows around the selection with
// ↑/↓ "N more" markers — so a long list (program store, exercise dictionary)
// stays navigable instead of the selected row scrolling off the bottom unseen.
func (p picker) render(w, h int) (string, int) {
	header := lipgloss.NewStyle().Foreground(theme.Cyan).Bold(true).Render(p.prompt) + p.input.View()

	shown := p.filtered()
	itemLines := make([]string, len(shown))
	for i, it := range shown {
		var line string
		if i == p.sel {
			line = lipgloss.NewStyle().Foreground(theme.Amber).Render("› ") +
				lipgloss.NewStyle().Foreground(theme.Fg).Bold(true).Render(it.label)
		} else {
			line = "  " + lipgloss.NewStyle().Foreground(theme.Dim).Render(it.label)
		}
		if it.desc != "" {
			line += lipgloss.NewStyle().Foreground(theme.Ghost).Render("  " + it.desc)
		}
		itemLines[i] = fitLine(line, w)
	}

	// Rows for items: use the height left after the header(1) + statusline(1) +
	// a 1-row body sliver, capped so the panel never dominates a tall terminal.
	rows := h - 3
	if rows > pickerMaxRows {
		rows = pickerMaxRows
	}
	if rows < 3 {
		rows = 3
	}

	var body []string
	if len(shown) == 0 {
		msg := "일치 없음"
		if len(p.items) == 0 { // free-text prompt (no source items) — e.g. accessory sets
			msg = "입력 후 ⏎"
		}
		body = []string{lipgloss.NewStyle().Foreground(theme.Ghost).Render("  " + msg)}
	} else {
		body = windowLines(itemLines, p.sel, rows)
	}
	lines := append([]string{header}, body...)
	return strings.Join(lines, "\n"), len(lines)
}
