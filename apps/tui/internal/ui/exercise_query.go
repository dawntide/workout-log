package ui

import "strings"

// exerciseQuery is a parsed search line.
//
// 웹은 칩 줄로 부위·장비를 고르지만 터미널에서는 **한 줄 문법**이 맞다.
// 칩 줄은 화면에서 두 행을 먹고 키 바인딩을 새로 요구하는데, 터미널 검색은
// ripgrep·fzf·GitHub처럼 접두사를 입력에 섞는 것이 이미 관용이다.
//
//	squat cat:legs eq:barbell
//	press eq:dumbbell
//	cat:back
type exerciseQuery struct {
	Term      string
	Category  string
	Equipment string
}

// 접두사 → 필드. `cat:`·`eq:`는 짧게 치는 형태, 긴 형태도 받는다.
var exerciseQueryPrefixes = []struct {
	prefix string
	assign func(*exerciseQuery, string)
}{
	{"category:", func(q *exerciseQuery, v string) { q.Category = v }},
	{"cat:", func(q *exerciseQuery, v string) { q.Category = v }},
	{"equipment:", func(q *exerciseQuery, v string) { q.Equipment = v }},
	{"eq:", func(q *exerciseQuery, v string) { q.Equipment = v }},
}

// parseExerciseQuery splits a search line into a free-text term and filters.
//
// 알 수 없는 토큰은 검색어로 남긴다 — 오타 하나로 입력이 통째로 버려지면
// 사용자는 무엇이 잘못됐는지 알 수 없다.
func parseExerciseQuery(line string) exerciseQuery {
	var q exerciseQuery
	var terms []string

	for _, token := range strings.Fields(line) {
		matched := false
		lower := strings.ToLower(token)
		for _, p := range exerciseQueryPrefixes {
			if !strings.HasPrefix(lower, p.prefix) {
				continue
			}
			value := strings.TrimSpace(token[len(p.prefix):])
			// `cat:` 뒤가 비면 필터가 아니라 오타다 — 검색어로 흘린다.
			if value == "" {
				break
			}
			p.assign(&q, value)
			matched = true
			break
		}
		if !matched {
			terms = append(terms, token)
		}
	}

	q.Term = strings.Join(terms, " ")
	return q
}

// hasFilters reports whether the line narrowed by anything other than free text.
func (q exerciseQuery) hasFilters() bool {
	return q.Category != "" || q.Equipment != ""
}

// summary renders the active filters for the status line ("" when none).
func (q exerciseQuery) summary() string {
	var parts []string
	if q.Category != "" {
		parts = append(parts, "부위:"+q.Category)
	}
	if q.Equipment != "" {
		parts = append(parts, "장비:"+q.Equipment)
	}
	return strings.Join(parts, " ")
}
