package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLogWritesRejectSuccessfulResponseWithoutCanonicalID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(server.Close)
	client, err := New(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	request := CreateLogRequest{Sets: []WorkoutSet{{ExerciseName: "Squat", Reps: 5}}}
	if _, _, err := client.CreateLog(context.Background(), request); err == nil {
		t.Fatal("CreateLog accepted a 2xx response without log.id")
	}
	if _, err := client.UpdateLog(context.Background(), "log-1", request); err == nil {
		t.Fatal("UpdateLog accepted a 2xx response without matching log.id")
	}
}
