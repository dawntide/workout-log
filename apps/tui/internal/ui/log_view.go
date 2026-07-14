package ui

// log_view.go — 오늘 버퍼 렌더링(Body 윈도잉, 세션 헤더, 운동 그룹/세트 행, 셀, 저장 후 요약·
// 판정 피드백 라인). 상태/커맨드/변이와 분리 — god-component 분해 3단계.

import (
	"fmt"
	"strconv"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// --- rendering ---

func (l Log) Body(w, h int) string {
	pad := bodyPad(h)
	compact := compactView(h)
	inner := h - 2*pad
	if inner < 1 {
		inner = 1
	}

	// Pinned chrome: the session header (plan name + cycle label) and edit banner
	// stick to the top; feedback lines and the status line stick to the bottom so
	// a save confirmation stays visible no matter how many exercises scroll
	// between them.
	var head, foot []string
	if sh := l.sessionHeader(); sh != "" {
		head = append(head, sh)
	}
	if l.editID != "" {
		head = append(head, lipgloss.NewStyle().Foreground(theme.Amber).Render("■ 편집 중 · "+l.performedAt.Format("2006-01-02")))
	}
	if len(head) > 0 && !compact {
		head = append(head, "")
	}
	foot = append(foot, l.feedback...)
	if l.status != "" {
		tone := theme.Green
		if l.statusErr {
			tone = theme.Red
		}
		foot = append(foot, lipgloss.NewStyle().Foreground(tone).Render(l.status))
	}

	all := append([]string{}, head...)
	if len(l.groups) == 0 {
		emptyLines := strings.Split(l.renderEmpty(w-2), "\n")
		avail := inner - len(head) - len(foot)
		if avail < 1 {
			avail = 1
		}
		all = append(all, windowLines(emptyLines, 0, avail)...)
	} else {
		// Flatten groups to lines and window them around the active set so the
		// cursor stays on screen and, crucially, the frame's hint bar + mode
		// line below the body are never pushed off the bottom (the old Body
		// rendered every group and overflowed, clipping the footer entirely).
		lines, active := l.groupLines(w, compact)
		avail := inner - len(head) - len(foot)
		if avail < 1 {
			avail = 1
		}
		all = append(all, windowLines(lines, active, avail)...)
	}
	all = append(all, foot...)
	return lipgloss.NewStyle().Width(w).Height(h).Padding(pad, 1).Render(strings.Join(all, "\n"))
}

// groupLines flattens every exercise group into a single line slice (a header
// row followed by its set rows, with a blank line between groups unless compact)
// and reports the line index of the active set so windowLines can center it.
func (l Log) groupLines(w int, compact bool) (lines []string, active int) {
	for gi, g := range l.groups {
		if gi > 0 && !compact {
			lines = append(lines, "")
		}
		lines = append(lines, l.groupHeader(gi, g, w))
		for si, s := range g.sets {
			if gi == l.gi && si == l.si {
				active = len(lines)
			}
			lines = append(lines, l.renderSet(gi, si, s))
		}
	}
	return lines, active
}

// sessionHeader renders today's header — the active plan/program name and the
// cycle session label (e.g. "5/3/1 Leader · C2W6D1") — so it's clear which plan
// and which session today is. Empty when neither is known.
func (l Log) sessionHeader() string {
	var parts []string
	if name := strings.TrimSpace(l.planName); name != "" {
		parts = append(parts, lipgloss.NewStyle().Foreground(theme.Fg).Bold(true).Render(name))
	}
	label := sessionLabel(l.sessionKey)
	if l.ref5 != nil {
		location := ref5PlanLocation(l.ref5.Plan)
		if l.ref5.Session != nil {
			location = ref5SessionLocation(l.ref5.Session)
		}
		label = sessionLabelIn(l.sessionKey, location)
	}
	if lab := label; lab != "" {
		parts = append(parts, lipgloss.NewStyle().Foreground(theme.Cyan).Bold(true).Render(lab))
	}
	if l.ref5 != nil && l.ref5.active() {
		mode, squat, focus, _ := ref5PreviewDecision(l.ref5.Session)
		var ref5Tags []string
		if mode != "" {
			ref5Tags = append(ref5Tags, mode)
		}
		if squat != "" {
			ref5Tags = append(ref5Tags, "SQ "+squat)
		}
		if focus != "" {
			ref5Tags = append(ref5Tags, focus)
		}
		if len(ref5Tags) > 0 {
			parts = append(parts, lipgloss.NewStyle().Foreground(theme.Amber).Render("["+strings.Join(ref5Tags, " · ")+"]"))
		}
	}
	// v0.5.1 세션 태그(F3·F4) — 스냅샷 승격 메타를 한 줄 태그로. 웹 배너의 TUI-최적 축약.
	if l.amrapDeferred {
		parts = append(parts, lipgloss.NewStyle().Foreground(theme.Amber).Render("AMRAP보류"))
	}
	if l.lightBlock {
		parts = append(parts, lipgloss.NewStyle().Foreground(theme.Dim).Render("라이트블록"))
	}
	return strings.Join(parts, lipgloss.NewStyle().Foreground(theme.Dim).Render(" · "))
}

// renderEmpty draws the empty-buffer state: a loading line while today's
// session auto-loads, a program prompt when no active plan exists, or the
// manual-entry hint otherwise.
func (l Log) renderEmpty(w int) string {
	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	ghost := lipgloss.NewStyle().Foreground(theme.Ghost)
	if l.ref5 != nil {
		if l.ref5.Phase == ref5PreviewReady {
			return l.renderRef5Preview(w)
		}
		return l.renderRef5Start(w)
	}
	switch l.load {
	case loadPending:
		return dim.Render("오늘 세션 불러오는 중…")
	case loadNoPlan:
		return ghost.Render("활성 플랜이 없습니다.\n\n") +
			hint("p", "프로그램") + dim.Render(" 에서 플랜 시작\n") +
			hint("e", "운동 추가") + dim.Render(" 로 자유 기록")
	default:
		return ghost.Render("오늘 기록이 비어 있습니다.\n\n") +
			hint("e", "운동 추가") + dim.Render(" 로 시작")
	}
}

// groupHeader renders one exercise's header row: the name (or an inline rename
// input when editing the name), right-justified with its prev/tgt context.
func (l Log) groupHeader(gi int, g exGroup, w int) string {
	if gi == l.gi && l.editing && l.target == editName {
		return l.edit.View()
	}
	name := g.name
	if strings.TrimSpace(name) == "" {
		name = "운동?"
	}
	header := lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render(strings.ToUpper(name))
	ctx := ""
	if g.prev != "" {
		ctx = "prev " + g.prev
	}
	if g.tgt != "" {
		if ctx != "" {
			ctx += "  "
		}
		ctx += "tgt " + g.tgt
	}
	if g.ref5 != nil {
		if g.ref5.Stream != "" {
			if ctx != "" {
				ctx += "  "
			}
			ctx += g.ref5.Stream
		}
		if g.ref5.TerminationReason != "" {
			outcome, err := ref5Outcome(g)
			label := "CHECK"
			if err == nil {
				label = outcome
			}
			if ctx != "" {
				ctx += "  "
			}
			ctx += label + "/" + g.ref5.TerminationReason
		}
	}
	if ctx != "" {
		header = fitLine(justify(header, lipgloss.NewStyle().Foreground(theme.Dim).Render(ctx), w-2), w-2)
	}
	return header
}

func (l Log) renderSet(gi, si int, s setEntry) string {
	active := gi == l.gi && si == l.si
	marker := "   "
	if active {
		marker = lipgloss.NewStyle().Foreground(theme.Amber).Render(" › ")
	}
	// Bodyweight lifts: the cell shows the bodyweight-inclusive total, with the
	// external added weight broken out as a "(+20)" / "(체중)" suffix at the row
	// end (mirrors the web). While editing the weight, the cell shows the raw
	// external input instead and the suffix is hidden.
	wText, suffix := orDot(s.weight), ""
	isPull := l.groups[gi].ref5 != nil && l.groups[gi].ref5.Lift == "PULL"
	if (isPull || isBodyweightExercise(l.groups[gi].name)) && s.total > 0 {
		wText = trimNum(s.total)
		if !(active && l.editing && l.col == colWeight) {
			added, _ := strconv.ParseFloat(strings.TrimSpace(s.weight), 64)
			suffix = " " + lipgloss.NewStyle().Foreground(theme.Dim).Render(addedSuffix(added))
		}
	}
	wcell := l.setCell(active, colWeight, wText, 6)
	rcell := l.repsCell(active, s)
	sep := lipgloss.NewStyle().Foreground(theme.Dim).Render(" × ")

	// RPE: an editable cell when the RPE column is active here, otherwise shown
	// only when a value exists (optional metric, never forced).
	rpe := "    " // reserved 4-col slot so done/e1rm stay aligned across sets
	if l.groups[gi].ref5 != nil {
		rpe = "    " // immutable REF5 rows never expose an RPE editor
	} else if active && l.col == colRPE {
		rpe = lipgloss.NewStyle().Foreground(theme.Dim).Render(" @") + l.setCell(active, colRPE, orDot(s.rpe), 2)
	} else if s.rpe != "" {
		rpe = lipgloss.NewStyle().Foreground(theme.Dim).Render(fmt.Sprintf(" @%-2s", s.rpe))
	}

	done := lipgloss.NewStyle().Foreground(theme.Ghost).Render("·")
	if s.done {
		done = lipgloss.NewStyle().Foreground(theme.Green).Render(theme.GlyphDone)
	}
	e1rm := ""
	if v := setE1rm(s); v > 0 {
		e1rm = lipgloss.NewStyle().Foreground(theme.Dim).Render(fmt.Sprintf(" e%.0f", v))
	}
	return marker + wcell + sep + rcell + rpe + "   " + done + e1rm + suffix
}

func (l Log) setCell(active bool, c logCol, text string, width int) string {
	if active && l.editing && l.target == editCell && l.col == c {
		return l.edit.View()
	}
	if active && l.col == c {
		return lipgloss.NewStyle().Foreground(theme.Amber).Width(width).Render(truncate(text, width))
	}
	base := lipgloss.NewStyle().Foreground(theme.Cyan)
	if c == colReps {
		base = lipgloss.NewStyle().Foreground(theme.Fg)
	}
	return base.Width(width).Render(truncate(text, width))
}

// repsCell renders the reps column, showing the planned reps as a dim
// placeholder when empty and unfocused (plan session). Mirrors the web's
// placeholder={plannedReps} so each set's target is visible inline, while the
// actual value stays empty until the user types it.
func (l Log) repsCell(active bool, s setEntry) string {
	if !active && strings.TrimSpace(s.reps) == "" && s.tgtReps > 0 {
		return lipgloss.NewStyle().Foreground(theme.Ghost).Width(3).Render(strconv.Itoa(s.tgtReps))
	}
	return l.setCell(active, colReps, orDot(s.reps), 3)
}

// feedbackLines renders the server-assembled progression feedback (judgment
// card / early-deload banner) as pinned foot lines. Copy comes verbatim from
// the API (core feedback-catalog) so web and TUI wording never drift; this only
// styles and caps it for narrow phone viewports. Cleared on the next session
// load or edit entry.
func feedbackLines(fb *api.ProgressionFeedback) []string {
	if fb == nil {
		return nil
	}
	var out []string
	amber := lipgloss.NewStyle().Foreground(theme.Amber)
	cyan := lipgloss.NewStyle().Foreground(theme.Cyan)
	if b := fb.EarlyDeloadBanner; b != nil {
		out = append(out, amber.Bold(true).Render(b.Title), amber.Render(b.Body))
	}
	if r := fb.Report; r != nil && len(r.Rows) > 0 {
		out = append(out, amber.Bold(true).Render(r.Title))
		for _, row := range r.Rows {
			out = append(out, cyan.Render("  "+row.Text))
		}
	}
	// 좁은 뷰포트 보호: 판정 라인이 테이블을 밀어내지 않게 상한을 둔다.
	const maxLines = 7
	if len(out) > maxLines {
		out = out[:maxLines]
	}
	return out
}

// summarizeSaved builds the post-save status line: a count + tonnage headline
// plus any server-detected PRs. Keeps the "저장됨/수정됨" verb the rest of the
// UI expects.
func summarizeSaved(groups []exGroup, detail *api.LogDetail, edited bool) string {
	n := 0
	vol := 0.0
	for _, g := range groups {
		for _, s := range g.sets {
			if !s.done {
				continue
			}
			n++
			r, _ := strconv.Atoi(s.reps)
			vol += setLoad(s) * float64(r)
		}
	}
	verb := "저장됨"
	if edited {
		verb = "수정됨"
	}
	head := fmt.Sprintf("%s %s · %d세트 · %skg", theme.GlyphDone, verb, n, trimNum(vol))
	if detail != nil && len(detail.PersonalRecords) > 0 {
		parts := make([]string, 0, len(detail.PersonalRecords))
		for _, pr := range detail.PersonalRecords {
			parts = append(parts, fmt.Sprintf("%s %s e1RM %.1f", theme.GlyphPeak, pr.ExerciseName, float64(pr.EstOneRm)))
		}
		head += "   [PR] " + strings.Join(parts, "  ")
	}
	return head
}

func hint(k, label string) string {
	return lipgloss.NewStyle().Foreground(theme.Cyan).Bold(true).Render(k) + " " +
		lipgloss.NewStyle().Foreground(theme.Dim).Render(label)
}

func dim(s string) string { return lipgloss.NewStyle().Foreground(theme.Dim).Render(s) }
