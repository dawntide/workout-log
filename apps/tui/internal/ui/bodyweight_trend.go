package ui

import (
	"fmt"
	"strings"
	"time"

	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// 체중 추이 렌더.
//
// stats 버퍼의 차트 엔진(`lineChart`)을 그대로 쓴다 — 체중은 선 그래프가 맞고,
// 볼륨·e1RM과 같은 화면 문법이면 보는 법을 새로 배울 것이 없다.

// bodyweightAscending returns the series oldest-first for charting.
//
// API는 최신순으로 준다. 차트는 시간순이어야 하므로 뒤집는다 — 안 뒤집으면 추세가
// 좌우로 뒤집혀 "빠지는 중"이 "찌는 중"으로 보인다.
func bodyweightAscending(items []api.BodyweightEntry) []api.BodyweightEntry {
	out := make([]api.BodyweightEntry, len(items))
	for i, e := range items {
		out[len(items)-1-i] = e
	}
	return out
}

func bodyweightValues(items []api.BodyweightEntry) []float64 {
	vals := make([]float64, len(items))
	for i, e := range items {
		vals[i] = e.ValueKg
	}
	return vals
}

// bodyweightSummary renders "72.5kg  −0.8 (30일)" style headline.
//
// 변화량이 요점이다 — 오늘 값만 보여주면 설정 화면과 다를 것이 없다.
func bodyweightSummary(items []api.BodyweightEntry) string {
	if len(items) == 0 {
		return ""
	}
	asc := bodyweightAscending(items)
	latest := asc[len(asc)-1]
	head := lipgloss.NewStyle().Foreground(theme.Green).Bold(true).
		Render(fmt.Sprintf("%.1fkg", latest.ValueKg))

	if len(asc) < 2 {
		return head + lipgloss.NewStyle().Foreground(theme.Dim).Render("  (기록 1건)")
	}
	delta := latest.ValueKg - asc[0].ValueKg
	tone := theme.Dim
	sign := "±"
	switch {
	case delta > 0.05:
		tone, sign = theme.Amber, "+"
	case delta < -0.05:
		tone, sign = theme.Cyan, "−"
	}
	span := ""
	if first, err := time.Parse(time.RFC3339, asc[0].MeasuredAt); err == nil {
		if last, err2 := time.Parse(time.RFC3339, latest.MeasuredAt); err2 == nil {
			if days := int(last.Sub(first).Hours() / 24); days > 0 {
				span = fmt.Sprintf(" (%d일)", days)
			}
		}
	}
	return head + "  " + lipgloss.NewStyle().Foreground(tone).
		Render(fmt.Sprintf("%s%.1f%s", sign, absFloat(delta), span))
}

func absFloat(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

// bodyweightBody renders the whole view.
func bodyweightBody(items []api.BodyweightEntry, w, h int, braille bool) string {
	if len(items) == 0 {
		// **설정의 단일 체중값을 점 하나로 그리지 않는다.** 그건 추이가 아니고,
		// 웹에서도 같은 이유로 빈 상태를 둔다.
		return lipgloss.NewStyle().Foreground(theme.Ghost).Render(
			"기록이 없습니다. a 를 눌러 체중을 기록하면 추이가 그려지고,\n" +
				"강도 지표가 그 시점 체중으로 계산됩니다.",
		)
	}

	var b strings.Builder
	b.WriteString(bodyweightSummary(items))
	b.WriteString("\n\n")

	asc := bodyweightAscending(items)
	if len(asc) == 1 {
		b.WriteString(lipgloss.NewStyle().Foreground(theme.Dim).
			Render("기록이 2건 이상이면 추이가 그려집니다"))
		return b.String()
	}
	chartH := h - 3
	if chartH < 2 {
		chartH = 2
	}
	b.WriteString(lineChart(bodyweightValues(asc), w, chartH, braille))
	return b.String()
}
