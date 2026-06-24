package ui

import (
	"image/color"
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/NimbleMarkets/ntcharts/v2/canvas"
	"github.com/NimbleMarkets/ntcharts/v2/linechart"

	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// centered places styled text in the middle of a w×h block (loading/empty/error).
func centered(text string, tone color.Color, w, h int) string {
	return lipgloss.Place(w, h, lipgloss.Center, lipgloss.Center,
		lipgloss.NewStyle().Foreground(tone).Render(text))
}

func minMax(vals []float64) (float64, float64) {
	mn, mx := vals[0], vals[0]
	for _, v := range vals {
		if v < mn {
			mn = v
		}
		if v > mx {
			mx = v
		}
	}
	return mn, mx
}

// lineChart renders a trend. braille uses ntcharts (smooth, needs a Nerd Font);
// otherwise a robust block column chart.
func lineChart(vals []float64, w, h int, braille bool) string {
	if len(vals) == 0 || w < 4 || h < 2 {
		return ""
	}
	if braille && len(vals) >= 2 {
		return brailleChart(vals, w, h)
	}
	return blockChart(vals, w, h)
}

func brailleChart(vals []float64, w, h int) string {
	mn, mx := minMax(vals)
	pad := (mx - mn) * 0.1
	if pad <= 0 {
		pad = mx*0.05 + 1
	}
	lc := linechart.New(w, h, 0, float64(len(vals)-1), mn-pad, mx+pad)
	lc.DrawXYAxisAndLabel()
	style := lipgloss.NewStyle().Foreground(theme.Green)
	for i := 0; i+1 < len(vals); i++ {
		lc.DrawBrailleLineWithStyle(
			canvas.Float64Point{X: float64(i), Y: vals[i]},
			canvas.Float64Point{X: float64(i + 1), Y: vals[i+1]},
			style,
		)
	}
	return lc.View()
}

func blockChart(vals []float64, w, h int) string {
	cols := sampleTo(vals, w)
	mn, mx := minMax(cols)
	rng := mx - mn
	if rng <= 0 {
		rng = 1
	}
	style := lipgloss.NewStyle().Foreground(theme.Green)
	rows := make([]string, h)
	for r := 0; r < h; r++ {
		rowFromBottom := h - 1 - r
		var sb strings.Builder
		for _, v := range cols {
			level := (v - mn) / rng * float64(h)
			sb.WriteRune(blockCell(level, rowFromBottom))
		}
		rows[r] = style.Render(sb.String())
	}
	return strings.Join(rows, "\n")
}

var blockEighths = []rune("▁▂▃▄▅▆▇")

func blockCell(level float64, rowFromBottom int) rune {
	lo := float64(rowFromBottom)
	if level >= lo+1 {
		return '█'
	}
	if level <= lo {
		return ' '
	}
	idx := int((level - lo) * float64(len(blockEighths)))
	if idx < 0 {
		idx = 0
	}
	if idx >= len(blockEighths) {
		idx = len(blockEighths) - 1
	}
	return blockEighths[idx]
}

// sampleTo downsamples vals to at most n evenly spaced points.
func sampleTo(vals []float64, n int) []float64 {
	if n <= 0 || len(vals) <= n {
		return vals
	}
	out := make([]float64, n)
	for i := 0; i < n; i++ {
		out[i] = vals[i*(len(vals)-1)/(n-1)]
	}
	return out
}
