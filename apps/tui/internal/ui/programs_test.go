package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/sharru0701/workout-log/apps/tui/internal/api"
)

func TestProgramsRenders(t *testing.T) {
	pr := NewPrograms(nil)
	pr.loaded = true
	pr.plans = []api.Plan{
		{ID: "1", Name: "5/3/1", BaseProgramName: "BBB"},
		{ID: "2", Name: "PPL", Type: "COMPOSITE"},
	}
	pr.activeID = "1"
	out := ansi.Strip(pr.Body(50, 12))
	if !strings.Contains(out, "5/3/1") || !strings.Contains(out, "PPL") {
		t.Errorf("programs body missing plan names:\n%s", out)
	}
	if !strings.Contains(out, "●") {
		t.Errorf("programs body missing active bullet:\n%s", out)
	}
}

func TestProgramsLoadingMode(t *testing.T) {
	if NewPrograms(nil).Mode().Label != "LOADING" {
		t.Error("expected LOADING before data is loaded")
	}
}

func samplePrograms() Programs {
	pr := NewPrograms(nil)
	pr.loaded = true
	pr.plans = []api.Plan{{ID: "1", Name: "5/3/1"}, {ID: "2", Name: "PPL"}}
	return pr
}

func TestProgramsRenameSubmit(t *testing.T) {
	scr, _ := samplePrograms().beginRename()
	pr := scr.(Programs)
	if !pr.renaming || !pr.Editing() {
		t.Fatal("expected rename mode active")
	}
	pr.input.SetValue("Madcow")
	scr, cmd := pr.updateRename(tea.KeyPressMsg{Code: tea.KeyEnter})
	if scr.(Programs).renaming {
		t.Error("rename should close on enter")
	}
	if cmd == nil {
		t.Error("a changed name should emit a rename command")
	}
}

func TestProgramsRenameRender(t *testing.T) {
	scr, _ := samplePrograms().beginRename()
	pr := scr.(Programs)
	pr.input.SetValue("Madcow")
	out := ansi.Strip(pr.Body(50, 10))
	if !strings.Contains(out, "Madcow") {
		t.Errorf("rename input not rendered inline:\n%s", out)
	}
}

func ref5ProgramsPlan() api.Plan {
	return api.Plan{
		ID:   "plan-ref5",
		Name: "REF5 Adaptive Strength",
		Type: "SINGLE",
		Params: map[string]any{
			"programFamily":   "ref5",
			"protocolVersion": api.Ref5ProtocolVersion,
			"timezone":        "Asia/Seoul",
		},
	}
}

func TestPickRef5TemplateRequiresTimezoneBeforeCreate(t *testing.T) {
	var settingsReads int
	var planPosts int
	var posted map[string]any
	mux := http.NewServeMux()
	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, _ *http.Request) {
		settingsReads++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"settings": map[string]any{"prefs.timezone": "Asia/Seoul"},
		})
	})
	mux.HandleFunc("/api/plans", func(w http.ResponseWriter, r *http.Request) {
		planPosts++
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&posted); err != nil {
			t.Errorf("decode plan request: %v", err)
		}
		w.WriteHeader(http.StatusCreated)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client, err := api.New(server.URL)
	if err != nil {
		t.Fatal(err)
	}

	template := api.Template{
		ID: "template-ref5", Slug: api.Ref5TemplateSlug, Name: "REF5", Type: "LOGIC",
		LatestVersion: &api.TemplateVersion{ID: "version-ref5"},
	}
	programs := NewPrograms(client)
	programs.templates = []api.Template{template}

	scr, pickerCmd := programs.Update(pickedMsg{tag: "template", value: template.ID})
	programs = scr.(Programs)
	if pickerCmd == nil {
		t.Fatal("REF5 template did not open a timezone picker")
	}
	if planPosts != 0 {
		t.Fatalf("plan was created before timezone selection: %d POST(s)", planPosts)
	}
	picker, ok := pickerCmd().(openPickerMsg)
	if !ok {
		t.Fatalf("timezone command = %T, want openPickerMsg", pickerCmd())
	}
	if picker.tag != "ref5-timezone" || picker.initial != "Asia/Seoul" {
		t.Fatalf("timezone picker = %#v", picker)
	}
	if programs.pendingRef5TemplateID != template.ID {
		t.Fatalf("pending template = %q", programs.pendingRef5TemplateID)
	}

	// The submitted value, rather than merely the suggested initial value, must
	// be persisted in the plan params.
	scr, createCmd := programs.Update(pickedMsg{tag: "ref5-timezone", value: "America/New_York"})
	programs = scr.(Programs)
	if createCmd == nil {
		t.Fatal("valid timezone did not create the REF5 plan")
	}
	msg := createCmd()
	created, ok := msg.(planCreatedMsg)
	if !ok || created.err != nil {
		t.Fatalf("create result = %#v", msg)
	}
	if settingsReads != 1 {
		t.Fatalf("settings reads = %d, want 1", settingsReads)
	}
	params, ok := posted["params"].(map[string]any)
	if !ok || params["timezone"] != "America/New_York" {
		t.Fatalf("posted params = %#v", posted["params"])
	}
	if posted["rootProgramVersionId"] != "version-ref5" {
		t.Errorf("root version = %#v", posted["rootProgramVersionId"])
	}
	if programs.pendingRef5TemplateID != "" {
		t.Errorf("pending template was not cleared: %q", programs.pendingRef5TemplateID)
	}
}

func TestPickNonRef5TemplateKeepsLegacyCreateRequest(t *testing.T) {
	var settingsReads int
	var posted map[string]any
	mux := http.NewServeMux()
	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, _ *http.Request) {
		settingsReads++
		_ = json.NewEncoder(w).Encode(map[string]any{"settings": map[string]any{}})
	})
	mux.HandleFunc("/api/plans", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&posted)
		w.WriteHeader(http.StatusCreated)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client, err := api.New(server.URL)
	if err != nil {
		t.Fatal(err)
	}

	template := api.Template{
		ID: "template-531", Slug: "531", Name: "5/3/1", Type: "LOGIC",
		LatestVersion: &api.TemplateVersion{ID: "version-531"},
	}
	programs := NewPrograms(client)
	programs.templates = []api.Template{template}
	_, cmd := programs.Update(pickedMsg{tag: "template", value: template.ID})
	if cmd == nil {
		t.Fatal("ordinary template create command is nil")
	}
	msg := cmd()
	if created := msg.(planCreatedMsg); created.err != nil {
		t.Fatal(created.err)
	}
	if settingsReads != 0 {
		t.Fatalf("ordinary template unexpectedly read settings %d time(s)", settingsReads)
	}
	if _, exists := posted["params"]; exists {
		t.Fatalf("ordinary create request unexpectedly has params: %#v", posted)
	}
}

func TestPickRef5TemplateRejectsInvalidTimezone(t *testing.T) {
	template := api.Template{
		ID: "template-ref5", Slug: api.Ref5TemplateSlug, Name: "REF5", Type: "LOGIC",
		LatestVersion: &api.TemplateVersion{ID: "version-ref5"},
	}
	programs := NewPrograms(nil)
	programs.templates = []api.Template{template}
	programs.pendingRef5TemplateID = template.ID

	scr, cmd := programs.Update(pickedMsg{tag: "ref5-timezone", value: "not/a-zone"})
	programs = scr.(Programs)
	if !strings.Contains(programs.err, "IANA") {
		t.Fatalf("validation error = %q", programs.err)
	}
	if programs.pendingRef5TemplateID != template.ID {
		t.Fatal("invalid timezone discarded the pending REF5 template")
	}
	if cmd == nil {
		t.Fatal("invalid timezone did not reopen the picker")
	}
	picker, ok := cmd().(openPickerMsg)
	if !ok || picker.tag != "ref5-timezone" || picker.initial != "not/a-zone" {
		t.Fatalf("reopened picker = %#v", picker)
	}
}

func TestRef5PlanTimezoneFallsBackToSystemIANAZone(t *testing.T) {
	t.Setenv("TZ", "Asia/Tokyo")
	settings := map[string]json.RawMessage{
		"prefs.timezone": json.RawMessage(`"not/a-zone"`),
	}
	if got := ref5PlanTimezone(settings); got != "Asia/Tokyo" {
		t.Fatalf("timezone = %q, want Asia/Tokyo", got)
	}
}

func TestRef5PlanTimezonePrefersSystemOverMergedUTCDefault(t *testing.T) {
	t.Setenv("TZ", "Asia/Tokyo")
	settings := map[string]json.RawMessage{
		"prefs.timezone": json.RawMessage(`"UTC"`),
	}
	if got := ref5PlanTimezone(settings); got != "Asia/Tokyo" {
		t.Fatalf("timezone = %q, want Asia/Tokyo", got)
	}
}

func TestRef5PlanTimezoneKeepsExplicitNonUTCPreference(t *testing.T) {
	t.Setenv("TZ", "Asia/Tokyo")
	settings := map[string]json.RawMessage{
		"prefs.timezone": json.RawMessage(`"Europe/Paris"`),
	}
	if got := ref5PlanTimezone(settings); got != "Europe/Paris" {
		t.Fatalf("timezone = %q, want Europe/Paris", got)
	}
}

func TestProgramsActivationCarriesCompleteRef5Plan(t *testing.T) {
	pr := NewPrograms(nil)
	pr.loaded = true
	pr.plans = []api.Plan{ref5ProgramsPlan()}

	scr, cmd := pr.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("activation command is nil")
	}
	msg, ok := cmd().(planActivatedMsg)
	if !ok {
		t.Fatalf("activation message = %T", cmd())
	}
	if msg.id != "plan-ref5" || !msg.plan.IsRef5() || msg.plan.Params["timezone"] != "Asia/Seoul" {
		t.Fatalf("activation message lost plan params: %#v", msg)
	}
	if scr.(Programs).activeID != "plan-ref5" {
		t.Errorf("active id was not updated")
	}
}

func TestProgramsRef5PlanUsesProtocolSubtitle(t *testing.T) {
	pr := NewPrograms(nil)
	pr.loaded = true
	pr.plans = []api.Plan{ref5ProgramsPlan()}
	out := ansi.Strip(pr.Body(50, 10))
	if !strings.Contains(out, "ref5 v"+api.Ref5ProtocolVersion) {
		t.Fatalf("REF5 protocol subtitle missing:\n%s", out)
	}
}

func TestProgramsRef5StatusToggleAndRefresh(t *testing.T) {
	pr := NewPrograms(nil)
	pr.loaded = true
	pr.plans = []api.Plan{ref5ProgramsPlan()}

	scr, cmd := pr.handleKey(tea.KeyPressMsg{Code: 'v', Text: "v"})
	status := scr.(Programs)
	if !status.showRef5Status || !status.statusLoading || cmd == nil {
		t.Fatalf("v did not open loading status: %#v, cmd nil=%v", status, cmd == nil)
	}
	scr, cmd = status.handleKey(tea.KeyPressMsg{Code: 'R', Text: "R"})
	if !scr.(Programs).statusLoading || cmd == nil {
		t.Fatal("R did not refresh REF5 status")
	}
	scr, _ = scr.(Programs).handleKey(tea.KeyPressMsg{Code: tea.KeyEscape})
	if scr.(Programs).showRef5Status {
		t.Fatal("esc did not return to program list")
	}
}

func TestProgramsNonRef5HasNoStatusToggle(t *testing.T) {
	pr := samplePrograms()
	scr, cmd := pr.handleKey(tea.KeyPressMsg{Code: 'v', Text: "v"})
	if scr.(Programs).showRef5Status || cmd != nil {
		t.Fatal("ordinary plan entered REF5 status flow")
	}
	for _, h := range pr.Hints() {
		if h.key == "v" {
			t.Fatal("ordinary plan exposed REF5 status hint")
		}
	}
}

func TestProgramsRef5StatusRendersOpenEndedState(t *testing.T) {
	pr := NewPrograms(nil)
	pr.loaded = true
	pr.plans = []api.Plan{ref5ProgramsPlan()}
	pr.showRef5Status = true
	pr.statusPlanID = "plan-ref5"
	pr.ref5Status = &api.Ref5Status{
		Revision:      5,
		NextFocus:     "PULL",
		NextSquatHard: "H3",
		PendingMicro: api.Ref5PendingMicroStatus{
			Pending: true,
			Reasons: []string{"STAGNATION_BP"},
		},
		Windows: map[string]api.Ref5WindowStatus{
			"SQ":   {Current: 1, Threshold: 6},
			"BP":   {Current: 0, Threshold: 4},
			"PULL": {Current: 0, Threshold: 4},
			"DL":   {Current: 2, Threshold: 4},
			"OHP":  {Current: 3, Threshold: 4},
		},
		DirectStandardsKg: api.Ref5DirectStandardsKg{
			SqH3Kg: 82.5, BpFocusKg: 82.5, PullFocusTotalKg: 87.5,
			DeadliftKg: 72.5, OhpKg: 32.5,
		},
		PullLock: &api.Ref5PullLockStatus{
			WindowID: "pull:2", FocusTargetTotalKg: 87.5, VolumeTargetTotalKg: 75,
		},
		StartedSessionCount:   4,
		CompletedSessionCount: 3,
	}

	out := ansi.Strip(pr.Body(60, 18))
	for _, want := range []string{
		"REF5 STATUS", "NEXT", "PULL · SQ H3", "STD", "SQ-H3 82.5kg",
		"WIN", "SQ 1/6", "BP 0/4", "DL 2/4", "LOCK", "pull:2",
		"MICRO", "STAGNATION_BP", "START 4", "DONE 3", "REV 5",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("status missing %q:\n%s", want, out)
		}
	}
	for _, forbidden := range []string{"C1W1D1", " TM ", "1RM"} {
		if strings.Contains(out, forbidden) {
			t.Errorf("open-ended REF5 status contains legacy %q:\n%s", forbidden, out)
		}
	}
	if pr.StatusRight() != "REF5 REV 5" {
		t.Errorf("status right = %q", pr.StatusRight())
	}
}

func TestProgramsRef5StatusLoadingAndError(t *testing.T) {
	pr := NewPrograms(nil)
	pr.loaded = true
	pr.plans = []api.Plan{ref5ProgramsPlan()}
	pr.showRef5Status = true
	pr.statusLoading = true
	if out := ansi.Strip(pr.Body(46, 12)); !strings.Contains(out, "불러오는 중") {
		t.Fatalf("loading body = %q", out)
	}
	if pr.Mode().Label != "LOADING" {
		t.Fatalf("loading mode = %q", pr.Mode().Label)
	}

	pr.statusLoading = false
	pr.statusErr = "network down"
	if out := ansi.Strip(pr.Body(46, 12)); !strings.Contains(out, "network down") {
		t.Fatalf("error body = %q", out)
	}
	if pr.Mode().Label != "REF5" {
		t.Fatalf("error mode = %q", pr.Mode().Label)
	}
}
