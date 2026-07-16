package ui

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func ref5WindowStatusFixture() *api.Ref5Status {
	return &api.Ref5Status{Windows: map[string]api.Ref5WindowStatus{
		"SQ":   {Current: 1, Threshold: 6, Completed: 2},
		"BP":   {Current: 2, Threshold: 4, Completed: 3},
		"PULL": {Current: 3, Threshold: 4, Completed: 4},
		"DL":   {Current: 1, Threshold: 4, Completed: 5},
		"OHP":  {Current: 2, Threshold: 4, Completed: 6},
	}}
}

func TestRef5WindowProgressRowsNameStreamsAndKeepCompletedCounts(t *testing.T) {
	rows := ref5WindowProgressRows(ref5WindowStatusFixture().Windows)
	want := []ref5WindowProgressRow{
		{Key: "SQ", Label: "SQ 하드", Current: 1, Threshold: 6, Completed: 2},
		{Key: "BP", Label: "BP 집중", Current: 2, Threshold: 4, Completed: 3},
		{Key: "PULL", Label: "PULL 집중", Current: 3, Threshold: 4, Completed: 4},
		{Key: "DL", Label: "DL", Current: 1, Threshold: 4, Completed: 5},
		{Key: "OHP", Label: "OHP", Current: 2, Threshold: 4, Completed: 6},
	}
	if len(rows) != len(want) {
		t.Fatalf("row count = %d, want %d", len(rows), len(want))
	}
	for index := range want {
		if rows[index] != want[index] {
			t.Errorf("row %d = %#v, want %#v", index, rows[index], want[index])
		}
	}
}

func TestRef5WindowPanelExplainsProgressAndJudgmentRules(t *testing.T) {
	plan := uiRef5Plan()
	log := NewLog(nil)
	log.load = loadIdle
	log.planID, log.planName = plan.ID, plan.Name
	log.ref5 = newRef5StartState(plan, 82.5, time.Now())
	log.ref5Progress = ref5WindowProgressState{
		planID: plan.ID, status: ref5WindowStatusFixture(),
	}

	out := ansi.Strip(strings.Join(log.ref5WindowPanelLines(64, false), "\n"))
	for _, want := range []string{
		"기본 판정창", "진행/기준 · 판정완료", "SQ 하드 1/6·2",
		"BP 집중 2/4·3", "PULL 집중 3/4·4", "DL 1/4·5", "OHP 2/4·6",
		"하드 = INVALID 제외 SQ H3 3×3 / H2 3×2",
		"집중 = INVALID 제외 당일 우선 BP·PULL 3×3",
		"볼륨 = 진행 횟수 제외, FAIL은 최종 판정 반영",
		"기준 도달 = 자동 판정 후 0부터 재집계",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("panel missing %q:\n%s", want, out)
		}
	}
}

func TestRef5WindowStatusRejectsLateResponses(t *testing.T) {
	plan := uiRef5Plan()
	current := ref5WindowStatusFixture()
	log := NewLog(nil)
	log.planID = plan.ID
	log.ref5Progress = ref5WindowProgressState{
		planID: plan.ID, requestID: 8, status: current, loading: true,
	}

	late := ref5WindowStatusFixture()
	late.Windows["SQ"] = api.Ref5WindowStatus{Current: 5, Threshold: 6, Completed: 20}
	for _, msg := range []ref5WindowStatusLoadedMsg{
		{planID: "other-plan", requestID: 8, status: late},
		{planID: plan.ID, requestID: 7, status: late},
	} {
		screen, cmd := log.Update(msg)
		log = screen.(Log)
		if cmd != nil || log.ref5Progress.status != current || !log.ref5Progress.loading {
			t.Fatalf("late response changed current state: %#v", log.ref5Progress)
		}
	}

	fresh := ref5WindowStatusFixture()
	fresh.Windows["SQ"] = api.Ref5WindowStatus{Current: 2, Threshold: 6, Completed: 3}
	screen, cmd := log.Update(ref5WindowStatusLoadedMsg{
		planID: plan.ID, requestID: 8, status: fresh,
	})
	log = screen.(Log)
	if cmd != nil || log.ref5Progress.loading || log.ref5Progress.status != fresh || log.ref5Progress.err != "" {
		t.Fatalf("current response was not applied: %#v", log.ref5Progress)
	}
}

func TestRef5WindowStatusLoadsAtStartAndRefreshesAfterSave(t *testing.T) {
	status := ref5WindowStatusFixture()
	client := newUITestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/plans/plan-ref5/progression-state" {
			t.Errorf("status path = %q", r.URL.Path)
		}
		writeUITestJSON(t, w, api.PlanProgressionState{Ref5Status: status})
	}))
	plan := uiRef5Plan()
	log := NewLog(client)

	screen, cmd := log.Update(ref5PlanPreparedMsg{plan: plan, bodyweight: 82.5})
	log = screen.(Log)
	if cmd == nil || !log.ref5Progress.loading || log.ref5Progress.planID != plan.ID {
		t.Fatalf("start did not request window status: %#v cmd=%v", log.ref5Progress, cmd != nil)
	}
	startRequestID := log.ref5Progress.requestID

	statusCmd := ref5WindowStatusLoadCmd(client, plan.ID, startRequestID)
	loaded := statusCmd().(ref5WindowStatusLoadedMsg)
	screen, _ = log.Update(loaded)
	log = screen.(Log)
	if log.ref5Progress.status == nil || log.ref5Progress.status.Windows["SQ"].Completed != 2 ||
		log.ref5Progress.loading {
		t.Fatalf("start status was not applied: %#v", log.ref5Progress)
	}
	confirmed := log.ref5Progress.status

	log.groups = []exGroup{{name: "Back Squat", sets: []setEntry{{weight: "100", reps: "3", done: true}}}}
	screen, cmd = log.Update(saveResultMsg{savedID: "log-1", performedAt: time.Now()})
	log = screen.(Log)
	if cmd == nil || !log.ref5Progress.loading || log.ref5Progress.requestID <= startRequestID ||
		log.ref5Progress.status != confirmed {
		t.Fatalf("save did not refresh while preserving confirmed status: %#v cmd=%v", log.ref5Progress, cmd != nil)
	}
}
