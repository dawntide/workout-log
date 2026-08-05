package ui

import (
	"strings"
	"testing"
	"time"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

// hardGateSession freezes a preview whose §9 evidence is fully populated: the
// server verdict plus the last hard start and the 168-hour density it used.
func hardGateSession(id string, startedAt time.Time, gap time.Duration, starts int, allowed bool) api.GeneratedSession {
	session := uiRef5Session(id, startedAt)
	session.Snapshot.Ref5.Decision.Hard.Allowed = allowed
	session.Snapshot.Ref5.Decision.Hard.LastStartAt = stringPtr(startedAt.Add(-gap).UTC().Format(time.RFC3339Nano))
	session.Snapshot.Ref5.Decision.Hard.StartsIn168Hours = starts
	return session
}

func TestRef5PreviewHardGateDerivesTheEvidenceBehindTheVerdict(t *testing.T) {
	startedAt := time.Date(2026, 8, 5, 10, 0, 0, 0, time.UTC)
	session := hardGateSession("gate", startedAt, 36*time.Hour, 1, false)

	gate := ref5PreviewHardGate(&session, "NORMAL")
	if !gate.Present {
		t.Fatal("gate must be present when the snapshot carries a REF5 decision")
	}
	if gate.Allowed {
		t.Error("verdict must be the server's, not a UI recomputation")
	}
	if gate.Elapsed != 36*time.Hour {
		t.Errorf("elapsed = %v, want 36h", gate.Elapsed)
	}
	if gate.ElapsedMet {
		t.Error("36h must not satisfy the 48h rule")
	}
	if gate.Remaining != 12*time.Hour {
		t.Errorf("remaining = %v, want 12h", gate.Remaining)
	}
	if !gate.DensityMet || gate.StartsIn168Hours != 1 {
		t.Errorf("one start in the 168h window is below the cap: %#v", gate)
	}
	if gate.Micro {
		t.Error("NORMAL mode must not read as micro")
	}
}

func TestRef5HardGateBoundaryMatchesTheEngineExactly(t *testing.T) {
	startedAt := time.Date(2026, 8, 5, 10, 0, 0, 0, time.UTC)
	cases := []struct {
		name string
		gap  time.Duration
		want bool
	}{
		{"exactly 48h", 48 * time.Hour, true},
		{"one millisecond short of 48h", 48*time.Hour - time.Millisecond, false},
	}
	for _, tc := range cases {
		session := hardGateSession("boundary", startedAt, tc.gap, 0, tc.want)
		if got := ref5PreviewHardGate(&session, "NORMAL").ElapsedMet; got != tc.want {
			t.Errorf("%s: elapsedMet = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestRef5HardGateHandlesFirstHardDensityCapAndMicro(t *testing.T) {
	startedAt := time.Date(2026, 8, 5, 10, 0, 0, 0, time.UTC)

	first := uiRef5Session("first", startedAt)
	first.Snapshot.Ref5.Decision.Hard.Allowed = true
	first.Snapshot.Ref5.Decision.Hard.LastStartAt = nil
	firstGate := ref5PreviewHardGate(&first, "NORMAL")
	if firstGate.HasLastStart || !firstGate.ElapsedMet || firstGate.HasElapsed {
		t.Errorf("no prior hard start means the elapsed rule is met with no span: %#v", firstGate)
	}

	dense := hardGateSession("dense", startedAt, 96*time.Hour, 2, false)
	denseGate := ref5PreviewHardGate(&dense, "NORMAL")
	if !denseGate.ElapsedMet || denseGate.DensityMet || denseGate.Allowed {
		t.Errorf("two starts in the 168h window must fail the density rule: %#v", denseGate)
	}

	micro := hardGateSession("micro", startedAt, 96*time.Hour, 0, false)
	microGate := ref5PreviewHardGate(&micro, "MICRO")
	if !microGate.Micro || microGate.Allowed {
		t.Errorf("micro sessions stay on V regardless of both rules: %#v", microGate)
	}
}

// gateContentWidth is what Body actually hands the renderer at a 40-column
// terminal: Body pads one column on each side (contentWidth = w - 2).
const gateContentWidth = 38

func TestRef5HardGateLinesStateTheBaselineTimeAndTheRule(t *testing.T) {
	const width = gateContentWidth
	startedAt := time.Date(2026, 8, 5, 10, 0, 0, 0, time.UTC)

	blocked := hardGateSession("blocked", startedAt, 36*time.Hour, 1, false)
	lines := ref5HardGateLines(ref5PreviewHardGate(&blocked, "NORMAL"), time.UTC, width)
	body := ansi.Strip(strings.Join(lines, "\n"))
	for _, want := range []string{
		"직전", "08-03 22:00", "36h00m 전",
		"7일창", "하드 1회 / 2회 미만",
		"기준", "48h까지 12h00m · 168h 2회↓",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("blocked gate missing %q:\n%s", want, body)
		}
	}

	allowed := hardGateSession("allowed", startedAt, 72*time.Hour, 1, true)
	body = ansi.Strip(strings.Join(ref5HardGateLines(ref5PreviewHardGate(&allowed, "NORMAL"), time.UTC, width), "\n"))
	if !strings.Contains(body, "48h↑ & 168h 내 2회↓ → 하드") {
		t.Errorf("allowed gate must still state the rule:\n%s", body)
	}

	micro := hardGateSession("micro-line", startedAt, 72*time.Hour, 0, false)
	body = ansi.Strip(strings.Join(ref5HardGateLines(ref5PreviewHardGate(&micro, "MICRO"), time.UTC, width), "\n"))
	if !strings.Contains(body, "MICRO는 조건 무관") {
		t.Errorf("micro gate must say the rules do not apply:\n%s", body)
	}

	firstEver := uiRef5Session("first-line", startedAt)
	firstEver.Snapshot.Ref5.Decision.Hard.LastStartAt = nil
	body = ansi.Strip(strings.Join(ref5HardGateLines(ref5PreviewHardGate(&firstEver, "NORMAL"), time.UTC, width), "\n"))
	if !strings.Contains(body, "없음 · 최초 하드 H3") {
		t.Errorf("a first-ever hard must be labelled as such:\n%s", body)
	}
}

func TestRef5HardGateLinesFitFortyColumns(t *testing.T) {
	const width = gateContentWidth
	startedAt := time.Date(2026, 8, 5, 10, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name  string
		gap   time.Duration
		mode  string
		count int
	}{
		{"blocked by elapsed", 36 * time.Hour, "NORMAL", 1},
		{"blocked by density", 200 * time.Hour, "NORMAL", 2},
		{"allowed", 72 * time.Hour, "NORMAL", 0},
		{"micro", 36 * time.Hour, "MICRO", 2},
	} {
		session := hardGateSession("fit-"+tc.name, startedAt, tc.gap, tc.count, false)
		for index, line := range ref5HardGateLines(ref5PreviewHardGate(&session, tc.mode), time.UTC, width) {
			if got := lipgloss.Width(ansi.Strip(line)); got > width {
				t.Errorf("%s line %d width %d > %d: %q", tc.name, index+1, got, width, ansi.Strip(line))
			}
		}
	}
}

func TestRef5PreviewBodyKeepsTheGateAboveThePrescriptions(t *testing.T) {
	const width = 40
	startedAt := time.Date(2026, 8, 5, 10, 0, 0, 0, time.UTC)
	plan := uiRef5Plan()
	session := hardGateSession("body", startedAt, 36*time.Hour, 1, false)

	previewLog := func() Log {
		log := NewLog(nil)
		log.load = loadIdle
		log.planID, log.planName = plan.ID, plan.Name
		log.ref5 = newRef5StartState(plan, 82.5, startedAt)
		log.ref5Progress = ref5WindowProgressState{planID: plan.ID, status: ref5WindowStatusFixture()}
		log.ref5.Preview = &session
		log.ref5.PreviewSignature = log.ref5.Start.signature()
		log.ref5.Phase = ref5PreviewReady
		return log
	}

	// Tall enough that nothing is windowed away: the gate must precede the
	// prescriptions so a short terminal clips the sets, never the verdict.
	tall := ansi.Strip(previewLog().Body(width, 32))
	gateAt, squatAt := strings.Index(tall, "직전"), strings.Index(tall, "Back Squat")
	if gateAt < 0 || squatAt < 0 {
		t.Fatalf("preview body missing the gate or the prescriptions:\n%s", tall)
	}
	if gateAt > squatAt {
		t.Errorf("gate evidence must render above the prescriptions:\n%s", tall)
	}

	// The phone minimum still shows the whole gate inside the body window.
	const height = 22
	body := previewLog().Body(width, height)
	stripped := ansi.Strip(body)
	for _, want := range []string{
		"PREVIEW", "직전", "36h00m 전",
		"하드 1회 / 2회 미만",
		// The trailing "↓" proves the rule line survives Body's own padding
		// (contentWidth = w - 2), not just the 40-column outer frame.
		"48h까지 12h00m · 168h 2회↓",
	} {
		if !strings.Contains(stripped, want) {
			t.Fatalf("preview body missing %q at %dx%d:\n%s", want, width, height, stripped)
		}
	}
	assertBodyWidth(t, "preview-gate", body, width)
	assertBodyHeight(t, "preview-gate", body, height)
}
