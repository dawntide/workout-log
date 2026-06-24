package api

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

// TestLiveAuthSpike proves the cookie-only auth path works for a non-browser
// client. It is skipped unless IRONLOG_SPIKE_URL points at a running backend
// with the WORKOUT_AUTH_USER_ID dev fallback DISABLED.
//
//	IRONLOG_SPIKE_URL=http://localhost:3000 go test -run TestLiveAuthSpike -v ./internal/api
func TestLiveAuthSpike(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live auth spike")
	}
	ctx := context.Background()

	// 1) No cookie → Me() must be nil. If it returns a user, the env fallback
	//    is still on and the spike cannot prove anything.
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	if u, err := c.Me(ctx); err != nil {
		t.Fatalf("Me() before login: %v", err)
	} else if u != nil {
		t.Fatalf("expected no user before login — is WORKOUT_AUTH_USER_ID fallback off? got email=%s fallback=%v", u.Email, u.Fallback)
	}
	t.Log("pre-login Me() == nil (fallback confirmed OFF)")

	// 2) Signup a throwaway account (also opens a session).
	email := fmt.Sprintf("tui-spike+%d@example.com", time.Now().UnixNano())
	const pw = "spike-passw0rd"
	su, err := c.Signup(ctx, SignupRequest{Email: email, Password: pw, DisplayName: "TUI Spike"})
	if err != nil {
		t.Fatalf("Signup: %v", err)
	}
	tok := c.SessionToken()
	if tok == "" {
		t.Fatal("no wl_session cookie captured after signup")
	}
	t.Logf("signup ok: %s (id=%s), captured wl_session (len=%d)", su.Email, su.ID, len(tok))

	// 3) Authenticated read must succeed (empty list is fine).
	logs, err := c.ListLogs(ctx, ListLogsParams{Limit: 5})
	if err != nil {
		t.Fatalf("ListLogs after signup: %v", err)
	}
	t.Logf("authenticated GET /api/logs ok (%d items)", len(logs))

	// 4) THE PROOF — a brand-new client carrying ONLY the token authenticates.
	//    With the fallback off, this can only succeed via the cookie session.
	c2, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	c2.SetSessionToken(tok)
	u2, err := c2.Me(ctx)
	if err != nil {
		t.Fatalf("Me() on token-only client: %v", err)
	}
	if u2 == nil {
		t.Fatal("token-only client unauthenticated — cookie path FAILED")
	}
	if u2.Email != email {
		t.Fatalf("identity mismatch: %s != %s", u2.Email, email)
	}
	if u2.Fallback {
		t.Fatal("authenticated via fallback, not cookie")
	}
	t.Logf("PROOF: token-only client authenticated as %s (fallback=%v)", u2.Email, u2.Fallback)

	// 5) Fresh Login() with the same creds also sets a session.
	c3, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	li, err := c3.Login(ctx, email, pw)
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if li.Email != email || c3.SessionToken() == "" {
		t.Fatalf("login did not establish a session: email=%s tokenSet=%v", li.Email, c3.SessionToken() != "")
	}
	t.Logf("login ok as %s", li.Email)
}
