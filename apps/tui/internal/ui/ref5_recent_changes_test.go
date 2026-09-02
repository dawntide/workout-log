package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

// The expected strings below are the same ones asserted in
// web/src/features/ref5/model/recent-changes.test.ts. Both clients format this
// list independently (Go cannot import the TS model), so the wording is only
// kept in sync by these two tests agreeing.
func ref5Change(lift, kind string, beforeKg, afterKg float64) api.Ref5ProgressionChange {
	return api.Ref5ProgressionChange{
		EventID:  strings.ToLower(kind) + ":" + lift + ":c1",
		Lift:     lift,
		Kind:     kind,
		BeforeKg: api.Float64(beforeKg),
		AfterKg:  api.Float64(afterKg),
	}
}

func TestRef5RecentChangeItemsMatchWebWording(t *testing.T) {
	// 엔진은 오래된 것부터 쌓는다 → 최신순으로 뒤집혀야 한다.
	items := ref5RecentChangeItems([]api.Ref5ProgressionChange{
		ref5Change("SQ", "IMMEDIATE_DECREASE", 100, 97.5),
		ref5Change("PULL", "STAGNATION_DECREASE", 90, 87.5),
		ref5Change("OHP", "AUXILIARY_CAP_DECREASE", 45, 43.75),
	})
	want := []string{
		"↓ OHP 45 → 43.75 kg 상한 감량",
		"↓ PULL 집중(총하중) 90 → 87.5 kg 정체 감량",
		"↓ SQ 하드 100 → 97.5 kg 즉시 감량",
	}
	if len(items) != len(want) {
		t.Fatalf("items = %#v, want %d rows", items, len(want))
	}
	for index := range want {
		if items[index] != want[index] {
			t.Errorf("row %d = %q, want %q", index, items[index], want[index])
		}
	}
}

func TestRef5RecentChangeItemsFormatEachKind(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change api.Ref5ProgressionChange
		want   string
	}{
		{"increase", ref5Change("SQ", "INCREASE", 100, 102.5), "↑ SQ 하드 100 → 102.5 kg 증량"},
		// 유지는 "62.5 → 62.5"가 아니라 무게를 한 번만 적는다.
		{"maintain", ref5Change("BP", "MAINTAIN", 62.5, 62.5), "→ BP 집중 62.5 kg 유지"},
		{"relock moved", ref5Change("PULL", "PULL_RELOCK", 20, 22.5), "↑ PULL 집중(총하중) 20 → 22.5 kg 창 재고정"},
		{"relock same", ref5Change("PULL", "PULL_RELOCK", 20, 20), "→ PULL 집중(총하중) 20 kg 창 재고정"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			items := ref5RecentChangeItems([]api.Ref5ProgressionChange{tc.change})
			if len(items) != 1 || items[0] != tc.want {
				t.Errorf("items = %#v, want [%q]", items, tc.want)
			}
		})
	}
}

// 세로 공간이 없는 터미널에서 조용히 잘리면 "이게 전부"로 읽힌다. 상한을 넘긴 건수는
// 반드시 표시돼야 한다.
func TestRef5RecentChangeItemsStateTheOverflow(t *testing.T) {
	changes := make([]api.Ref5ProgressionChange, 0, 8)
	for i := 0; i < 8; i++ {
		changes = append(changes, ref5Change("SQ", "INCREASE", 100, 102.5))
	}
	items := ref5RecentChangeItems(changes)
	if len(items) != ref5RecentChangeLimit+1 {
		t.Fatalf("items = %d, want %d rows + overflow marker", len(items), ref5RecentChangeLimit)
	}
	if got := items[len(items)-1]; got != "… 이전 3건 더" {
		t.Errorf("overflow marker = %q", got)
	}
}

func TestRef5RecentChangeItemsSayWhenEmpty(t *testing.T) {
	if got := ref5RecentChangeItems(nil); len(got) != 1 || got[0] != "아직 판정된 변경 없음" {
		t.Errorf("empty items = %#v", got)
	}
}

// 상태 화면이 실제로 이력을 그리는지 — 파생만 맞고 배선이 빠지면 사용자는 못 본다.
func TestRef5StatusPanelRendersRecentChanges(t *testing.T) {
	status := ref5WindowStatusFixture()
	status.RecentChanges = []api.Ref5ProgressionChange{
		ref5Change("BP", "MAINTAIN", 62.5, 62.5),
		ref5Change("SQ", "INCREASE", 100, 102.5),
	}
	s := Programs{
		plans:          []api.Plan{uiRef5Plan()},
		showRef5Status: true,
		statusPlanID:   "plan-ref5",
		planState:      &api.PlanProgressionState{Ref5Status: status},
	}

	out := ansi.Strip(s.renderRef5Status(72, 40))
	for _, want := range []string{
		"CHG",
		"↑ SQ 하드 100 → 102.5 kg 증량",
		"→ BP 집중 62.5 kg 유지",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("REF5 status panel missing %q:\n%s", want, out)
		}
	}
	// 최신순: SQ(나중에 쌓인 것)가 BP보다 위에 온다.
	if strings.Index(out, "SQ 하드 100") > strings.Index(out, "BP 집중 62.5") {
		t.Errorf("recent judgments are not newest-first:\n%s", out)
	}
}

// OAP 변경은 before/after가 kg가 아니라 사다리 단이다(스펙 7.5). 여기에 "kg"가
// 붙으면 값 자체가 거짓이 되므로, 단위가 새는지를 이 테스트가 지킨다.
func TestRef5RecentChangeItemsRenderOapRungsNotKilograms(t *testing.T) {
	promote := ref5Change("OAP", "OAP_PROMOTE", 2, 3)
	promote.Arm = "left"
	demote := ref5Change("OAP", "OAP_DEMOTE", 4, 3)
	demote.Arm = "right"
	achieve := ref5Change("OAP", "OAP_ACHIEVE", 6, 6)
	achieve.Arm = "left"

	items := ref5RecentChangeItems([]api.Ref5ProgressionChange{promote, demote, achieve})
	want := []string{
		"↑ OAP 사다리 좌 6단 · 프리 달성",
		"↓ OAP 사다리 우 4 → 3단 강등",
		"↑ OAP 사다리 좌 2 → 3단 승급",
	}
	if len(items) != len(want) {
		t.Fatalf("items = %#v, want %d rows", items, len(want))
	}
	for index, expected := range want {
		if got := ansi.Strip(items[index]); got != expected {
			t.Errorf("items[%d] = %q, want %q", index, got, expected)
		}
	}
	for _, item := range items {
		if strings.Contains(item, "kg") {
			t.Errorf("OAP 행에 kg가 새어 나왔다: %q", item)
		}
	}
}
