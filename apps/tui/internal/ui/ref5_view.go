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
		amber.Render("REF5 v" + api.Ref5ProtocolVersion + " · FIRST SQUAT START"),
		"",
		ref5Justify(dim.Render("실제 시작"), cyan.Render(start), w),
		ref5Justify(dim.Render("오늘 체중"), cyan.Render(trimNum(l.ref5.Start.BodyweightKg)+" kg"), w),
		ref5Justify(dim.Render("수동 MICRO"), cyan.Render(onOff(l.ref5.Start.ManualMicro)), w),
	}
	if l.ref5.Start.OapSlotReverted || l.ref5NextFocusIsBP() {
		lines = append(lines, ref5Justify(dim.Render("OAP 되돌리기"), cyan.Render(onOff(l.ref5.Start.OapSlotReverted)), w))
	}
	lines = append(lines,
		"",
		dim.Render("미리보기는 상태를 바꾸지 않습니다."),
	)
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
// It sits below the prescription list — what you lift today outranks why, so a
// short terminal clips the reasoning rather than the working weights.
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

	// 기준 줄은 두 조건의 현황과 결과를 한 줄에 담는다. 세 줄이면 중간 높이
	// (상단 판정창이 compact를 벗어나는 구간)에서 뒷줄이 창 밖으로 밀린다.
	densityStyle := cyan
	if !gate.DensityMet {
		densityStyle = amber
	}
	density := fmt.Sprintf("7일 %d/%d회", gate.StartsIn168Hours, ref5HardDensityLimit)
	var rule string
	switch {
	case gate.Micro:
		rule = dim.Render("MICRO는 조건 무관 · SQ는 V 2×5")
	case gate.HasElapsed && !gate.ElapsedMet:
		// 40컬럼 본문의 실폭은 38이라 "남음"까지 붙이면 뒤가 잘린다.
		rule = amber.Render("48h까지 "+ref5FormatGap(gate.Remaining)) +
			dim.Render(" · ") + densityStyle.Render(density)
	default:
		outcome := "V"
		if gate.Allowed {
			outcome = "하드"
		}
		rule = dim.Render("48h↑ · ") + densityStyle.Render(density) + dim.Render(" → "+outcome)
	}

	return []string{
		fitLine(dim.Render("직전    ")+lastStyle.Render(last), w),
		fitLine(dim.Render("기준    ")+rule, w),
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
	// 처방(무게·세트·횟수)이 먼저고, 판정 근거는 그 아래에서 "왜 이 처방인지"를 받는다.
	if gate := ref5HardGateLines(ref5PreviewHardGate(preview, mode), ref5SessionLocation(preview), w); len(gate) > 0 {
		lines = append(lines, gate...)
	}
	// 40컬럼에서 두 줄로 접히던 안내다. 한 줄로 줄여 본문 한 행을 세션에 돌린다.
	lines = append(lines, dim.Render("s/Enter  첫 SQ 워크 세트 시작 확정"))
	return strings.Join(lines, "\n")
}
