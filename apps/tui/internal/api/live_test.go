package api

import (
	"context"
	"encoding/json"
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

// TestLiveExercises verifies the exercise dictionary endpoint parses. Skipped
// without the env var.
func TestLiveExercises(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live exercises test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-ex+%d@example.com", time.Now().UnixNano())
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: "spike-passw0rd"}); err != nil {
		t.Fatalf("Signup: %v", err)
	}
	if _, err := c.CreateLog(ctx, CreateLogRequest{
		PerformedAt: time.Now(),
		Sets:        []WorkoutSet{{ExerciseName: "Squat", WeightKg: 100, Reps: 5}},
	}); err != nil {
		t.Fatalf("CreateLog: %v", err)
	}
	exs, err := c.Exercises(ctx, "")
	if err != nil {
		t.Fatalf("Exercises: %v", err)
	}
	t.Logf("exercises: %d", len(exs))
	if len(exs) == 0 {
		t.Error("expected the dictionary to contain at least the logged exercise")
	}
}

// TestLivePlans verifies the plans list endpoint parses (a fresh account has
// none — this checks the call + decode, not a count). Skipped without env.
func TestLivePlans(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live plans test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-plan+%d@example.com", time.Now().UnixNano())
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: "spike-passw0rd"}); err != nil {
		t.Fatalf("Signup: %v", err)
	}
	plans, err := c.Plans(ctx)
	if err != nil {
		t.Fatalf("Plans: %v", err)
	}
	t.Logf("plans: %d", len(plans))
}

// TestLivePlanFlow verifies templates → create plan → generate session end to
// end (also covers the generate snapshot DTO). Skipped without env.
func TestLivePlanFlow(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live plan-flow test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-pf+%d@example.com", time.Now().UnixNano())
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: "spike-passw0rd"}); err != nil {
		t.Fatalf("Signup: %v", err)
	}

	templates, err := c.Templates(ctx)
	if err != nil {
		t.Fatalf("Templates: %v", err)
	}
	t.Logf("templates: %d", len(templates))
	var tpl *Template
	for i := range templates {
		if templates[i].LatestVersion != nil {
			tpl = &templates[i]
			break
		}
	}
	if tpl == nil {
		t.Skip("no template with a version available to create a plan")
	}

	planType := "SINGLE"
	if tpl.Type == "MANUAL" {
		planType = "MANUAL"
	}
	if err := c.CreatePlan(ctx, CreatePlanRequest{Name: tpl.Name, Type: planType, RootProgramVersionID: tpl.LatestVersion.ID}); err != nil {
		t.Fatalf("CreatePlan: %v", err)
	}
	plans, err := c.Plans(ctx)
	if err != nil {
		t.Fatalf("Plans: %v", err)
	}
	if len(plans) == 0 {
		t.Fatal("expected a plan after create")
	}
	t.Logf("plans after create: %d (%s)", len(plans), plans[0].Name)

	sess, err := c.GenerateSession(ctx, plans[0].ID)
	if err != nil {
		t.Fatalf("GenerateSession: %v", err)
	}
	t.Logf("generated session: %d exercises", len(sess.Snapshot.Exercises))
}

// TestLiveChangePassword proves the password-change round-trip: signup, change
// the password, and confirm the rotated cookie keeps the client authenticated
// while the old password stops working and the new one logs in. Skipped without
// env. Uses a throwaway account, so there is no side effect on real data.
func TestLiveChangePassword(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live change-password test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-pw+%d@example.com", time.Now().UnixNano())
	const oldPw, newPw = "spike-passw0rd", "spike-passw0rd-2"
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: oldPw}); err != nil {
		t.Fatalf("Signup: %v", err)
	}
	oldTok := c.SessionToken()

	if err := c.ChangePassword(ctx, oldPw, newPw); err != nil {
		t.Fatalf("ChangePassword: %v", err)
	}
	// The server revokes all sessions and issues a fresh cookie on this response;
	// the jar must absorb it so the same client stays authenticated.
	if c.SessionToken() == oldTok {
		t.Error("expected the session cookie to rotate after a password change")
	}
	if u, err := c.Me(ctx); err != nil || u == nil {
		t.Fatalf("client lost its session after password change: u=%v err=%v", u, err)
	}
	t.Log("password changed; rotated cookie kept the client authenticated")

	if cBad, _ := New(base); true {
		if _, err := cBad.Login(ctx, email, oldPw); !IsUnauthorized(err) {
			t.Errorf("old password should be rejected, got err=%v", err)
		}
	}
	cNew, _ := New(base)
	if _, err := cNew.Login(ctx, email, newPw); err != nil {
		t.Fatalf("new password should log in: %v", err)
	}
	t.Log("old password rejected, new password accepted")
}

// TestLiveDeleteAccount proves the account-deletion path against a throwaway
// account: a wrong password is rejected (401), the correct one deletes the
// account, and the session is then gone server-side. Skipped without env.
func TestLiveDeleteAccount(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live delete-account test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-del+%d@example.com", time.Now().UnixNano())
	const pw = "spike-passw0rd"
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: pw}); err != nil {
		t.Fatalf("Signup: %v", err)
	}

	if err := c.DeleteAccount(ctx, "wrong-password"); !IsUnauthorized(err) {
		t.Errorf("wrong password should be 401, got %v", err)
	}
	if u, err := c.Me(ctx); err != nil || u == nil {
		t.Fatalf("account should survive a failed delete: u=%v err=%v", u, err)
	}

	if err := c.DeleteAccount(ctx, pw); err != nil {
		t.Fatalf("DeleteAccount: %v", err)
	}
	if u, _ := c.Me(ctx); u != nil {
		t.Errorf("expected no user after deletion, got %s", u.Email)
	}
	cRe, _ := New(base)
	if _, err := cRe.Login(ctx, email, pw); err == nil {
		t.Error("deleted credentials should no longer log in")
	}
	t.Log("account deleted: session gone and credentials rejected")
}

func countSessions(sess []Session) (active, other int) {
	for _, s := range sess {
		if s.IsExpired {
			continue
		}
		active++
		if !s.IsCurrent {
			other++
		}
	}
	return active, other
}

// TestLiveSessions proves the session list + revoke-others path: a fresh account
// has one session, a second login makes two, and revoke-others leaves one while
// logging the other client out. Skipped without env.
func TestLiveSessions(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live sessions test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-sess+%d@example.com", time.Now().UnixNano())
	const pw = "spike-passw0rd"
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: pw}); err != nil {
		t.Fatalf("Signup: %v", err)
	}

	sess, err := c.Sessions(ctx)
	if err != nil {
		t.Fatalf("Sessions: %v", err)
	}
	if a, o := countSessions(sess); a != 1 || o != 0 {
		t.Fatalf("after signup want active=1 other=0, got active=%d other=%d", a, o)
	}

	c2, _ := New(base)
	if _, err := c2.Login(ctx, email, pw); err != nil {
		t.Fatalf("second Login: %v", err)
	}
	sess, _ = c.Sessions(ctx)
	if a, o := countSessions(sess); a != 2 || o != 1 {
		t.Fatalf("with two sessions want active=2 other=1, got active=%d other=%d", a, o)
	}

	n, err := c.RevokeOtherSessions(ctx)
	if err != nil {
		t.Fatalf("RevokeOtherSessions: %v", err)
	}
	if n != 1 {
		t.Errorf("want 1 revoked, got %d", n)
	}
	sess, _ = c.Sessions(ctx)
	if a, o := countSessions(sess); a != 1 || o != 0 {
		t.Errorf("after revoke want active=1 other=0, got active=%d other=%d", a, o)
	}
	if u, _ := c2.Me(ctx); u != nil {
		t.Error("the revoked client should be unauthenticated")
	}
	t.Log("sessions 1→2, revoke-others→1, revoked client logged out")
}

// TestLiveResendVerification proves the verification-resend call against a fresh
// (unverified) account: it must report alreadyVerified=false. Skipped without
// env. (Email delivery itself is best-effort and not asserted here.)
func TestLiveResendVerification(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live resend-verification test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-verif+%d@example.com", time.Now().UnixNano())
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: "spike-passw0rd"}); err != nil {
		t.Fatalf("Signup: %v", err)
	}
	already, err := c.ResendEmailVerification(ctx)
	if err != nil {
		t.Fatalf("ResendEmailVerification: %v", err)
	}
	if already {
		t.Error("a fresh account should not be already-verified")
	}
	t.Logf("verification resend ok (alreadyVerified=%v)", already)
}

// TestLiveEditLog proves the past-session edit path: create a log, PATCH it with
// a heavier/extra set while preserving the original date, and read it back.
// Skipped without env.
func TestLiveEditLog(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live edit-log test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-edit+%d@example.com", time.Now().UnixNano())
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: "spike-passw0rd"}); err != nil {
		t.Fatalf("Signup: %v", err)
	}

	performedAt := time.Now().Add(-72 * time.Hour)
	id, err := c.CreateLog(ctx, CreateLogRequest{
		PerformedAt: performedAt,
		Sets:        []WorkoutSet{{ExerciseName: "Squat", WeightKg: 100, Reps: 5}},
	})
	if err != nil {
		t.Fatalf("CreateLog: %v", err)
	}

	if err := c.UpdateLog(ctx, id, CreateLogRequest{
		PerformedAt: performedAt,
		Sets: []WorkoutSet{
			{ExerciseName: "Squat", WeightKg: 105, Reps: 5},
			{ExerciseName: "Squat", WeightKg: 107.5, Reps: 3},
		},
	}); err != nil {
		t.Fatalf("UpdateLog: %v", err)
	}

	logs, err := c.ListLogs(ctx, ListLogsParams{Limit: 10})
	if err != nil {
		t.Fatalf("ListLogs: %v", err)
	}
	var edited *LogItem
	for i := range logs {
		if logs[i].ID == id {
			edited = &logs[i]
			break
		}
	}
	if edited == nil {
		t.Fatalf("edited log %s not found in list", id)
	}
	if len(edited.Sets) != 2 {
		t.Errorf("after edit want 2 sets, got %d", len(edited.Sets))
	}
	topW := 0.0
	for _, s := range edited.Sets {
		if float64(s.WeightKg) > topW {
			topW = float64(s.WeightKg)
		}
	}
	if topW != 107.5 {
		t.Errorf("after edit want top weight 107.5, got %v", topW)
	}
	if got := edited.PerformedAt.Format("2006-01-02"); got != performedAt.Format("2006-01-02") {
		t.Errorf("performedAt changed on edit: got %s, want %s", got, performedAt.Format("2006-01-02"))
	}
	t.Logf("edit ok: 1→2 sets, top 100→107.5, date %s preserved", edited.PerformedAt.Format("2006-01-02"))
}

// TestLiveSettings verifies settings GET + PATCH round-trip. Skipped without env.
func TestLiveSettings(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL to run the live settings test")
	}
	ctx := context.Background()
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("tui-set+%d@example.com", time.Now().UnixNano())
	if _, err := c.Signup(ctx, SignupRequest{Email: email, Password: "spike-passw0rd"}); err != nil {
		t.Fatalf("Signup: %v", err)
	}
	vals, err := c.Settings(ctx)
	if err != nil {
		t.Fatalf("Settings: %v", err)
	}
	t.Logf("settings keys: %d", len(vals))

	if err := c.SetSetting(ctx, "prefs.locale", "en"); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}
	vals2, err := c.Settings(ctx)
	if err != nil {
		t.Fatalf("Settings(2): %v", err)
	}
	var loc string
	_ = json.Unmarshal(vals2["prefs.locale"], &loc)
	if loc != "en" {
		t.Errorf("after PATCH, prefs.locale = %q, want en", loc)
	}
}
