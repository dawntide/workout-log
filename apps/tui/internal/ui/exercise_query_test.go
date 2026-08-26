package ui

import "testing"

// 검색 문법의 계약. TTY 없이 도는 순수부라 여기서 전부 잠근다.

func TestParseExerciseQuery(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want exerciseQuery
	}{
		{"빈 줄", "", exerciseQuery{}},
		{"검색어만", "back squat", exerciseQuery{Term: "back squat"}},
		{"부위만", "cat:legs", exerciseQuery{Category: "legs"}},
		{"장비만", "eq:barbell", exerciseQuery{Equipment: "barbell"}},
		{
			"검색어 + 둘 다",
			"squat cat:legs eq:barbell",
			exerciseQuery{Term: "squat", Category: "legs", Equipment: "barbell"},
		},
		{
			"순서가 달라도 같다",
			"eq:barbell squat cat:legs",
			exerciseQuery{Term: "squat", Category: "legs", Equipment: "barbell"},
		},
		{"긴 형태", "category:back equipment:cable", exerciseQuery{Category: "back", Equipment: "cable"}},
		{"대소문자 무시", "CAT:Legs EQ:Barbell", exerciseQuery{Category: "Legs", Equipment: "Barbell"}},
		{
			// 오타 하나로 입력이 통째로 버려지면 사용자는 무엇이 잘못됐는지 모른다.
			"알 수 없는 접두사는 검색어로 남는다",
			"muscle:legs squat",
			exerciseQuery{Term: "muscle:legs squat"},
		},
		{
			"값이 빈 접두사는 필터가 아니다",
			"cat: squat",
			exerciseQuery{Term: "cat: squat"},
		},
		{"공백이 여럿이어도 뭉개지 않는다", "  squat   cat:legs  ", exerciseQuery{Term: "squat", Category: "legs"}},
		{"마지막 값이 이긴다", "cat:legs cat:back", exerciseQuery{Category: "back"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseExerciseQuery(tc.in)
			if got != tc.want {
				t.Fatalf("parseExerciseQuery(%q)\n got %+v\nwant %+v", tc.in, got, tc.want)
			}
		})
	}
}

func TestExerciseQuerySummary(t *testing.T) {
	// 상태줄이 걸린 필터를 말해야 "켜 둔 걸 잊는" 실패 모드를 막는다.
	if s := (exerciseQuery{}).summary(); s != "" {
		t.Fatalf("필터가 없는데 요약이 있다: %q", s)
	}
	if s := (exerciseQuery{Term: "squat"}).summary(); s != "" {
		t.Fatalf("검색어는 필터가 아니다: %q", s)
	}
	if s := (exerciseQuery{Category: "legs"}).summary(); s != "부위:legs" {
		t.Fatalf("부위 요약이 틀렸다: %q", s)
	}
	if s := (exerciseQuery{Category: "legs", Equipment: "barbell"}).summary(); s != "부위:legs 장비:barbell" {
		t.Fatalf("복합 요약이 틀렸다: %q", s)
	}
}

func TestExerciseQueryHasFilters(t *testing.T) {
	if (exerciseQuery{Term: "squat"}).hasFilters() {
		t.Fatal("검색어만 있는데 필터가 있다고 한다")
	}
	if !(exerciseQuery{Equipment: "cable"}).hasFilters() {
		t.Fatal("장비 필터를 못 본다")
	}
}
