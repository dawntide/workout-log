package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestChangePasswordAdoptsCookieOnlyRotation(t *testing.T) {
	var nextAuthorization string
	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/password", func(w http.ResponseWriter, _ *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: SessionCookieName, Value: "rotated-cookie", Path: "/"})
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	})
	mux.HandleFunc("/api/auth/me", func(w http.ResponseWriter, r *http.Request) {
		nextAuthorization = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"user":null}`))
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	client.SetSessionToken("revoked-old-token")
	if err := client.ChangePassword(context.Background(), "old-password", "new-password"); err != nil {
		t.Fatal(err)
	}
	if got := client.SessionToken(); got != "rotated-cookie" {
		t.Fatalf("SessionToken = %q, want rotated cookie", got)
	}
	if _, err := client.Me(context.Background()); err != nil {
		t.Fatal(err)
	}
	if nextAuthorization != "Bearer rotated-cookie" {
		t.Fatalf("next Authorization = %q", nextAuthorization)
	}
}

func TestDeleteAccountWaitsForEveryInFlightClientRequest(t *testing.T) {
	requestStarted := make(chan struct{})
	releaseRequest := make(chan struct{})
	deleteStarted := make(chan struct{})
	mux := http.NewServeMux()
	mux.HandleFunc("/slow-write", func(w http.ResponseWriter, _ *http.Request) {
		close(requestStarted)
		<-releaseRequest
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/api/auth/account", func(w http.ResponseWriter, _ *http.Request) {
		close(deleteStarted)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}

	requestDone := make(chan error, 1)
	go func() {
		requestDone <- client.do(context.Background(), http.MethodPost, "/slow-write", map[string]bool{"write": true}, nil)
	}()
	<-requestStarted
	deleteCallLaunched := make(chan struct{})
	deleteDone := make(chan error, 1)
	go func() {
		close(deleteCallLaunched)
		deleteDone <- client.DeleteAccount(context.Background(), "password")
	}()
	<-deleteCallLaunched
	select {
	case <-deleteStarted:
		t.Fatal("account deletion reached the server before the in-flight request completed")
	case <-time.After(50 * time.Millisecond):
	}

	close(releaseRequest)
	if err := <-requestDone; err != nil {
		t.Fatal(err)
	}
	select {
	case <-deleteStarted:
	case <-time.After(time.Second):
		t.Fatal("account deletion did not start after the in-flight request completed")
	}
	if err := <-deleteDone; err != nil {
		t.Fatal(err)
	}
}
