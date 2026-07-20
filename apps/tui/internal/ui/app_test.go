package ui

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func TestAppLogoutReturnsToLogin(t *testing.T) {
	a := App{state: stateFrame, frame: NewFrame(nil, nil), login: NewLogin(nil)}
	next, _ := a.Update(loggedOutMsg{})
	if next.(App).state != stateLogin {
		t.Errorf("expected stateLogin after logout, got %d", next.(App).state)
	}
	if got := next.(App).login.err; got != "" {
		t.Errorf("a deliberate logout must not show an alert, got %q", got)
	}
}

// expiredClient returns a client whose session the backend has already rejected.
func expiredClient(t *testing.T) *api.Client {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"Unauthorized"}`))
	}))
	t.Cleanup(server.Close)
	client, err := api.New(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	client.SetSessionToken("expired-token")
	if _, err := client.Sessions(context.Background()); !api.IsUnauthorized(err) {
		t.Fatalf("Sessions err = %v, want 401", err)
	}
	return client
}

// A buffer load rejected with 401 used to surface as that buffer's own error
// text, leaving the user on a screen that could never load. It must send them
// back to the login gate with the reason.
func TestAppReturnsToLoginWhenSessionExpires(t *testing.T) {
	client := expiredClient(t)
	a := App{state: stateFrame, client: client, frame: NewFrame(client, nil), login: NewLogin(client)}

	next, _ := a.Update(tea.KeyPressMsg{Code: 'j'})
	got := next.(App)
	if got.state != stateLogin {
		t.Fatalf("expected stateLogin after a 401, got %d", got.state)
	}
	if !strings.Contains(got.login.err, "세션이 만료") {
		t.Errorf("login should explain the expiry, got %q", got.login.err)
	}
	if got.user != nil {
		t.Error("expected the user to be cleared")
	}
	if got.client.SessionToken() != "" {
		t.Error("expected the rejected token to be dropped")
	}
}

// ctrl+c is the user's escape hatch; a pending expiry must not swallow it.
func TestAppQuitWinsOverPendingSessionExpiry(t *testing.T) {
	client := expiredClient(t)
	a := App{state: stateFrame, client: client, frame: NewFrame(client, nil), login: NewLogin(client)}

	next, cmd := a.Update(tea.KeyPressMsg{Code: 'c', Mod: tea.ModCtrl})
	if cmd == nil {
		t.Fatal("expected a quit command")
	}
	if _, ok := cmd().(tea.QuitMsg); !ok {
		t.Fatal("expected ctrl+c to quit")
	}
	if next.(App).state != stateFrame {
		t.Errorf("quit should not transition state, got %d", next.(App).state)
	}
}
