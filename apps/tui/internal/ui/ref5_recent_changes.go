package ui

import (
	"fmt"
	"strings"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

// REF5 최근 판정 이력 — progression-state의 recentChanges(엔진이 남긴 마지막 8건)를
// 플랜 상태 화면에서 훑을 수 있는 줄로 바꾼다. 저장 직후 판정 카드가 "방금 무슨 일이
// 났는가"라면, 이 이력은 "내 기준이 그동안 어떻게 움직였는가"에 답한다.
//
// ⚠️ web(`web/src/features/ref5/model/recent-changes.ts`)의 미러다. 라벨을 고치면
// 양쪽을 함께 고칠 것 — 두 테스트가 같은 기대 문자열을 쓴다.

// ref5RecentChangeLimit caps the list in the terminal. The panel already clips
// with windowLines, but silent clipping reads as "that's all there is", so the
// overflow is stated instead.
const ref5RecentChangeLimit = 5

type ref5RecentChangeRow struct {
	LiftLabel  string
	Arrow      string
	WeightText string
	KindLabel  string
}

// Mirrors core's ref5LiftStandardLabel: PULL carries "(총하중)" wherever a weight
// is shown next to it, because that number includes bodyweight.
func ref5ChangeLiftLabel(lift string) string {
	switch strings.ToUpper(strings.TrimSpace(lift)) {
	case "SQ":
		return "SQ 하드"
	case "BP":
		return "BP 집중"
	case "PULL":
		return "PULL 집중(총하중)"
	case "DL":
		return "DL"
	case "OHP":
		return "OHP"
	default:
		return strings.ToUpper(strings.TrimSpace(lift))
	}
}

func ref5ChangeKindLabel(kind string) string {
	switch strings.ToUpper(strings.TrimSpace(kind)) {
	case "INCREASE":
		return "증량"
	case "MAINTAIN":
		return "유지"
	case "IMMEDIATE_DECREASE":
		return "즉시 감량"
	case "STAGNATION_DECREASE":
		return "정체 감량"
	case "AUXILIARY_CAP_DECREASE":
		return "상한 감량"
	case "PULL_RELOCK":
		return "창 재고정"
	default:
		return strings.ToUpper(strings.TrimSpace(kind))
	}
}

// Same glyphs as the judgment-window flow (↑ increase / → hold) plus ↓ for
// drops, so one symbol system covers the whole REF5 surface.
func ref5ChangeArrow(kind string, beforeKg, afterKg float64) string {
	switch {
	case afterKg > beforeKg:
		return "↑"
	case afterKg < beforeKg:
		return "↓"
	case strings.EqualFold(strings.TrimSpace(kind), "INCREASE"):
		return "↑"
	default:
		return "→"
	}
}

// ref5RecentChangeRows returns the newest judgments first — the engine appends
// oldest-first — along with how many were dropped by the display cap.
func ref5RecentChangeRows(changes []api.Ref5ProgressionChange) ([]ref5RecentChangeRow, int) {
	rows := make([]ref5RecentChangeRow, 0, len(changes))
	for index := len(changes) - 1; index >= 0; index-- {
		change := changes[index]
		beforeKg, afterKg := float64(change.BeforeKg), float64(change.AfterKg)
		weight := fmt.Sprintf("%s → %s kg", trimNum(beforeKg), trimNum(afterKg))
		if beforeKg == afterKg {
			weight = trimNum(afterKg) + " kg"
		}
		rows = append(rows, ref5RecentChangeRow{
			LiftLabel:  ref5ChangeLiftLabel(change.Lift),
			Arrow:      ref5ChangeArrow(change.Kind, beforeKg, afterKg),
			WeightText: weight,
			KindLabel:  ref5ChangeKindLabel(change.Kind),
		})
	}
	if len(rows) <= ref5RecentChangeLimit {
		return rows, 0
	}
	return rows[:ref5RecentChangeLimit], len(rows) - ref5RecentChangeLimit
}

// ref5RecentChangeItems renders the rows as plain text lines for the status
// panel, with a trailing overflow marker when the cap hid older entries.
func ref5RecentChangeItems(changes []api.Ref5ProgressionChange) []string {
	rows, hidden := ref5RecentChangeRows(changes)
	if len(rows) == 0 {
		return []string{"아직 판정된 변경 없음"}
	}
	items := make([]string, 0, len(rows)+1)
	for _, row := range rows {
		items = append(items, fmt.Sprintf("%s %s %s %s", row.Arrow, row.LiftLabel, row.WeightText, row.KindLabel))
	}
	if hidden > 0 {
		items = append(items, fmt.Sprintf("… 이전 %d건 더", hidden))
	}
	return items
}
