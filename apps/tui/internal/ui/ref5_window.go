package ui

import (
	"context"
	"fmt"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

var ref5WindowOrder = []string{"SQ", "BP", "PULL", "DL", "OHP"}

type ref5WindowProgressRow struct {
	Key       string
	Label     string
	Current   int
	Threshold int
	Completed int
}

type ref5WindowProgressState struct {
	planID    string
	requestID uint64
	status    *api.Ref5Status
	loading   bool
	err       string
}

type ref5WindowStatusLoadedMsg struct {
	planID    string
	requestID uint64
	status    *api.Ref5Status
	err       error
}

func ref5WindowStatusLoadCmd(c *api.Client, planID string, requestID uint64) tea.Cmd {
	return func() tea.Msg {
		status, err := c.Ref5PlanStatus(context.Background(), planID)
		return ref5WindowStatusLoadedMsg{
			planID: planID, requestID: requestID, status: status, err: err,
		}
	}
}

func (l *Log) clearRef5WindowStatus() {
	l.ref5Progress = ref5WindowProgressState{requestID: l.ref5Progress.requestID + 1}
}

// beginRef5WindowStatusLoad keeps the last confirmed value visible while a
// refresh is in flight. planID correlation prevents a late response from a
// previous plan replacing the current Today buffer's judgment windows.
func (l *Log) beginRef5WindowStatusLoad(planID string) tea.Cmd {
	planID = strings.TrimSpace(planID)
	if planID == "" {
		l.clearRef5WindowStatus()
		return nil
	}
	status := l.ref5Progress.status
	if l.ref5Progress.planID != planID {
		status = nil
	}
	requestID := l.ref5Progress.requestID + 1
	l.ref5Progress = ref5WindowProgressState{
		planID: planID, requestID: requestID, status: status, loading: true,
	}
	return ref5WindowStatusLoadCmd(l.client, planID, requestID)
}

func ref5WindowLabel(key string) string {
	switch key {
	case "SQ":
		return "SQ 하드"
	case "BP":
		return "BP 집중"
	case "PULL":
		return "PULL 집중"
	default:
		return key
	}
}

func ref5WindowProgressRows(windows map[string]api.Ref5WindowStatus) []ref5WindowProgressRow {
	rows := make([]ref5WindowProgressRow, 0, len(ref5WindowOrder))
	for _, key := range ref5WindowOrder {
		window := windows[key]
		rows = append(rows, ref5WindowProgressRow{
			Key: key, Label: ref5WindowLabel(key), Current: window.Current,
			Threshold: window.Threshold, Completed: window.Completed,
		})
	}
	return rows
}

func ref5WindowPlainItems(windows map[string]api.Ref5WindowStatus) []string {
	rows := ref5WindowProgressRows(windows)
	items := make([]string, 0, len(rows))
	for _, row := range rows {
		items = append(items, fmt.Sprintf("%s %d/%d·%d", row.Label, row.Current, row.Threshold, row.Completed))
	}
	return items
}

func ref5WindowPlainLines(windows map[string]api.Ref5WindowStatus, width int) []string {
	if width < 1 {
		width = 1
	}
	return strings.Split(flowHints(ref5WindowPlainItems(windows), width), "\n")
}

func (l Log) ref5WindowPanelLines(width int, compact bool) []string {
	if l.ref5 == nil || l.planID == "" || l.ref5Progress.planID != l.planID {
		return nil
	}
	if width < 1 {
		width = 1
	}

	cyan := lipgloss.NewStyle().Foreground(theme.Cyan).Bold(true)
	dimStyle := lipgloss.NewStyle().Foreground(theme.Dim)
	amber := lipgloss.NewStyle().Foreground(theme.Amber)
	red := lipgloss.NewStyle().Foreground(theme.Red)
	title := cyan.Render("◆ 기본 판정창")
	legend := dimStyle.Render("진행/기준 · 판정완료")
	lines := make([]string, 0, 9)
	if lipgloss.Width(title)+1+lipgloss.Width(legend) <= width {
		lines = append(lines, justify(title, legend, width))
	} else {
		lines = append(lines, fitLine(title, width), fitLine(legend, width))
	}

	state := l.ref5Progress
	if state.status == nil {
		message := "판정창 상태를 사용할 수 없습니다"
		style := red
		if state.loading {
			message, style = "판정창 불러오는 중…", dimStyle
		} else if state.err != "" {
			message = theme.GlyphFail + " " + state.err
		}
		lines = append(lines, fitLine(style.Render(message), width))
	} else {
		items := make([]string, 0, len(ref5WindowOrder))
		for _, row := range ref5WindowProgressRows(state.status.Windows) {
			items = append(items,
				lipgloss.NewStyle().Foreground(theme.Fg).Bold(true).Render(row.Label)+" "+
					amber.Render(fmt.Sprintf("%d/%d", row.Current, row.Threshold))+
					dimStyle.Render(fmt.Sprintf("·%d", row.Completed)),
			)
		}
		lines = append(lines, strings.Split(flowHints(items, width), "\n")...)
		if state.loading {
			lines = append(lines, dimStyle.Render("새로고침 중…"))
		} else if state.err != "" {
			lines = append(lines, fitLine(red.Render(theme.GlyphFail+" 새로고침 실패: "+state.err), width))
		}
	}

	guides := []string{
		"하드 = INVALID 제외 SQ H3 3×3 / H2 3×2",
		"집중 = INVALID 제외 당일 우선 BP·PULL 3×3",
		"볼륨 = 진행 횟수 제외, FAIL은 최종 판정 반영",
		"기준 도달 = 자동 판정 후 0부터 재집계",
	}
	if compact {
		guides = []string{
			"하드 SQ H3(3×3)/H2(3×2) · 집중 당일 우선 BP·PULL 3×3 · INVALID 제외",
			"볼륨 횟수 제외/FAIL 반영 · 기준 도달 자동 판정→0부터 재집계",
		}
	}
	for _, guide := range guides {
		for _, line := range wrapRef5WindowText(guide, width) {
			lines = append(lines, dimStyle.Render(line))
		}
	}
	for i := range lines {
		lines[i] = fitLine(lines[i], width)
	}
	return lines
}

func wrapRef5WindowText(value string, width int) []string {
	words := strings.Fields(value)
	if len(words) == 0 {
		return nil
	}
	var lines []string
	current := ""
	for _, word := range words {
		candidate := word
		if current != "" {
			candidate = current + " " + word
		}
		if current != "" && lipgloss.Width(candidate) > width {
			lines = append(lines, fitLine(current, width))
			current = word
		} else {
			current = candidate
		}
	}
	if current != "" {
		lines = append(lines, fitLine(current, width))
	}
	return lines
}
