// Package theme codifies the ironlog terminal design language (term-* tokens,
// glyph vocabulary) as Go/lipgloss constants so the TUI matches the existing
// web "terminal" skin. See web/docs/redesign-target.md §5.
package theme

import "charm.land/lipgloss/v2"

// Palette — the ironlog/Modern-ANSI dark-only term-* tokens mapped to lipgloss
// colors. Hex values are the single source of truth (mirror of the web CSS
// custom properties --term-*).
var (
	Bg    = lipgloss.Color("#0b0e0b") // term-bg     base background
	Panel = lipgloss.Color("#11150f") // term-panel  raised surface
	Inset = lipgloss.Color("#171c15") // term-inset  input / sunken surface
	Sel   = lipgloss.Color("#1e241b") // term-sel    selected row background
	Fg    = lipgloss.Color("#c9d8c4") // term-fg     primary text (11.83:1 AAA)
	Dim   = lipgloss.Color("#82997b") // term-dim    secondary text (5.70:1 AA)
	Ghost = lipgloss.Color("#3a5237") // term-ghost  future / disabled

	Green = lipgloss.Color("#6ee787") // term-green  success / logged
	Amber = lipgloss.Color("#e3b341") // term-amber  active / accent / today
	Cyan  = lipgloss.Color("#7fd1c4") // term-cyan   data / weight
	Red   = lipgloss.Color("#ff7b72") // term-red    danger / fail
	Gold  = lipgloss.Color("#ffcf5c") // term-gold   PR / peak (sparse)
	Blue  = lipgloss.Color("#79c0ff") // term-blue   info
)

// Glyphs — Unicode / Nerd-Font vocabulary used for TUI data views. Allowed in
// the terminal theme only (Material Symbols replace these in the paper theme).
const (
	GlyphDone   = "✓" // completed set
	GlyphActive = "▶" // current focus
	GlyphFail   = "✗" // failed
	GlyphPeak   = "★" // PR / peak marker
	GlyphRest   = "·" // rest / empty day
	GlyphWarmup = "W" // warmup set
	GlyphCross  = "×" // reps separator (e.g. 100×5)
)

// Block eighths and shades for sparklines / progress meters.
var (
	Blocks = []rune("▁▂▃▄▅▆▇█")
	Shades = []rune("░▒▓")
)
