package ui

import (
	"os"
	"strings"
	"testing"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func TestSummarizeImport(t *testing.T) {
	got := summarizeImport([]api.ImportSummaryRow{
		{Table: "workoutLog", WillDelete: 1, WillInsert: 3},
		{Table: "workoutSet", WillDelete: 0, WillInsert: 10},
		{Table: "plan", WillDelete: 0, WillInsert: 0},
	})
	if !strings.Contains(got, "workoutLog 3") || !strings.Contains(got, "workoutSet 10") {
		t.Errorf("summarizeImport = %q", got)
	}
	if strings.Contains(got, "plan ") {
		t.Error("tables with zero inserts should be omitted")
	}
	if summarizeImport(nil) != "0건" {
		t.Errorf("empty summary should be 0건, got %q", summarizeImport(nil))
	}
}

// 재계산 테이블은 willInsert가 늘 0이라 개수만 세면 요약에서 통째로 사라진다 —
// 사용자가 보는 것은 "삭제되고 끝"이고, 그게 정확히 #686이 고친 결함의 겉모습이다.
func TestSummarizeImportShowsRecompute(t *testing.T) {
	got := summarizeImport([]api.ImportSummaryRow{
		{Table: "plan", WillDelete: 1, WillInsert: 1},
		{Table: "planRuntimeState", WillDelete: 1, WillInsert: 0, WillRecompute: true},
		{Table: "workoutSet", WillDelete: 0, WillInsert: 10},
	})
	if !strings.Contains(got, recomputeTag) {
		t.Errorf("재계산 표기가 없다 — 삭제만 되고 끝나는 것처럼 읽힌다: %q", got)
	}
	if strings.Contains(got, "planRuntimeState 0") {
		t.Errorf("재계산 행을 개수로 적으면 안 된다: %q", got)
	}
	// 잘릴 때 먼저 지켜야 하는 것은 개수다 — 태그는 맨 뒤.
	if !strings.HasSuffix(got, recomputeTag) {
		t.Errorf("재계산 태그는 맨 뒤여야 한다: %q", got)
	}

	// 아무것도 안 바뀌는 import에 태그만 남기면 없는 일을 알리는 셈이다.
	only := summarizeImport([]api.ImportSummaryRow{
		{Table: "planRuntimeState", WillRecompute: true},
	})
	if only != "0건" {
		t.Errorf("재계산 행만 있으면 0건이어야 한다, got %q", only)
	}

	// 이 필드를 모르는 구 서버는 false로 디코드된다 → 종전 개수-only 표기.
	legacy := summarizeImport([]api.ImportSummaryRow{
		{Table: "planRuntimeState", WillDelete: 1, WillInsert: 0},
		{Table: "workoutSet", WillInsert: 10},
	})
	if strings.Contains(legacy, recomputeTag) {
		t.Errorf("구 서버 응답에 태그가 붙으면 안 된다: %q", legacy)
	}
}

func TestExpandPath(t *testing.T) {
	if got := expandPath("/abs/x.json"); got != "/abs/x.json" {
		t.Errorf("absolute path should be unchanged, got %q", got)
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		if got := expandPath("~/x.json"); !strings.HasPrefix(got, home) {
			t.Errorf("~ should expand to home, got %q", got)
		}
	}
}
