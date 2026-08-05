package ui

import (
	"fmt"
	"strings"
	"time"

	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

func onOff(value bool) string {
	if value {
		return "yes"
	}
	return "no"
}

func ref5Justify(left, right string, w int) string {
	return fitLine(justify(left, right, w), w)
}

func (l Log) renderRef5Start(w int) string {
	if l.ref5 == nil {
		return ""
	}
	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	cyan := lipgloss.NewStyle().Foreground(theme.Cyan)
	amber := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true)
	start := l.ref5.Start.ActualStartAt
	if at, err := time.Parse(time.RFC3339Nano, start); err == nil {
		start = at.In(ref5PlanLocation(l.ref5.Plan)).Format("2006-01-02 15:04:05 MST")
	}
	lines := []string{
		amber.Render("REF5 v1.3 · FIRST SQUAT START"),
		"",
		ref5Justify(dim.Render("실제 시작"), cyan.Render(start), w),
		ref5Justify(dim.Render("오늘 체중"), cyan.Render(trimNum(l.ref5.Start.BodyweightKg)+" kg"), w),
		ref5Justify(dim.Render("수동 MICRO"), cyan.Render(onOff(l.ref5.Start.ManualMicro)), w),
		"",
		dim.Render("미리보기는 상태를 바꾸지 않습니다."),
	}
	if l.ref5.Phase == ref5Previewing {
		lines = append(lines, cyan.Render("처방 계산 중…"))
	}
	return strings.Join(lines, "\n")
}

func summarizeRef5PlannedExercise(ex api.PlannedExercise) string {
	if len(ex.Sets) == 0 {
		return "—"
	}
	first := ex.Sets[0]
	reps := first.PlannedReps
	if reps == 0 {
		reps = first.Reps
	}
	ext := float64(first.ExternalLoadKg)
	if ext == 0 && float64(first.TargetWeightKg) != 0 {
		ext = float64(first.TargetWeightKg)
	}
	total := float64(first.TotalLoadKg)
	if total != 0 && total != ext {
		return fmt.Sprintf("%d×%d @ +%s / %s total", len(ex.Sets), reps, trimNum(ext), trimNum(total))
	}
	return fmt.Sprintf("%d×%d @ %s", len(ex.Sets), reps, trimNum(ext))
}

// ref5HardGateLines shows why today's SQ is hard or volume: the last hard start
// that the 48-hour rule counts from, the 168-hour density, and the rule itself.
// It sits above the prescription list because the body window clips at the
// bottom — the verdict's evidence must survive a short terminal.
func ref5HardGateLines(gate ref5HardGate, loc *time.Location, w int) []string {
	if !gate.Present {
		return nil
	}
	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	cyan := lipgloss.NewStyle().Foreground(theme.Cyan)
	amber := lipgloss.NewStyle().Foreground(theme.Amber)

	last, lastStyle := "없음 · 최초 하드 H3", cyan
	if gate.HasLastStart {
		last = gate.LastStartAt.In(loc).Format("01-02 15:04")
		if gate.HasElapsed {
			last += " · " + ref5FormatGap(gate.Elapsed) + " 전"
		}
		if !gate.ElapsedMet {
			lastStyle = amber
		}
	}
	density, densityStyle := fmt.Sprintf("하드 %d회 / %d회 미만", gate.StartsIn168Hours, ref5HardDensityLimit), cyan
	if !gate.DensityMet {
		densityStyle = amber
	}
	rule := "48h↑ & 168h 내 2회↓ → 하드"
	switch {
	case gate.Micro:
		rule = "MICRO는 조건 무관 · SQ는 V 2×5"
	case gate.HasElapsed && !gate.ElapsedMet:
		// 40컬럼 본문의 실폭은 38이다. "남음"까지 붙이면 뒤가 잘린다.
		rule = "48h까지 " + ref5FormatGap(gate.Remaining) + " · 168h 2회↓"
	}
	return []string{
		fitLine(dim.Render("직전    ")+lastStyle.Render(last), w),
		fitLine(dim.Render("7일창   ")+densityStyle.Render(density), w),
		fitLine(dim.Render("기준    ")+dim.Render(rule), w),
	}
}

func (l Log) renderRef5Preview(w int) string {
	if l.ref5 == nil || l.ref5.Preview == nil {
		return l.renderRef5Start(w)
	}
	preview := l.ref5.Preview
	mode, squat, focus, reasons := ref5PreviewDecision(preview)
	amber := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true)
	cyan := lipgloss.NewStyle().Foreground(theme.Cyan)
	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	parts := []string{mode}
	if squat != "" {
		parts = append(parts, "SQ "+squat)
	}
	if focus != "" {
		parts = append(parts, "FOCUS "+focus)
	}
	parts = append(parts, fmt.Sprintf("%d sets", preview.Snapshot.TotalWorkingSets))
	lines := []string{amber.Render("PREVIEW  ") + cyan.Render(strings.Join(parts, " · ")), ""}
	if gate := ref5HardGateLines(ref5PreviewHardGate(preview, mode), ref5SessionLocation(preview), w); len(gate) > 0 {
		lines = append(lines, gate...)
		lines = append(lines, "")
	}
	for _, ex := range preview.Snapshot.Exercises {
		left := lipgloss.NewStyle().Foreground(theme.Fg).Bold(true).Render(truncate(ex.ExerciseName, 20))
		right := cyan.Render(summarizeRef5PlannedExercise(ex))
		lines = append(lines, ref5Justify(left, right, w))
	}
	lines = append(lines, "")
	if len(reasons) == 0 {
		lines = append(lines, dim.Render("reason  none · NORMAL 조건 충족"))
	} else {
		lines = append(lines, dim.Render("reason  ")+cyan.Render(strings.Join(reasons, ", ")))
	}
	lines = append(lines, dim.Render("s/Enter는 첫 SQ 워크 세트 시작을 확정합니다."))
	return strings.Join(lines, "\n")
}
