package api

import (
	"context"
	"fmt"
	"os"
	"strings"
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

// TestLiveCreateLog proves the A4 write path: signup, save a workout, and read
// back the server-computed result (PR detection). Skipped without the env var.
func TestLiveCreateLog(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live create-log test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-log+%d@example.com", time.Now().UnixNano())
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: "spike-passw0rd", DisplayName: "TUI Log"}); err != nil {
		t.Fatalf("Signup: %v", err)
	}

	id, err := c.CreateLog(ctx, CreateLogRequest{
		PerformedAt: time.Now(),
		Sets: []WorkoutSet{
			{ExerciseName: "Squat", WeightKg: 100, Reps: 5},
			{ExerciseName: "Squat", WeightKg: 102.5, Reps: 5},
		},
	})
	if err != nil {
		t.Fatalf("CreateLog: %v", err)
	}
	if id == "" {
		t.Fatal("created log has no id")
	}
	detail, err := c.GetLog(ctx, id)
	if err != nil {
		t.Fatalf("GetLog: %v", err)
	}
	t.Logf("created log %s, %d PR(s)", id, len(detail.PersonalRecords))
	for _, pr := range detail.PersonalRecords {
		t.Logf("  [PR] %s e1RM=%.1f (+%.1f) top=%.1fkg×%d",
			pr.ExerciseName, float64(pr.EstOneRm), float64(pr.DeltaE1rm), float64(pr.TopWeightKg), pr.TopReps)
	}

	logs, err := c.ListLogs(ctx, ListLogsParams{Limit: 5})
	if err != nil {
		t.Fatalf("ListLogs: %v", err)
	}
	if len(logs) == 0 {
		t.Fatal("expected the created log to appear in the list")
	}
	t.Logf("list shows %d log(s) after create", len(logs))
}

// TestLiveHome verifies the dashboard DTO parses against a real /api/home
// response (nested structs + numeric fields). Skipped without the env var.
func TestLiveHome(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live home test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-home+%d@example.com", time.Now().UnixNano())
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: "spike-passw0rd", DisplayName: "TUI Home"}); err != nil {
		t.Fatalf("Signup: %v", err)
	}
	if _, err := c.CreateLog(ctx, CreateLogRequest{
		PerformedAt: time.Now(),
		Sets: []WorkoutSet{
			{ExerciseName: "Squat", WeightKg: 100, Reps: 5},
			{ExerciseName: "Squat", WeightKg: 102.5, Reps: 5},
		},
	}); err != nil {
		t.Fatalf("CreateLog: %v", err)
	}

	d, err := c.Home(ctx, "")
	if err != nil {
		t.Fatalf("Home: %v", err)
	}
	t.Logf("home: streak=%d sessions=%d weeklyDays=%d volumeTrend=%d strength=%d recent=%d",
		d.QuickStats.CurrentStreak, d.QuickStats.TotalSessions, len(d.WeeklySummary.Days),
		len(d.VolumeTrend), len(d.StrengthProgress), len(d.RecentSessions))
	if d.QuickStats.TotalSessions < 1 {
		t.Errorf("expected at least 1 session, got %d", d.QuickStats.TotalSessions)
	}
	if len(d.WeeklySummary.Days) != 7 {
		t.Errorf("expected 7 weekly days, got %d", len(d.WeeklySummary.Days))
	}
}

// TestLiveStats verifies the stats DTOs (bundle + e1rm) parse against real
// responses. Skipped without the env var.
func TestLiveStats(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live stats test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-stats+%d@example.com", time.Now().UnixNano())
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: "spike-passw0rd", DisplayName: "TUI Stats"}); err != nil {
		t.Fatalf("Signup: %v", err)
	}
	if _, err := c.CreateLog(ctx, CreateLogRequest{
		PerformedAt: time.Now(),
		Sets:        []WorkoutSet{{ExerciseName: "Squat", WeightKg: 100, Reps: 5}, {ExerciseName: "Squat", WeightKg: 102.5, Reps: 5}},
	}); err != nil {
		t.Fatalf("CreateLog: %v", err)
	}

	b, err := c.Bundle(ctx, 90)
	if err != nil {
		t.Fatalf("Bundle: %v", err)
	}
	t.Logf("bundle: sessions30d=%d tonnage30d=%.0f prs=%d", b.Sessions30d, float64(b.Tonnage30d), len(b.Prs90d))
	if len(b.Prs90d) == 0 {
		t.Fatal("expected at least one PR (Squat)")
	}

	lift := b.Prs90d[0].ExerciseName
	e, err := c.E1rm(ctx, lift, 90)
	if err != nil {
		t.Fatalf("E1rm: %v", err)
	}
	t.Logf("e1rm %s: series=%d best=%v", e.Exercise, len(e.Series), e.Best != nil)
	if len(e.Series) == 0 {
		t.Error("expected a non-empty e1rm series")
	}
}

// TestLiveHistory verifies ListLogs parses sets (exerciseName + weightKg) from
// a real response. Skipped without the env var.
func TestLiveHistory(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live history test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-hist+%d@example.com", time.Now().UnixNano())
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: "spike-passw0rd", DisplayName: "TUI Hist"}); err != nil {
		t.Fatalf("Signup: %v", err)
	}
	if _, err := c.CreateLog(ctx, CreateLogRequest{
		PerformedAt: time.Now(),
		Sets:        []WorkoutSet{{ExerciseName: "Squat", WeightKg: 102.5, Reps: 5}},
	}); err != nil {
		t.Fatalf("CreateLog: %v", err)
	}

	logs, err := c.ListLogs(ctx, ListLogsParams{Limit: 20})
	if err != nil {
		t.Fatalf("ListLogs: %v", err)
	}
	if len(logs) == 0 {
		t.Fatal("expected at least one log")
	}
	found := false
	for _, lg := range logs {
		for _, st := range lg.Sets {
			if strings.TrimSpace(st.ExerciseName) != "" && float64(st.WeightKg) > 0 {
				found = true
			}
		}
	}
	if !found {
		t.Error("expected at least one parsed set with exerciseName + weightKg")
	}
	t.Logf("ListLogs: %d log(s), first has %d set(s)", len(logs), len(logs[0].Sets))
}
