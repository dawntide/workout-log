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
		amber.Render("REF5 v1.1 · FIRST SQUAT START"),
		"",
		ref5Justify(dim.Render("실제 시작"), cyan.Render(start), w),
		ref5Justify(dim.Render("오늘 체중"), cyan.Render(trimNum(l.ref5.Start.BodyweightKg)+" kg"), w),
		ref5Justify(dim.Render("수동 MICRO"), cyan.Render(onOff(l.ref5.Start.ManualMicro)), w),
		ref5Justify(dim.Render("48h 클라이밍"), cyan.Render(onOff(l.ref5.Start.ClimbingWithin48h)), w),
		ref5Justify(dim.Render("PULL 생략"), cyan.Render(onOff(l.ref5.Start.OmitPullVolume)), w),
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
	for _, ex := range preview.Snapshot.Exercises {
		left := lipgloss.NewStyle().Foreground(theme.Fg).Bold(true).Render(truncate(ex.ExerciseName, 20))
		right := cyan.Render(summarizeRef5PlannedExercise(ex))
		lines = append(lines, ref5Justify(left, right, w))
	}
	if preview.Snapshot.Ref5 != nil {
		for _, omitted := range preview.Snapshot.Ref5.OmittedPrescriptions {
			left := lipgloss.NewStyle().Foreground(theme.Dim).Render(truncate(omitted.ExerciseName, 20))
			lines = append(lines, ref5Justify(left, dim.Render(omitted.Stream+" · OMITTED · INVALID"), w))
		}
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
