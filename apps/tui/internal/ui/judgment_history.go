package ui

import (
	"strings"
	"time"

	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// 판정 이력 패널.
//
// 판정 카드는 다음 세션을 시작하면 사라진다(의도된 수명). 그래서 "지난 두 달 동안
// 스쿼트가 몇 번 리셋됐나"를 답할 자리가 없었다 — 이 패널이 그 갭을 메운다.
//
// **문구를 여기서 만들지 않는다.** 서버가 카드와 같은 조립기(feedback-catalog)로
// 만든 행을 그대로 렌더한다. 클라이언트가 문구를 복제하면 카드와 이력이 같은 판정을
// 다르게 말하게 된다 — 웹도 같은 이유로 서버 문구를 그대로 쓴다.

// judgmentDay formats an ISO timestamp as MM-DD ("" when unparseable).
func judgmentDay(iso string) string {
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return ""
	}
	return t.Format("01-02")
}

// judgmentHistoryLines renders the entries into plain body lines.
func judgmentHistoryLines(entries []api.JudgmentHistoryEntry, w int) []string {
	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	fg := lipgloss.NewStyle().Foreground(theme.Fg)
	amber := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true)

	var lines []string
	for i, e := range entries {
		if i > 0 {
			lines = append(lines, "")
		}
		day := judgmentDay(e.CreatedAt)
		lines = append(lines, justify(amber.Render(truncate(e.Title, w-8)), dim.Render(day), w))
		for _, row := range e.Rows {
			text := strings.TrimSpace(row.Text)
			if text == "" {
				continue
			}
			lines = append(lines, fg.Render("  "+truncate(text, w-2)))
		}
	}
	return lines
}

// renderJudgmentHistory draws the panel for a non-REF5 plan.
func (s Programs) renderJudgmentHistory(w, h int) string {
	name := ""
	if len(s.plans) > 0 {
		name = s.plans[s.sel].Name
	}
	inner := w - 2
	if inner < 1 {
		inner = 1
	}
	amber := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true)
	dim := lipgloss.NewStyle().Foreground(theme.Dim)

	head := justify(amber.Render("판정 이력"), dim.Render(truncate(name, 18)), inner)

	entries := s.planState.JudgmentHistory
	if len(entries) == 0 {
		body := dim.Render("아직 판정 기록이 없습니다.\n세션을 저장하면 무게 변경 판정이 여기 쌓입니다.")
		return lipgloss.NewStyle().Width(w).Height(h).Padding(bodyPad(h), 1).
			Render(head + "\n\n" + body)
	}

	pad := bodyPad(h)
	avail := h - 2*pad - 2
	if avail < 1 {
		avail = 1
	}
	lines := judgmentHistoryLines(entries, inner)
	if len(lines) > avail {
		lines = lines[:avail]
	}
	return lipgloss.NewStyle().Width(w).Height(h).Padding(pad, 1).
		Render(head + "\n\n" + strings.Join(lines, "\n"))
}
