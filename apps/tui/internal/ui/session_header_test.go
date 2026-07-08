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
	if got := feedbackLines(nil); got != nil {
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
	lines := feedbackLines(fb)
	joined := ansi.Strip(strings.Join(lines, "\n"))
	for _, want := range []string{"조기 디로드", "블록 완주 — 증량 판정", "스쿼트 +2.5 (6연속 성공)"} {
		if !strings.Contains(joined, want) {
			t.Errorf("feedback lines missing %q:\n%s", want, joined)
		}
	}

	// 상한: 과다 행은 잘려 좁은 뷰포트를 지킨다.
	long := &api.ProgressionFeedback{Report: &api.ProgressReport{Title: "t"}}
	for i := 0; i < 20; i++ {
		long.Report.Rows = append(long.Report.Rows, api.ProgressReportRow{Target: "X", Text: "row"})
	}
	if got := len(feedbackLines(long)); got > 7 {
		t.Errorf("feedback lines not capped: %d", got)
	}
}
