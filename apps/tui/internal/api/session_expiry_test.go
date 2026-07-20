package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// unauthorizedServer answers every request with 401.
func unauthorizedServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"Unauthorized"}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func TestUnauthorizedDataRequestFlagsSessionExpiry(t *testing.T) {
	server := unauthorizedServer(t)
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	client.SetSessionToken("expired-token")

	if _, err := client.Sessions(context.Background()); !IsUnauthorized(err) {
		t.Fatalf("Sessions err = %v, want 401", err)
	}
	if !client.ConsumeSessionExpired() {
		t.Fatal("expected the 401 to flag the session as expired")
	}
	if client.ConsumeSessionExpired() {
		t.Fatal("expected the flag to be cleared once consumed")
	}
}

// A wrong password is also a 401, but it must keep the user on the settings
// screen instead of tearing down their session.
func TestUnauthorizedCredentialCheckDoesNotFlagSessionExpiry(t *testing.T) {
	server := unauthorizedServer(t)
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	client.SetSessionToken("valid-token")

	if err := client.ChangePassword(context.Background(), "wrong", "new-password"); !IsUnauthorized(err) {
		t.Fatalf("ChangePassword err = %v, want 401", err)
	}
	if err := client.DeleteAccount(context.Background(), "wrong"); !IsUnauthorized(err) {
		t.Fatalf("DeleteAccount err = %v, want 401", err)
	}
	if _, err := client.Login(context.Background(), "a@b.c", "wrong"); !IsUnauthorized(err) {
		t.Fatalf("Login err = %v, want 401", err)
	}
	if client.ConsumeSessionExpired() {
		t.Fatal("a rejected password must not be reported as a session expiry")
	}
}

// Without a session there is nothing to expire — the login gate is already the
// right place, and flagging here would fire on the very first startup check.
func TestUnauthorizedWithoutSessionDoesNotFlagExpiry(t *testing.T) {
	server := unauthorizedServer(t)
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := client.Sessions(context.Background()); !IsUnauthorized(err) {
		t.Fatalf("Sessions err = %v, want 401", err)
	}
	if client.ConsumeSessionExpired() {
		t.Fatal("expected no expiry flag for an unauthenticated client")
	}
}

func TestSetSessionTokenClearsStaleExpiryFlag(t *testing.T) {
	server := unauthorizedServer(t)
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	client.SetSessionToken("expired-token")
	if _, err := client.Sessions(context.Background()); !IsUnauthorized(err) {
		t.Fatalf("Sessions err = %v, want 401", err)
	}

	client.SetSessionToken("fresh-token")
	if client.ConsumeSessionExpired() {
		t.Fatal("a fresh token must clear the earlier rejection")
	}
}
