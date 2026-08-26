package api

import (
	"context"
	"net/url"
)

// 개인 액세스 토큰(PAT).
//
// ⚠️ 이 경로들은 **세션 전용**이다 — PAT로는 토큰을 발급·폐기할 수 없다
// (apps/api `api-token-surface.ts`의 공개 표면에 없다). TUI는 세션으로 인증하므로
// 닿는다. 토큰이 토큰을 낳으면 폐기가 의미를 잃기 때문에 생긴 제약이라, 여기서
// 우회를 시도해서는 안 된다.

// ApiTokenSummary is one issued token. **평문은 요약에 없다** — 서버는 해시만
// 저장하고, 평문은 발급 응답에서 한 번만 나간다.
type ApiTokenSummary struct {
	TokenHash   string `json:"tokenHash"`
	TokenPrefix string `json:"tokenPrefix"`
	Name        string `json:"name"`
	Scope       string `json:"scope"`
	CreatedAt   string `json:"createdAt"`
	// null이 올 수 있다 — 만료 없음 / 미사용. JSON null은 빈 문자열로 남는다.
	ExpiresAt  string `json:"expiresAt"`
	LastUsedAt string `json:"lastUsedAt"`
}

// ApiTokens lists the tokens issued by the current account (newest first).
func (c *Client) ApiTokens(ctx context.Context) ([]ApiTokenSummary, error) {
	var out struct {
		Items []ApiTokenSummary `json:"items"`
	}
	if err := c.do(ctx, "GET", "/api/auth/api-tokens", nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// IssueApiToken mints a token and returns its plaintext.
//
// **평문은 이 반환값이 유일한 사본이다.** 호출자가 버리면 서버에서도 복원할 수
// 없고 재발급뿐이다.
func (c *Client) IssueApiToken(ctx context.Context, name, scope string) (string, *ApiTokenSummary, error) {
	var out struct {
		Token string           `json:"token"`
		Item  *ApiTokenSummary `json:"item"`
	}
	body := map[string]string{"name": name, "scope": scope}
	if err := c.do(ctx, "POST", "/api/auth/api-tokens", body, &out); err != nil {
		return "", nil, err
	}
	return out.Token, out.Item, nil
}

// RevokeApiToken permanently revokes one token. 다음 요청부터 즉시 401이다.
func (c *Client) RevokeApiToken(ctx context.Context, tokenHash string) error {
	return c.do(ctx, "DELETE", "/api/auth/api-tokens/"+url.PathEscape(tokenHash), nil, nil)
}
