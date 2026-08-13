package ui

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/x/ansi"
)

// ref5JudgmentFeedback is the server-assembled REF5 window judgment exactly as
// core's feedback-catalog emits it. Kept as literal wire JSON (not a Go struct)
// so a field rename on either side breaks this test instead of silently
// blanking the card — the whole point of the card is that the user cannot miss
// a judgment, and a nil decode looks identical to "no judgment happened".
func ref5JudgmentFeedback() map[string]any {
	return map[string]any{
		"report": map[string]any{
			"eventId": "evt-ref5",
			"title":   "REF5 창 판정",
			"rows": []any{
				map[string]any{
					"target": "SQ:INCREASE",
					"text":   "SQ 하드 — 판정창 클리어 → 기준 증량 100 → 102.5 kg (+2.5) · 다음 세션부터 적용",
				},
				map[string]any{
					"target": "BP:MAINTAIN",
					"text":   "BP 집중 — 판정창 완료 → 기준 유지 (62.5 kg)",
				},
			},
		},
		"earlyDeloadBanner": nil,
	}
}

// A closed judgment window (SQ 6/6) must announce itself at the moment of
// saving. The copy comes from the server so web and TUI never drift.
func TestRef5SaveShowsWindowJudgmentCard(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("save method = %s", r.Method)
		}
		writeUITestJSON(t, w, map[string]any{
			"log":         map[string]any{"id": "ref5-log"},
			"progression": map[string]any{"feedback": ref5JudgmentFeedback()},
		})
	})
	mux.HandleFunc("/api/logs/ref5-log", func(w http.ResponseWriter, _ *http.Request) {
		writeUITestJSON(t, w, map[string]any{"item": map[string]any{
			"id": "ref5-log", "performedAt": time.Now(), "sets": []any{},
		}})
	})

	l := loadRef5Fixture(t)
	fillRef5Fixture(&l)
	req, err := buildRef5SaveRequest(l)
	if err != nil {
		t.Fatalf("buildRef5SaveRequest: %v", err)
	}

	msg, ok := saveRef5Cmd(newUITestClient(t, mux), req, "")().(saveResultMsg)
	if !ok || msg.err != nil {
		t.Fatalf("save result = %#v", msg)
	}
	if msg.feedback == nil || msg.feedback.Report == nil || len(msg.feedback.Report.Rows) != 2 {
		t.Fatalf("REF5 save response dropped the judgment card: %#v", msg.feedback)
	}

	screen, _ := l.Update(msg)
	body := ansi.Strip(screen.(Log).Body(80, 32))
	for _, want := range []string{
		"REF5 창 판정",
		"SQ 하드 — 판정창 클리어",
		"BP 집중 — 판정창 완료",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("saved REF5 body missing judgment %q:\n%s", want, body)
		}
	}
}

// Saving and then closing the terminal must not lose the judgment: the same
// card rides the progression-state response, so re-entering the buffer shows
// it again. It disappears on its own once the next session's START event
// becomes the plan's latest (the server then reports report=null).
func TestRef5WindowStatusRestoresJudgmentCardOnReentry(t *testing.T) {
	client := newUITestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/plans/plan-ref5/progression-state" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		writeUITestJSON(t, w, map[string]any{
			"program":    "ref5",
			"ref5Status": ref5WindowStatusFixture(),
			"feedback":   ref5JudgmentFeedback(),
		})
	}))
	plan := uiRef5Plan()

	newBuffer := func() Log {
		l := NewLog(client)
		l.load = loadIdle
		l.planID, l.planName = plan.ID, plan.Name
		l.ref5 = newRef5StartState(plan, 82.5, time.Now())
		return l
	}

	l := newBuffer()
	cmd := l.beginRef5WindowStatusLoad(plan.ID)
	if cmd == nil {
		t.Fatal("re-entry did not request the progression state")
	}
	loaded, ok := cmd().(ref5WindowStatusLoadedMsg)
	if !ok || loaded.err != nil {
		t.Fatalf("status load = %#v", loaded)
	}
	if loaded.feedback == nil || loaded.feedback.Report == nil {
		t.Fatalf("progression-state feedback was dropped at the transport boundary: %#v", loaded.feedback)
	}

	screen, _ := l.Update(loaded)
	got := screen.(Log)
	if got.ref5Progress.status == nil {
		t.Fatalf("window status was not applied: %#v", got.ref5Progress)
	}
	body := ansi.Strip(got.Body(80, 32))
	for _, want := range []string{"REF5 창 판정", "SQ 하드 — 판정창 클리어"} {
		if !strings.Contains(body, want) {
			t.Errorf("re-entered REF5 body missing judgment %q:\n%s", want, body)
		}
	}

	// A card already on screen (just set by the save response) wins — the
	// refresh must not restyle or duplicate the same judgment underneath it.
	fresh := newBuffer()
	fresh.feedback = []string{"방금 저장이 세운 카드"}
	fresh.beginRef5WindowStatusLoad(plan.ID)
	screen, _ = fresh.Update(loaded)
	if kept := screen.(Log).feedback; len(kept) != 1 || kept[0] != "방금 저장이 세운 카드" {
		t.Errorf("status refresh clobbered the post-save card: %#v", kept)
	}
}
