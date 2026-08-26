package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// 서버가 실제로 주는 모양 그대로다(core `toSummary` + apps/api `routes/auth.ts`).
// expiresAt·lastUsedAt은 **null이 온다** — 문자열 필드로 받으므로 조용히 빈 값이
// 되어야 하고, 디코드 에러가 나서는 안 된다.
const tokenListPayload = `{"items":[
  {"tokenHash":"h1","tokenPrefix":"wlpat_a1b2c3","name":"MCP","scope":"read_write",
   "createdAt":"2026-08-20T00:00:00.000Z","expiresAt":null,"lastUsedAt":"2026-08-24T09:00:00.000Z"},
  {"tokenHash":"h2","tokenPrefix":"wlpat_d4e5f6","name":"백업","scope":"read",
   "createdAt":"2026-08-10T00:00:00.000Z","expiresAt":null,"lastUsedAt":null}
]}`

func TestApiTokensDecodesServerShape(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/api-tokens", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(tokenListPayload))
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}

	items, err := client.ApiTokens(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("토큰 %d개", len(items))
	}
	if items[0].Name != "MCP" || items[0].Scope != "read_write" || items[0].TokenPrefix != "wlpat_a1b2c3" {
		t.Fatalf("첫 토큰이 어긋난다: %+v", items[0])
	}
	if items[0].LastUsedAt != "2026-08-24T09:00:00.000Z" {
		t.Fatalf("lastUsedAt이 어긋난다: %q", items[0].LastUsedAt)
	}
	// null은 빈 문자열로 남아야 한다 — UI가 이 값을 보고 "미사용"을 표시한다.
	if items[1].LastUsedAt != "" || items[1].ExpiresAt != "" {
		t.Fatalf("null이 빈 값이 아니다: %+v", items[1])
	}
}

// 평문은 발급 응답 최상위 `token`에 온다 — `item` 안이 아니다.
func TestIssueApiTokenReadsPlaintextFromTopLevel(t *testing.T) {
	var sent map[string]string
	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/api-tokens", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &sent)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"token":"wlpat_plaintext","item":{"tokenHash":"h9",` +
			`"tokenPrefix":"wlpat_plaint","name":"MCP","scope":"read","createdAt":"2026-08-26T00:00:00.000Z",` +
			`"expiresAt":null,"lastUsedAt":null}}`))
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}

	token, item, err := client.IssueApiToken(context.Background(), "MCP", "read")
	if err != nil {
		t.Fatal(err)
	}
	if token != "wlpat_plaintext" {
		t.Fatalf("평문이 %q — 최상위 token을 읽어야 한다", token)
	}
	if item == nil || item.TokenHash != "h9" {
		t.Fatalf("요약이 어긋난다: %+v", item)
	}
	if sent["name"] != "MCP" || sent["scope"] != "read" {
		t.Fatalf("요청 본문이 어긋난다: %+v", sent)
	}
}

// 해시가 경로 세그먼트로 들어가므로 이스케이프돼야 한다.
func TestRevokeApiTokenEscapesHash(t *testing.T) {
	var gotPath string
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}

	if err := client.RevokeApiToken(context.Background(), "a/b c"); err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/auth/api-tokens/a%2Fb%20c" {
		t.Fatalf("경로가 %q — 해시를 이스케이프해야 한다", gotPath)
	}
}
