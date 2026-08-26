package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	"charm.land/bubbles/v2/textinput"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
	"github.com/sharru0701/workout-log/apps/tui/internal/theme"
)

// 액세스 토큰(PAT) 패널.
//
// **왜 웹이 있는데 TUI에도 두는가.** 토큰의 소비자가 터미널 쪽이다 — MCP 서버는
// 셸에서 뜨고, 백업 스크립트도 셸에서 돈다. 토큰을 만들려고 브라우저를 여는 것은
// 작업 흐름이 한 번 끊기는 일이다.
//
// **왜 웹 화면을 그대로 옮기지 않는가.** 평문은 한 번만 보인다 — 웹에서는 마우스로
// 긁어 복사하면 되지만 **SSH 세션에는 그 마우스가 없다**. 그래서 이 화면의 중심은
// 목록이 아니라 `y` 한 키다(OSC 52는 SSH 너머에서도 로컬 클립보드에 닿는다).
// alt screen이라 평문이 스크롤백에 남지도 않는다 — 터미널이 웹보다 나은 지점이다.

const (
	tokenScopeRead  = "read"
	tokenScopeWrite = "read_write"
)

// MCP 서버가 토큰을 읽는 환경변수(apps/mcp README와 같은 이름).
const tokenEnvVar = "WORKOUT_LOG_TOKEN"

func tokenScopeLabel(scope string) string {
	if scope == tokenScopeWrite {
		return "읽기+쓰기"
	}
	return "읽기"
}

// --- messages ---

type tokensLoadedMsg struct {
	items []api.ApiTokenSummary
	err   error
}

type tokenIssuedMsg struct {
	token string
	err   error
}

type tokenRevokedMsg struct{ err error }

// --- commands ---

func tokensLoadCmd(c *api.Client) tea.Cmd {
	return func() tea.Msg {
		items, err := c.ApiTokens(context.Background())
		return tokensLoadedMsg{items: items, err: err}
	}
}

func tokenIssueCmd(c *api.Client, name, scope string) tea.Cmd {
	return func() tea.Msg {
		tok, _, err := c.IssueApiToken(context.Background(), name, scope)
		return tokenIssuedMsg{token: tok, err: err}
	}
}

func tokenRevokeCmd(c *api.Client, hash string) tea.Cmd {
	return func() tea.Msg {
		return tokenRevokedMsg{err: c.RevokeApiToken(context.Background(), hash)}
	}
}

// --- state ---

// tokenPanel is the ACCESS TOKENS overlay state owned by the Settings buffer.
type tokenPanel struct {
	loaded bool
	items  []api.ApiTokenSummary
	sel    int
	err    string

	naming bool // 발급 폼이 열려 있다
	name   textinput.Model
	scope  string

	// 발급 직후 평문. **이 필드가 유일한 사본이다** — 패널을 닫으면 사라진다.
	issued string
	copied bool
}

func newTokenNameField() textinput.Model {
	ti := textinput.New()
	ti.Prompt = ""
	ti.SetVirtualCursor(true)
	ti.SetWidth(24)
	ti.CharLimit = 60 // 서버 NAME_MAX_LENGTH와 같다
	return ti
}

// --- key handling ---

func (s Settings) updateTokens(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	// 평문이 떠 있는 동안은 목록 조작을 막는다. 실수로 한 키 눌러 평문을 잃는 것이
	// 이 화면에서 가장 비싼 사고다.
	if s.tok.issued != "" {
		return s.updateIssued(m)
	}
	if s.tok.naming {
		return s.updateTokenNaming(m)
	}
	switch m.String() {
	case "esc":
		s.form = formNone
		s.tok = tokenPanel{}
		return s, nil
	case "j", "down":
		if s.tok.sel < len(s.tok.items)-1 {
			s.tok.sel++
		}
	case "k", "up":
		if s.tok.sel > 0 {
			s.tok.sel--
		}
	case "n":
		s.tok.naming = true
		s.tok.scope = tokenScopeRead
		s.tok.name = newTokenNameField()
		return s, s.tok.name.Focus()
	case "d", "x":
		return s.confirmRevoke()
	}
	return s, nil
}

func (s Settings) confirmRevoke() (Screen, tea.Cmd) {
	if s.tok.sel >= len(s.tok.items) {
		return s, nil
	}
	item := s.tok.items[s.tok.sel]
	client := s.client
	// 폐기는 되돌릴 수 없고 그 토큰을 쓰던 스크립트가 즉시 끊긴다 — 확인을 받는다.
	prompt := fmt.Sprintf("토큰 [%s]을(를) 폐기합니다. 쓰던 스크립트는 즉시 끊깁니다", item.Name)
	return s, func() tea.Msg {
		return confirmMsg{prompt: prompt, onYes: tokenRevokeCmd(client, item.TokenHash)}
	}
}

func (s Settings) updateTokenNaming(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	switch m.String() {
	case "esc":
		s.tok.naming = false
		return s, nil
	case "tab":
		if s.tok.scope == tokenScopeWrite {
			s.tok.scope = tokenScopeRead
		} else {
			s.tok.scope = tokenScopeWrite
		}
		return s, nil
	case "enter":
		name := strings.TrimSpace(s.tok.name.Value())
		if name == "" {
			s.tok.err = "이름을 적어 주세요 — 나중에 어느 토큰인지 구분하는 유일한 단서입니다"
			return s, nil
		}
		s.tok.err = ""
		s.tok.naming = false
		s.pending = true
		return s, tokenIssueCmd(s.client, name, s.tok.scope)
	}
	var cmd tea.Cmd
	s.tok.name, cmd = s.tok.name.Update(m)
	return s, cmd
}

func (s Settings) updateIssued(m tea.KeyPressMsg) (Screen, tea.Cmd) {
	switch m.String() {
	case "y":
		// OSC 52. 터미널이 거부해도 화면의 평문은 그대로라 손실이 없다.
		token := s.tok.issued
		s.tok.copied = true
		return s, tea.SetClipboard(token)
	case "esc", "enter", "q":
		s.tok.issued = ""
		s.tok.copied = false
		return s, tokensLoadCmd(s.client)
	}
	return s, nil
}

// --- rendering ---

// tokenDay formats an ISO timestamp as MM-DD; "" (JSON null) means never used.
func tokenDay(iso string) string {
	if iso == "" {
		return "미사용"
	}
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return "미사용"
	}
	return t.Format("01-02")
}

func (s Settings) tokensBody(w, h int) string {
	if s.tok.issued != "" {
		return s.issuedBody(w, h)
	}
	if s.tok.naming {
		return s.tokenNamingBody(w, h)
	}

	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	inner := w - 2
	if inner < 1 {
		inner = 1
	}
	lines := []string{
		justify(sectionHeader("ACCESS TOKENS"), dim.Render(fmt.Sprintf("%d개", len(s.tok.items))), inner),
		"",
	}

	switch {
	case s.tok.err != "":
		lines = append(lines, lipgloss.NewStyle().Foreground(theme.Red).Render(s.tok.err))
	case !s.tok.loaded:
		lines = append(lines, dim.Render("불러오는 중…"))
	case len(s.tok.items) == 0:
		lines = append(lines,
			lipgloss.NewStyle().Foreground(theme.Ghost).Render("발급한 토큰이 없습니다."),
			"",
			dim.Width(inner).Render("n 을 눌러 발급하면 MCP·스크립트가 내 데이터를 읽고 씁니다."))
	default:
		for i, it := range s.tok.items {
			lines = append(lines, s.tokenRow(i, it, inner))
		}
	}
	return lipgloss.NewStyle().Width(w).Height(h).Padding(bodyPad(h), 1).Render(strings.Join(lines, "\n"))
}

// tokenRow renders one row, dropping columns rather than wrapping.
//
// 한 행이 접히면 목록이 통째로 못 읽게 된다(w=40에서 실제로 접혔다). 우선순위는
// **이름 > 권한 > 접두사 > 마지막 사용**이다 — 어느 토큰인지와 얼마나 위험한지가
// 먼저고, 접두사는 동명이인을 가릴 때만, 날짜는 있으면 좋은 정보다.
const tokenNameMinWidth = 10

func (s Settings) tokenRow(i int, it api.ApiTokenSummary, w int) string {
	marker, nameColor := "  ", theme.Dim
	if i == s.tok.sel {
		marker = lipgloss.NewStyle().Foreground(theme.Amber).Render("› ")
		nameColor = theme.Fg
	}
	// 쓰기 권한은 눈에 띄어야 한다 — 목록에서 위험한 토큰을 먼저 찾게 된다.
	scopeTone := theme.Cyan
	if it.Scope == tokenScopeWrite {
		scopeTone = theme.Amber
	}
	scope := tokenScopeLabel(it.Scope)

	avail := w - 2 // marker
	extras := []string{"  " + it.TokenPrefix + "…  " + tokenDay(it.LastUsedAt), "  " + tokenDay(it.LastUsedAt), ""}
	chosen := ""
	for _, extra := range extras {
		if avail-lipgloss.Width(scope)-lipgloss.Width(extra)-1 >= tokenNameMinWidth {
			chosen = extra
			break
		}
	}
	tail := lipgloss.NewStyle().Foreground(scopeTone).Render(scope) +
		lipgloss.NewStyle().Foreground(theme.Ghost).Render(chosen)
	nameW := avail - lipgloss.Width(scope) - lipgloss.Width(chosen) - 1
	if nameW < 1 {
		nameW = 1
	}
	name := lipgloss.NewStyle().Foreground(nameColor).Render(truncate(it.Name, min(nameW, 18)))
	return marker + justify(name, tail, avail)
}

func (s Settings) tokenNamingBody(w, h int) string {
	dim := lipgloss.NewStyle().Foreground(theme.Dim)
	inner := w - 2
	if inner < 1 {
		inner = 1
	}
	// 입력 상자를 고정 폭으로 두면 좁은 터미널에서 상자가 접혀 닫는 괄호만 다음
	// 줄로 떨어진다(w=40에서 실제로 그랬다). 남는 자리에 맞춰 줄인다 —
	// 2(마커) + 18(라벨) + 4("[ " " ]") = 24, 거기에 가상 커서가 한 칸을 더 먹는다.
	nameW := inner - 25
	if nameW > 24 {
		nameW = 24
	}
	if nameW < 6 {
		nameW = 6
	}
	s.tok.name.SetWidth(nameW) // 값 복사본이라 렌더에만 반영된다

	scopeCell := func(scope string) string {
		label := tokenScopeLabel(scope)
		if s.tok.scope == scope {
			return lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Render("[" + label + "]")
		}
		return dim.Render(" " + label + " ")
	}
	lines := []string{
		sectionHeader("새 토큰 발급"),
		"",
		s.formField("이름", s.tok.name, true),
		// 라벨 폭은 formField와 같아야 두 줄이 한 폼으로 읽힌다.
		"  " + dim.Width(18).Render("권한") + scopeCell(tokenScopeRead) + " " + scopeCell(tokenScopeWrite),
		"",
		// 손으로 줄을 나누지 않는다 — 폭이 바뀌면 외톨이 조각이 남는다. 줄바꿈은
		// lipgloss에 맡기고, 대신 끊길 자리를 문장에 만들어 둔다.
		dim.Width(inner).Render("쓰기는 세션 기록에만 쓰입니다. 설정 변경·계정 관리·삭제에는 어느 쪽도 쓸 수 없습니다."),
	}
	if s.tok.err != "" {
		lines = append(lines, "", lipgloss.NewStyle().Foreground(theme.Red).Render(s.tok.err))
	}
	return lipgloss.NewStyle().Width(w).Height(h).Padding(bodyPad(h), 1).Render(strings.Join(lines, "\n"))
}

func (s Settings) issuedBody(w, h int) string {
	dim := lipgloss.NewStyle().Foreground(theme.Dim)

	width := w - 2
	if width < 1 {
		width = 1
	}
	copyLine := dim.Width(width).Render("y 를 눌러 클립보드로 복사 (SSH 세션에서도 됩니다)")
	if s.tok.copied {
		copyLine = lipgloss.NewStyle().Foreground(theme.Green).Width(width).Render("클립보드로 복사했습니다")
	}
	lines := []string{
		lipgloss.NewStyle().Foreground(theme.Amber).Bold(true).Width(width).
			Render("발급됨 — 이 화면을 닫으면 다시 볼 수 없습니다"),
		"",
		// 평문은 자르지 않는다. 좁은 터미널에서 접히더라도 잘린 토큰은 쓸모가 없다.
		lipgloss.NewStyle().Foreground(theme.Green).Bold(true).Width(width).Render(s.tok.issued),
		"",
		copyLine,
		dim.Width(width).Render("MCP는 " + tokenEnvVar + " 환경변수로 읽습니다"),
	}
	return lipgloss.NewStyle().Width(w).Height(h).Padding(bodyPad(h), 1).Render(strings.Join(lines, "\n"))
}

func (s Settings) tokenHints() []hintItem {
	if s.tok.issued != "" {
		return []hintItem{{"y", "복사"}, {"esc", "닫기"}}
	}
	if s.tok.naming {
		return []hintItem{{"⏎", "발급"}, {"tab", "권한"}, {"esc", "취소"}}
	}
	if len(s.tok.items) == 0 {
		return []hintItem{{"n", "발급"}, {"esc", "닫기"}}
	}
	return []hintItem{{"jk", "이동"}, {"n", "발급"}, {"d", "폐기"}, {"esc", "닫기"}}
}
