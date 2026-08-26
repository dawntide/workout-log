package ui

import (
	"fmt"
	"image/color"
	"sort"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// 부위별 신선도 렌더링.
//
// **웹의 카드를 옮기지 않았다.** 웹은 스크롤 페이지 안의 카드 하나지만, 터미널
// stats는 화면을 통째로 쓰는 버퍼다. 8부위가 한 화면에 다 들어가므로 스크롤이
// 필요 없고, 게이지를 가로로 길게 뽑아 **한눈에 비교**하게 만드는 편이 낫다.
// 웹의 얇은 막대를 그대로 옮기면 터미널의 가로 폭을 버리는 셈이다.

// 부위 라벨. 웹과 같은 어휘를 쓴다 — 같은 부위를 두 클라이언트가 다르게 부르면
// 사용자가 같은 것인지 알 수 없다.
var muscleGroupLabelKo = map[string]string{
	"Quad":      "대퇴사두",
	"Hamstring": "햄스트링",
	"Glute":     "둔근",
	"Back":      "등",
	"Chest":     "가슴",
	"Shoulder":  "어깨",
	"Arm":       "팔",
	"Core":      "코어",
	"Other":     "기타",
}

func muscleGroupLabel(group string) string {
	if label, ok := muscleGroupLabelKo[group]; ok {
		return label
	}
	return group
}

// 신선(≥70) / 보통(30~70) / 피로(<30). 웹과 같은 경계다.
const (
	freshThreshold = 70
	tiredThreshold = 30
)

// 반환 타입이 `color.Color`다 — `lipgloss.Color`는 타입이 아니라 함수다.
func freshnessTone(pct int) (color.Color, string) {
	switch {
	case pct >= freshThreshold:
		return theme.Green, "신선"
	case pct >= tiredThreshold:
		return theme.Amber, "보통"
	default:
		return theme.Red, "피로"
	}
}

// freshnessGauge draws a filled bar of the given cell width.
//
// 부분 칸을 `theme.Blocks`로 채운다 — 터미널 한 칸이 8단계를 표현할 수 있으므로
// 폭이 좁아도 5%와 12%가 구분된다. 정수 칸만 쓰면 둘 다 빈 막대가 된다.
func freshnessGauge(pct, width int) string {
	if width < 1 {
		return ""
	}
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	eighths := pct * width * 8 / 100
	full := eighths / 8
	rem := eighths % 8

	var b strings.Builder
	b.WriteString(strings.Repeat("█", full))
	cells := full
	if rem > 0 && cells < width {
		b.WriteRune(theme.Blocks[rem-1])
		cells++
	}
	if cells < width {
		b.WriteString(strings.Repeat("░", width-cells))
	}
	return b.String()
}

// sortedFreshnessGroups orders most-ready first, no-record last.
//
// 이 화면이 답하는 질문이 "오늘 뭘 할 수 있나"라 가장 준비된 부위가 위에 와야 한다.
// 고정 해부학 순서는 참조표에는 맞지만 질문에 답하지 않는다.
func sortedFreshnessGroups(groups []api.MuscleFreshnessGroup) []api.MuscleFreshnessGroup {
	out := make([]api.MuscleFreshnessGroup, 0, len(groups))
	for _, g := range groups {
		// `Other`는 목록에서 숨긴다 — 매핑 공백은 부위가 아니다.
		if g.MuscleGroup == "Other" {
			continue
		}
		out = append(out, g)
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.HasRecord() != b.HasRecord() {
			return a.HasRecord()
		}
		return a.FreshnessPct > b.FreshnessPct
	})
	return out
}

// freshnessBody renders the whole view.
func freshnessBody(f *api.MuscleFreshness, w int) string {
	groups := sortedFreshnessGroups(f.Groups)

	labelW := 0
	for _, g := range groups {
		if n := lipgloss.Width(muscleGroupLabel(g.MuscleGroup)); n > labelW {
			labelW = n
		}
	}
	// 한 줄은 `라벨 + 2칸 + 게이지 + 2칸 + 꼬리`다. 꼬리는 "100% 신선"·"기록 없음"
	// 둘 다 9칸으로 고정 폭이다.
	//
	// ⚠️ **하한을 두면 안 된다.** 좁은 터미널에서 "최소 8칸"을 우기면 줄이 폭을 넘고
	// 프레임이 깨진다 — 자리가 없으면 게이지를 빼는 편이 맞다.
	const tailW = 9
	const gapW = 2
	gaugeW := w - labelW - tailW - 2*gapW
	if gaugeW > 40 {
		gaugeW = 40
	}

	var b strings.Builder
	// 파라미터는 좁은 폭에서도 사라지면 안 된다 — 근거를 밝히는 것이 이 화면의
	// 정체성이다. 대신 **줄이 넘치면 프레임이 깨지므로** 폭에 맞춰 줄인다.
	days := (f.RecoveryHours + 12) / 24
	caption := fmt.Sprintf("최근 %d주 주간 평균 볼륨 기준 · %d일이면 완전 회복", f.CapacityWeeks, days)
	if lipgloss.Width(caption) > w {
		caption = fmt.Sprintf("%d주 기준 · %d일 회복", f.CapacityWeeks, days)
	}
	b.WriteString(lipgloss.NewStyle().Foreground(theme.Dim).Render(caption))
	b.WriteString("\n\n")

	anyRecord := false
	for _, g := range groups {
		label := muscleGroupLabel(g.MuscleGroup)
		pad := strings.Repeat(" ", labelW-lipgloss.Width(label))

		if gaugeW < 1 {
			// 게이지가 들어갈 자리가 없다 — 숫자만 남긴다. 넘치는 것보다 낫다.
			if !g.HasRecord() {
				b.WriteString(lipgloss.NewStyle().Foreground(theme.Ghost).
					Render(label+pad+"  기록 없음") + "\n")
				continue
			}
			anyRecord = true
			tone, word := freshnessTone(g.FreshnessPct)
			b.WriteString(lipgloss.NewStyle().Foreground(tone).
				Render(fmt.Sprintf("%s%s  %3d%% %s", label, pad, g.FreshnessPct, word)) + "\n")
			continue
		}

		if !g.HasRecord() {
			// **"100% 신선"으로 그리지 않는다.** 모델은 100을 주지만 뜻은 "기록 없음"이다.
			// 게이지를 채우면 "쉬어서 준비됨"으로 읽힌다 — 거짓말이다.
			b.WriteString(fmt.Sprintf("%s%s  %s  %s\n",
				label, pad,
				lipgloss.NewStyle().Foreground(theme.Ghost).Render(strings.Repeat("─", gaugeW)),
				lipgloss.NewStyle().Foreground(theme.Ghost).Render("기록 없음"),
			))
			continue
		}
		anyRecord = true
		tone, word := freshnessTone(g.FreshnessPct)
		b.WriteString(fmt.Sprintf("%s%s  %s  %s\n",
			label, pad,
			lipgloss.NewStyle().Foreground(tone).Render(freshnessGauge(g.FreshnessPct, gaugeW)),
			lipgloss.NewStyle().Foreground(tone).Render(fmt.Sprintf("%3d%% %s", g.FreshnessPct, word)),
		))
	}

	if !anyRecord {
		return lipgloss.NewStyle().Foreground(theme.Ghost).Render(
			"최근 기록이 없습니다. 세션을 저장하면 부위별로 쌓인 피로가 여기 표시됩니다.",
		)
	}

	if f.OtherSetShare > 0 {
		b.WriteString("\n")
		gap := fmt.Sprintf("부위를 특정하지 못한 세트 %.1f%% — 어느 게이지에도 반영되지 않았습니다",
			f.OtherSetShare*100)
		if lipgloss.Width(gap) > w {
			gap = fmt.Sprintf("미분류 세트 %.1f%%", f.OtherSetShare*100)
		}
		b.WriteString(lipgloss.NewStyle().Foreground(theme.Ghost).Render(gap))
	}
	return b.String()
}
