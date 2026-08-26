package ui

import (
	"strings"
	"testing"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func entry(at string, kg float64) api.BodyweightEntry {
	return api.BodyweightEntry{ID: at, MeasuredAt: at, ValueKg: kg}
}

// API는 최신순으로 준다. 차트는 시간순이어야 한다 — 안 뒤집으면 추세가 좌우로
// 뒤집혀 "빠지는 중"이 "찌는 중"으로 보인다.
func TestBodyweightAscendingReversesApiOrder(t *testing.T) {
	newestFirst := []api.BodyweightEntry{
		entry("2026-08-26T00:00:00Z", 72.0),
		entry("2026-08-20T00:00:00Z", 73.0),
		entry("2026-08-10T00:00:00Z", 74.0),
	}
	got := bodyweightValues(bodyweightAscending(newestFirst))
	want := []float64{74.0, 73.0, 72.0}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("시간순이 아니다\n got %v\nwant %v", got, want)
		}
	}
}

func TestBodyweightSummaryShowsDelta(t *testing.T) {
	// 오늘 값만 보여주면 설정 화면과 다를 것이 없다 — 변화량이 요점이다.
	out := plain(bodyweightSummary([]api.BodyweightEntry{
		entry("2026-08-26T00:00:00Z", 72.0),
		entry("2026-07-27T00:00:00Z", 74.5),
	}))
	if !strings.Contains(out, "72.0kg") {
		t.Fatalf("최신 값이 없다: %q", out)
	}
	if !strings.Contains(out, "2.5") {
		t.Fatalf("변화량이 없다: %q", out)
	}
	if !strings.Contains(out, "−") {
		t.Fatalf("감소 부호가 없다: %q", out)
	}
	if !strings.Contains(out, "30일") {
		t.Fatalf("기간이 없다: %q", out)
	}
}

func TestBodyweightSummaryIncrease(t *testing.T) {
	out := plain(bodyweightSummary([]api.BodyweightEntry{
		entry("2026-08-26T00:00:00Z", 75.0),
		entry("2026-08-16T00:00:00Z", 74.0),
	}))
	if !strings.Contains(out, "+1.0") {
		t.Fatalf("증가 표기가 틀렸다: %q", out)
	}
}

func TestBodyweightSummarySingleEntry(t *testing.T) {
	// 1건이면 변화량이 없다. 0.0을 보여주면 "변화 없음"이라는 거짓 정보가 된다.
	out := plain(bodyweightSummary([]api.BodyweightEntry{entry("2026-08-26T00:00:00Z", 72.0)}))
	if strings.Contains(out, "±0.0") || strings.Contains(out, "+0.0") {
		t.Fatalf("1건인데 변화량을 지어냈다: %q", out)
	}
	if !strings.Contains(out, "기록 1건") {
		t.Fatalf("1건임을 안 밝힌다: %q", out)
	}
}

func TestBodyweightBodyEmptyStateExplainsWhy(t *testing.T) {
	// **설정의 단일 체중값을 점 하나로 그리지 않는다.** 그건 추이가 아니다.
	out := plain(bodyweightBody(nil, 60, 12, true))
	if !strings.Contains(out, "a 를 눌러") {
		t.Fatalf("기록하는 법을 안 알려 준다:\n%s", out)
	}
	if !strings.Contains(out, "그 시점 체중") {
		t.Fatalf("왜 기록해야 하는지 안 밝힌다:\n%s", out)
	}
}

func TestBodyweightBodySingleEntryDrawsNoChart(t *testing.T) {
	out := plain(bodyweightBody([]api.BodyweightEntry{entry("2026-08-26T00:00:00Z", 72.0)}, 60, 12, false))
	if !strings.Contains(out, "72.0kg") {
		t.Fatalf("값이 없다:\n%s", out)
	}
	if !strings.Contains(out, "2건 이상") {
		t.Fatalf("차트가 왜 없는지 안 밝힌다:\n%s", out)
	}
}

func TestBodyweightBodyFitsWidth(t *testing.T) {
	items := []api.BodyweightEntry{
		entry("2026-08-26T00:00:00Z", 72.4),
		entry("2026-08-19T00:00:00Z", 73.1),
		entry("2026-08-12T00:00:00Z", 73.8),
	}
	for _, w := range []int{30, 50, 100} {
		out := plain(bodyweightBody(items, w, 12, false))
		for _, line := range strings.Split(out, "\n") {
			if n := len([]rune(line)); n > w {
				t.Fatalf("폭 %d에서 %d칸 줄: %q", w, n, line)
			}
		}
	}
}
