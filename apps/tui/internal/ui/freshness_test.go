package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

// TUI는 TTY가 필요해 실행 검증을 못 한다 — 렌더 문자열을 직접 만들어 확인한다.

func group(name string, pct int, capacity float64) api.MuscleFreshnessGroup {
	return api.MuscleFreshnessGroup{MuscleGroup: name, FreshnessPct: pct, CapacityKg: capacity}
}

func plain(s string) string { return ansi.Strip(s) }

func TestFreshnessGaugeFillsProportionally(t *testing.T) {
	if got := freshnessGauge(0, 10); strings.ContainsRune(got, '█') {
		t.Fatalf("0%%인데 채워졌다: %q", got)
	}
	if got := freshnessGauge(100, 10); got != strings.Repeat("█", 10) {
		t.Fatalf("100%%가 가득 차지 않았다: %q", got)
	}
	// 폭은 항상 요청한 칸 수다 — 줄이 들쭉날쭉하면 비교가 안 된다.
	for _, pct := range []int{0, 1, 7, 33, 50, 99, 100} {
		if n := len([]rune(freshnessGauge(pct, 12))); n != 12 {
			t.Fatalf("%d%%의 폭이 %d칸이다(12 기대)", pct, n)
		}
	}
}

func TestFreshnessGaugeUsesPartialCells(t *testing.T) {
	// 정수 칸만 쓰면 좁은 폭에서 5%와 12%가 둘 다 빈 막대가 된다.
	// `theme.Blocks`로 한 칸을 8단계로 쪼개 구분한다.
	a := freshnessGauge(5, 8)
	b := freshnessGauge(12, 8)
	if a == b {
		t.Fatalf("5%%와 12%%가 같게 그려진다: %q", a)
	}
	if !strings.ContainsAny(a, string(rune('▁'))+"▂▃▄▅▆▇") {
		t.Fatalf("부분 칸을 안 쓴다: %q", a)
	}
}

func TestFreshnessGaugeClamps(t *testing.T) {
	if n := len([]rune(freshnessGauge(-20, 6))); n != 6 {
		t.Fatalf("음수 입력에서 폭이 깨진다: %d", n)
	}
	if got := freshnessGauge(250, 6); got != strings.Repeat("█", 6) {
		t.Fatalf("100%% 초과가 넘친다: %q", got)
	}
}

func TestFreshnessSortsMostReadyFirstAndHidesOther(t *testing.T) {
	got := sortedFreshnessGroups([]api.MuscleFreshnessGroup{
		group("Chest", 20, 100),
		group("Core", 100, 0), // 기록 없음 → 맨 아래
		group("Other", 100, 0),
		group("Quad", 80, 100),
	})
	var names []string
	for _, g := range got {
		names = append(names, g.MuscleGroup)
	}
	want := []string{"Quad", "Chest", "Core"}
	if strings.Join(names, ",") != strings.Join(want, ",") {
		t.Fatalf("순서가 다르다\n got %v\nwant %v", names, want)
	}
}

func TestFreshnessBodyDistinguishesNoRecord(t *testing.T) {
	// **이 화면의 핵심 계약.** 모델은 "6일 쉬어서 100%"와 "한 번도 안 함"을 둘 다
	// 100으로 준다. 게이지를 채우면 후자가 "쉬어서 준비됨"으로 읽힌다 — 거짓말이다.
	out := plain(freshnessBody(&api.MuscleFreshness{
		RecoveryHours: 144,
		CapacityWeeks: 8,
		Groups: []api.MuscleFreshnessGroup{
			group("Quad", 100, 500), // 진짜 회복 완료
			group("Core", 100, 0),   // 기록 없음
		},
	}, 60))

	if !strings.Contains(out, "기록 없음") {
		t.Fatalf("기록 없는 부위를 구분하지 않는다:\n%s", out)
	}
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "코어") {
			if strings.ContainsRune(line, '█') {
				t.Fatalf("기록 없는 부위에 게이지를 채웠다: %q", line)
			}
		}
		if strings.Contains(line, "대퇴사두") {
			if !strings.ContainsRune(line, '█') {
				t.Fatalf("회복 완료 부위에 게이지가 없다: %q", line)
			}
			if !strings.Contains(line, "100%") || !strings.Contains(line, "신선") {
				t.Fatalf("회복 완료 표기가 없다: %q", line)
			}
		}
	}
}

func TestFreshnessBodyShowsModelParameters(t *testing.T) {
	// 근거를 밝히는 것이 이 기능의 정체성이다 — 파라미터가 사라지면 불투명한 점수다.
	out := plain(freshnessBody(&api.MuscleFreshness{
		RecoveryHours: 96,
		CapacityWeeks: 8,
		Groups:        []api.MuscleFreshnessGroup{group("Quad", 40, 100)},
	}, 60))
	if !strings.Contains(out, "8주") || !strings.Contains(out, "4일") {
		t.Fatalf("모델 파라미터가 화면에 없다:\n%s", out)
	}
}

func TestFreshnessBodyEmptyState(t *testing.T) {
	out := plain(freshnessBody(&api.MuscleFreshness{
		RecoveryHours: 144,
		CapacityWeeks: 8,
		Groups: []api.MuscleFreshnessGroup{
			group("Quad", 100, 0),
			group("Chest", 100, 0),
		},
	}, 60))
	if strings.ContainsRune(out, '█') {
		t.Fatalf("전부 기록이 없는데 게이지를 그렸다:\n%s", out)
	}
	if !strings.Contains(out, "세션을 저장하면") {
		t.Fatalf("빈 상태 안내가 없다:\n%s", out)
	}
}

func TestFreshnessBodyReportsMappingGap(t *testing.T) {
	out := plain(freshnessBody(&api.MuscleFreshness{
		RecoveryHours: 144,
		CapacityWeeks: 8,
		Groups:        []api.MuscleFreshnessGroup{group("Quad", 40, 100)},
		OtherSetShare: 0.123,
	}, 70))
	if !strings.Contains(out, "12.3%") {
		t.Fatalf("매핑 공백 비율을 안 밝힌다:\n%s", out)
	}
}

func TestFreshnessBodyFitsNarrowWidth(t *testing.T) {
	// 좁은 터미널에서 줄이 넘치면 프레임이 깨진다.
	for _, w := range []int{28, 40, 80, 120} {
		out := plain(freshnessBody(&api.MuscleFreshness{
			RecoveryHours: 144,
			CapacityWeeks: 8,
			Groups: []api.MuscleFreshnessGroup{
				group("Hamstring", 43, 300),
				group("Quad", 0, 500),
			},
		}, w))
		for _, line := range strings.Split(out, "\n") {
			if n := ansi.StringWidth(line); n > w {
				t.Fatalf("폭 %d에서 %d칸짜리 줄이 나왔다: %q", w, n, line)
			}
		}
	}
}

func TestFreshnessToneBoundaries(t *testing.T) {
	// 웹과 같은 경계여야 두 클라이언트가 같은 상태를 같게 부른다.
	if _, w := freshnessTone(70); w != "신선" {
		t.Fatalf("70%%는 신선이어야 한다: %s", w)
	}
	if _, w := freshnessTone(69); w != "보통" {
		t.Fatalf("69%%는 보통이어야 한다: %s", w)
	}
	if _, w := freshnessTone(30); w != "보통" {
		t.Fatalf("30%%는 보통이어야 한다: %s", w)
	}
	if _, w := freshnessTone(29); w != "피로" {
		t.Fatalf("29%%는 피로여야 한다: %s", w)
	}
}
