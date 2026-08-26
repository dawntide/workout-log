package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func tokenPanelWith(items ...api.ApiTokenSummary) Settings {
	s := NewSettings(nil)
	s.loaded = true
	s.form = formTokens
	s.tok = tokenPanel{loaded: true, items: items}
	return s
}

func sampleTokens() []api.ApiTokenSummary {
	return []api.ApiTokenSummary{
		{TokenHash: "h1", TokenPrefix: "wlpat_a1b2c3", Name: "MCP 데스크톱",
			Scope: "read_write", CreatedAt: "2026-08-20T00:00:00Z", LastUsedAt: "2026-08-24T09:00:00Z"},
		{TokenHash: "h2", TokenPrefix: "wlpat_d4e5f6", Name: "백업 스크립트",
			Scope: "read", CreatedAt: "2026-08-10T00:00:00Z"},
	}
}

// 액세스 토큰 행이 ACCOUNT 섹션에 있고, ⏎가 패널을 열면서 목록을 부른다.
func TestSettingsAccountHasTokensRow(t *testing.T) {
	s := NewSettings(nil)
	s.loaded = true
	if !strings.Contains(plain(s.Body(60, 24)), "액세스 토큰") {
		t.Fatalf("ACCOUNT 섹션에 액세스 토큰 행이 없다:\n%s", plain(s.Body(60, 24)))
	}
	s.sel = len(settingDefs) + actTokens
	next, cmd := s.triggerAccount()
	if next.(Settings).form != formTokens {
		t.Fatal("⏎가 토큰 패널을 열지 않았다")
	}
	if cmd == nil {
		t.Fatal("패널을 열면서 목록을 부르지 않았다")
	}
}

// 액세스 토큰 행의 컨텍스트가 "계정 삭제"로 새면 안 된다 — accountIdx의 default가
// 계정 삭제라 새 행을 추가할 때마다 조용히 잘못 붙는다.
func TestSettingsTokensRowContextIsNotDelete(t *testing.T) {
	s := NewSettings(nil)
	s.loaded = true
	s.sel = len(settingDefs) + actTokens
	if got := s.Context(); got != "액세스 토큰" {
		t.Fatalf("컨텍스트가 %q — 행마다 제 이름을 불러야 한다", got)
	}
}

// 목록 탐색은 타이핑이 아니다. INSERT로 두면 상태 표시가 거짓말이 된다.
func TestTokenPanelBrowsingIsNotInsertMode(t *testing.T) {
	s := tokenPanelWith(sampleTokens()...)
	if got := s.Mode().Label; got != "TOKENS" {
		t.Fatalf("목록 탐색 모드가 %q", got)
	}
	s.tok.naming = true
	if got := s.Mode().Label; got != "INSERT" {
		t.Fatalf("이름 입력 중 모드가 %q", got)
	}
	s.tok.naming, s.tok.issued = false, "wlpat_secret"
	if got := s.Mode().Label; got != "ISSUED" {
		t.Fatalf("평문 표시 중 모드가 %q", got)
	}
}

func TestTokenListRendersScopeAndUsage(t *testing.T) {
	out := plain(tokenPanelWith(sampleTokens()...).Body(70, 20))
	for _, want := range []string{
		"ACCESS TOKENS", "2개",
		"MCP 데스크톱", "읽기+쓰기", "wlpat_a1b2c3", "08-24",
		"백업 스크립트", "미사용", // lastUsedAt이 null이면 "미사용"이다 — 0001-01-01이 아니다
	} {
		if !strings.Contains(out, want) {
			t.Errorf("목록에 %q가 없다:\n%s", want, out)
		}
	}
}

func TestTokenEmptyStateExplainsPurpose(t *testing.T) {
	out := plain(tokenPanelWith().Body(70, 20))
	if !strings.Contains(out, "발급한 토큰이 없습니다") {
		t.Fatalf("빈 상태가 없다:\n%s", out)
	}
	if !strings.Contains(out, "MCP") {
		t.Fatalf("무엇에 쓰는 토큰인지 안 밝힌다:\n%s", out)
	}
}

// 평문은 이 화면에서만 볼 수 있으므로, 화면이 그 사실과 복사법을 밝혀야 한다.
func TestIssuedTokenScreenWarnsAndOffersCopy(t *testing.T) {
	s := tokenPanelWith()
	s.tok.issued = "wlpat_0123456789abcdef"
	out := plain(s.Body(70, 20))
	for _, want := range []string{
		"wlpat_0123456789abcdef", // 평문은 잘리지 않는다
		"다시 볼 수 없습니다",
		"y ",
		"WORKOUT_LOG_TOKEN", // 붙여 넣을 곳을 알려 준다
	} {
		if !strings.Contains(out, want) {
			t.Errorf("발급 화면에 %q가 없다:\n%s", want, out)
		}
	}
}

func TestIssuedTokenCopyMarksCopied(t *testing.T) {
	s := tokenPanelWith()
	s.tok.issued = "wlpat_xyz"
	next, cmd := s.updateTokens(keyRune('y'))
	if cmd == nil {
		t.Fatal("y가 클립보드 명령을 내지 않았다")
	}
	s2 := next.(Settings)
	if !s2.tok.copied {
		t.Fatal("복사 표시가 안 됐다")
	}
	if s2.tok.issued != "wlpat_xyz" {
		t.Fatal("복사가 평문을 지웠다 — 터미널이 OSC 52를 거부하면 되돌릴 길이 없어진다")
	}
	if !strings.Contains(plain(s2.Body(70, 20)), "복사했습니다") {
		t.Fatal("복사 결과가 화면에 안 보인다")
	}
}

// **가장 비싼 사고**: 평문이 떠 있는데 목록 키가 먹으면 한 번뿐인 평문이 날아간다.
func TestIssuedTokenSwallowsListKeys(t *testing.T) {
	base := tokenPanelWith(sampleTokens()...)
	base.tok.issued = "wlpat_xyz"
	for _, r := range []rune{'j', 'k', 'n', 'd', 'x'} {
		next, _ := base.updateTokens(keyRune(r))
		s := next.(Settings)
		if s.tok.issued == "" {
			t.Fatalf("%q가 평문을 날렸다", string(r))
		}
		if s.tok.naming {
			t.Fatalf("%q가 발급 폼을 열었다", string(r))
		}
		if s.tok.sel != 0 {
			t.Fatalf("%q가 선택을 움직였다", string(r))
		}
	}
}

func TestIssuedTokenDismissClearsPlaintextAndReloads(t *testing.T) {
	s := tokenPanelWith(sampleTokens()...)
	s.tok.issued, s.tok.copied = "wlpat_xyz", true
	next, cmd := s.updateTokens(tea.KeyPressMsg{Code: tea.KeyEscape})
	s2 := next.(Settings)
	if s2.tok.issued != "" || s2.tok.copied {
		t.Fatal("닫아도 평문이 남았다")
	}
	if s2.form != formTokens {
		t.Fatal("평문만 닫아야 하는데 패널까지 닫혔다")
	}
	if cmd == nil {
		t.Fatal("발급 후 목록을 다시 부르지 않았다 — 새 토큰이 목록에 없다")
	}
}

func TestTokenNamingRejectsEmptyNameWithReason(t *testing.T) {
	s := tokenPanelWith()
	s.tok.naming, s.tok.name = true, newTokenNameField()
	next, cmd := s.updateTokens(tea.KeyPressMsg{Code: tea.KeyEnter})
	s2 := next.(Settings)
	if cmd != nil {
		t.Fatal("이름 없이 발급을 보냈다")
	}
	if !strings.Contains(s2.tok.err, "구분") {
		t.Fatalf("왜 이름이 필요한지 안 밝힌다: %q", s2.tok.err)
	}
}

func TestTokenNamingTogglesScope(t *testing.T) {
	s := tokenPanelWith()
	s.tok.naming, s.tok.scope, s.tok.name = true, tokenScopeRead, newTokenNameField()
	next, _ := s.updateTokens(tea.KeyPressMsg{Code: tea.KeyTab})
	s2 := next.(Settings)
	if s2.tok.scope != tokenScopeWrite {
		t.Fatalf("tab이 권한을 안 바꿨다: %q", s2.tok.scope)
	}
	out := plain(s2.Body(70, 20))
	if !strings.Contains(out, "[읽기+쓰기]") {
		t.Fatalf("고른 권한이 표시되지 않는다:\n%s", out)
	}
	if !strings.Contains(out, "설정 변경") {
		t.Fatalf("권한의 한계를 안 밝힌다:\n%s", out)
	}
}

// 폐기는 되돌릴 수 없고 쓰던 스크립트가 즉시 끊긴다 — 바로 지우면 안 된다.
func TestTokenRevokeAsksForConfirmation(t *testing.T) {
	s := tokenPanelWith(sampleTokens()...)
	_, cmd := s.updateTokens(keyRune('d'))
	if cmd == nil {
		t.Fatal("d가 아무것도 안 했다")
	}
	msg, ok := cmd().(confirmMsg)
	if !ok {
		t.Fatalf("확인 없이 폐기했다: %T", cmd())
	}
	if !strings.Contains(msg.prompt, "MCP 데스크톱") {
		t.Fatalf("어느 토큰인지 안 밝힌다: %q", msg.prompt)
	}
	if !strings.Contains(msg.prompt, "끊깁니다") {
		t.Fatalf("결과를 안 밝힌다: %q", msg.prompt)
	}
}

func TestTokenRevokeOnEmptyListIsNoop(t *testing.T) {
	s := tokenPanelWith()
	if _, cmd := s.updateTokens(keyRune('d')); cmd != nil {
		t.Fatal("빈 목록에서 폐기를 시도했다")
	}
}

func TestTokenPanelEscClosesToSettings(t *testing.T) {
	s := tokenPanelWith(sampleTokens()...)
	next, _ := s.updateTokens(tea.KeyPressMsg{Code: tea.KeyEscape})
	if next.(Settings).form != formNone {
		t.Fatal("esc가 패널을 안 닫았다")
	}
}

// 패널이 열려 있는 동안은 버퍼가 키를 독점해야 한다 — 그러지 않으면 n·d가 전역
// 단축키로 새어 다른 버퍼로 점프한다.
func TestTokenPanelOwnsKeys(t *testing.T) {
	if !tokenPanelWith(sampleTokens()...).Editing() {
		t.Fatal("패널이 열렸는데 키를 프레임에 넘긴다")
	}
}

func TestTokenPanelFitsWidth(t *testing.T) {
	s := tokenPanelWith(sampleTokens()...)
	for _, w := range []int{40, 60, 100} {
		for _, line := range strings.Split(plain(s.Body(w, 20)), "\n") {
			if n := len([]rune(line)); n > w {
				t.Fatalf("폭 %d에서 %d칸 줄: %q", w, n, line)
			}
		}
	}
}

// 폭 테스트만으로는 부족했다 — lipgloss는 넘치는 대신 **접기** 때문에 줄 길이는
// 통과하면서 행이 두 줄로 쪼개졌다(w=40에서 실제 발생). 이름과 권한이 같은 줄에
// 있어야 목록이 목록으로 읽힌다.
func TestTokenRowNeverWraps(t *testing.T) {
	s := tokenPanelWith(sampleTokens()...)
	for _, w := range []int{34, 40, 48, 62, 100} {
		out := plain(s.Body(w, 20))
		for _, it := range sampleTokens() {
			found := false
			for _, line := range strings.Split(out, "\n") {
				if strings.Contains(line, it.Name) {
					found = true
					if !strings.Contains(line, tokenScopeLabel(it.Scope)) {
						t.Fatalf("폭 %d: %q 행이 접혔다(권한이 다른 줄):\n%s", w, it.Name, out)
					}
				}
			}
			if !found {
				t.Fatalf("폭 %d: %q 이름이 통째로 사라졌다:\n%s", w, it.Name, out)
			}
		}
	}
}

// 좁아지면 접두사부터 버린다 — 이름과 권한은 마지막까지 남는다.
func TestTokenRowDropsPrefixBeforeName(t *testing.T) {
	s := tokenPanelWith(sampleTokens()...)
	wide := plain(s.Body(70, 20))
	if !strings.Contains(wide, "wlpat_a1b2c3") {
		t.Fatalf("넓은 폭에서 접두사가 없다:\n%s", wide)
	}
	narrow := plain(s.Body(40, 20))
	if strings.Contains(narrow, "wlpat_a1b2c3") {
		t.Fatalf("좁은 폭에서 접두사를 안 버렸다:\n%s", narrow)
	}
	if !strings.Contains(narrow, "MCP 데스크톱") || !strings.Contains(narrow, "읽기+쓰기") {
		t.Fatalf("이름·권한이 먼저 사라졌다:\n%s", narrow)
	}
}

// 설명 문구를 손으로 줄바꿈하면 폭이 바뀔 때 외톨이 조각이 남는다(w=62에서 "관리·").
func TestTokenProseHasNoOrphanFragment(t *testing.T) {
	s := tokenPanelWith()
	s.tok.naming, s.tok.scope, s.tok.name = true, tokenScopeRead, newTokenNameField()
	for _, w := range []int{40, 50, 62, 80} {
		for _, line := range strings.Split(plain(s.Body(w, 20)), "\n") {
			if trimmed := strings.TrimSpace(line); trimmed != "" && len([]rune(trimmed)) < 4 {
				t.Fatalf("폭 %d에 외톨이 조각 %q", w, trimmed)
			}
		}
	}
}
