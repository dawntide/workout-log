package ui

import (
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

// TestLogSessionHeader verifies today shows the plan name and cycle label.
func TestLogSessionHeader(t *testing.T) {
	l := sampleLog()
	l.planName, l.sessionKey = "5/3/1 Leader", "C2W6D1"
	out := ansi.Strip(l.Body(58, 16))
	for _, want := range []string{"5/3/1 Leader", "C2W6D1"} {
		if !strings.Contains(out, want) {
			t.Errorf("today body missing session header %q:\n%s", want, out)
		}
	}
}

// TestHistorySessionLabel verifies a history row surfaces the cycle label.
func TestHistorySessionLabel(t *testing.T) {
	hi := NewHistory(nil)
	hi.loaded = true
	hi.build([]api.LogItem{
		{ID: "1", PerformedAt: time.Now(), GeneratedSession: &api.GeneratedSessionRef{SessionKey: "C2W6D1"}, Sets: []api.LoggedSet{{ExerciseName: "Squat", WeightKg: 100, Reps: 5}}},
	})
	out := ansi.Strip(hi.Body(60, 14))
	if !strings.Contains(out, "C2W6D1") {
		t.Errorf("history row missing session label:\n%s", out)
	}
}

// TestLogSessionHeaderFeedbackTags verifies the v0.5.1 session tags (deferred
// AMRAP / light block) surface in the today header when the snapshot flags are
// set, and stay absent otherwise.
func TestLogSessionHeaderFeedbackTags(t *testing.T) {
	l := sampleLog()
	l.planName, l.sessionKey = "Hybrid", "C1W3D1"
	l.amrapDeferred, l.lightBlock = true, true
	out := ansi.Strip(l.Body(58, 16))
	for _, want := range []string{"AMRAP보류", "라이트블록"} {
		if !strings.Contains(out, want) {
			t.Errorf("today header missing feedback tag %q:\n%s", want, out)
		}
	}

	plain := sampleLog()
	plain.planName, plain.sessionKey = "Hybrid", "C1W1D1"
	outPlain := ansi.Strip(plain.Body(58, 16))
	for _, absent := range []string{"AMRAP보류", "라이트블록"} {
		if strings.Contains(outPlain, absent) {
			t.Errorf("today header shows tag %q without snapshot flag:\n%s", absent, outPlain)
		}
	}
}

// TestFeedbackLines verifies the server-assembled judgment card renders as
// pinned foot lines (verbatim copy, capped for narrow viewports).
func TestFeedbackLines(t *testing.T) {
	if got := feedbackLines(nil, 80, 7); got != nil {
		t.Fatalf("nil feedback should render nothing, got %v", got)
	}
	fb := &api.ProgressionFeedback{
		Report: &api.ProgressReport{
			EventID: "evt",
			Title:   "블록 완주 — 증량 판정",
			Rows: []api.ProgressReportRow{
				{Target: "SQUAT", Text: "스쿼트 +2.5 (6연속 성공)"},
			},
		},
		EarlyDeloadBanner: &api.FeedbackBanner{Title: "⚠️ 조기 디로드 발동", Body: "TM은 유지됩니다."},
	}
	lines := feedbackLines(fb, 80, 7)
	joined := ansi.Strip(strings.Join(lines, "\n"))
	for _, want := range []string{"조기 디로드", "블록 완주 — 증량 판정", "스쿼트 +2.5 (6연속 성공)"} {
		if !strings.Contains(joined, want) {
			t.Errorf("feedback lines missing %q:\n%s", want, joined)
		}
	}

	// 상한: 과다 행은 좁은 뷰포트를 지키되, 잘리는 게 아니라 남은 건수를 밝힌다.
	long := &api.ProgressionFeedback{Report: &api.ProgressReport{Title: "t"}}
	for i := 0; i < 20; i++ {
		long.Report.Rows = append(long.Report.Rows, api.ProgressReportRow{Target: "X", Text: "row"})
	}
	capped := feedbackLines(long, 80, 7)
	if len(capped) > 7 {
		t.Errorf("feedback lines not capped: %d", len(capped))
	}
	if last := ansi.Strip(capped[len(capped)-1]); !strings.Contains(last, "판정") || !strings.Contains(last, "더") {
		t.Errorf("capped card does not state the remainder: %q", last)
	}
}

// 판정 문구는 무게 변화와 **적용 시점**을 함께 담는다. 좁은 pane에서 뒤가 잘리면
// 하필 "다음 세션부터 적용"이 사라지므로, 접혀야지 잘려선 안 된다.
func TestFeedbackLinesFoldInsteadOfTruncating(t *testing.T) {
	const row = "PULL 집중(총하중) — 판정창 클리어 → 기준 증량 82.5 → 85 kg (+2.5) · 다음 세션부터 적용"
	fb := &api.ProgressionFeedback{
		Report: &api.ProgressReport{
			EventID: "evt",
			Title:   "REF5 창 판정",
			Rows:    []api.ProgressReportRow{{Target: "PULL:INCREASE", Text: row}},
		},
	}

	// 줄바꿈은 어디서 일어나도 좋다 — 공백을 정규화했을 때 원문이 온전히 남아야 한다.
	flat := func(value string) string { return strings.Join(strings.Fields(value), " ") }

	for _, width := range []int{78, 60, 40} {
		lines := feedbackLines(fb, width, 10)
		joined := ansi.Strip(strings.Join(lines, "\n"))
		if !strings.Contains(flat(joined), flat(row)) {
			t.Errorf("w=%d lost part of the row:\n%s", width, joined)
		}
		for _, line := range lines {
			if got := ansi.StringWidth(line); got > width {
				t.Errorf("w=%d produced a %d-wide line: %q", width, got, ansi.Strip(line))
			}
		}
		// 이어지는 줄은 한 항목임이 드러나게 더 깊게 들여쓴다.
		if len(lines) < 3 {
			t.Fatalf("w=%d did not fold the long row: %#v", width, lines)
		}
		if cont := ansi.Strip(lines[2]); !strings.HasPrefix(cont, "    ") {
			t.Errorf("w=%d continuation is not hanging-indented: %q", width, cont)
		}
	}
}
