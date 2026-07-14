package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
	"time"
)

func newAPIClientForTest(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client, err := New(server.URL)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return client
}

func writeJSONForTest(t *testing.T, w http.ResponseWriter, status int, value any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		t.Errorf("encode response: %v", err)
	}
}

func decodeJSONBodyForTest(t *testing.T, r *http.Request, value any) {
	t.Helper()
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(value); err != nil {
		t.Errorf("decode request: %v", err)
	}
}

func TestCreatePlanRequestPreservesRef5TimezoneAndParams(t *testing.T) {
	client := newAPIClientForTest(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/plans" {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		var body map[string]any
		decodeJSONBodyForTest(t, r, &body)
		params, _ := body["params"].(map[string]any)
		if got := params["timezone"]; got != "Asia/Seoul" {
			t.Errorf("params.timezone = %#v", got)
		}
		if got := params["programFamily"]; got != Ref5ProgramFamily {
			t.Errorf("params.programFamily = %#v", got)
		}
		ref5, _ := params["ref5"].(map[string]any)
		if got := ref5["protocolVersion"]; got != Ref5ProtocolVersion {
			t.Errorf("params.ref5.protocolVersion = %#v", got)
		}
		writeJSONForTest(t, w, http.StatusCreated, map[string]any{"plan": map[string]any{"id": "plan-1"}})
	})

	err := client.CreatePlan(context.Background(), CreatePlanRequest{
		Name:                 "REF5",
		Type:                 "SINGLE",
		RootProgramVersionID: "version-1",
		Params: map[string]any{
			"timezone":      "Asia/Seoul",
			"programFamily": Ref5ProgramFamily,
			"ref5": map[string]any{
				"protocolVersion": Ref5ProtocolVersion,
				"futureDefault":   map[string]any{"enabled": true},
			},
		},
	})
	if err != nil {
		t.Fatalf("CreatePlan: %v", err)
	}

	plan := Plan{Params: map[string]any{"ref5": map[string]any{"protocolVersion": Ref5ProtocolVersion}}}
	if !plan.IsRef5() {
		t.Error("Plan.IsRef5 = false")
	}
	template := Template{LatestVersion: &TemplateVersion{Definition: map[string]any{"family": "ref5"}}}
	if !template.IsRef5() {
		t.Error("Template.IsRef5 = false")
	}
	if !(SessionSnapshot{ProtocolVersion: Ref5ProtocolVersion}).IsRef5() {
		t.Error("SessionSnapshot.IsRef5 = false for protocol marker")
	}
}

func TestPlansDecodeRef5ParamsAndRootVersion(t *testing.T) {
	client := newAPIClientForTest(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/plans" {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		writeJSONForTest(t, w, http.StatusOK, map[string]any{
			"items": []any{map[string]any{
				"id":                   "plan-1",
				"name":                 "REF5",
				"type":                 "SINGLE",
				"rootProgramVersionId": "version-1",
				"params": map[string]any{
					"timezone":        "Asia/Seoul",
					"programFamily":   Ref5ProgramFamily,
					"protocolVersion": Ref5ProtocolVersion,
					"ref5": map[string]any{
						"schemaVersion": 1,
						"futureConfig":  []any{"kept", 2.0},
					},
				},
				"baseProgramName": "REF5 Adaptive Strength (Base)",
				"isArchived":      false,
				"createdAt":       "2026-07-14T00:00:00.000Z",
			}},
		})
	})

	plans, err := client.Plans(context.Background())
	if err != nil {
		t.Fatalf("Plans: %v", err)
	}
	if len(plans) != 1 || plans[0].RootProgramVersionID == nil || *plans[0].RootProgramVersionID != "version-1" {
		t.Fatalf("root version was not decoded: %#v", plans)
	}
	if !plans[0].IsRef5() || plans[0].Params["timezone"] != "Asia/Seoul" {
		t.Errorf("REF5 params were not decoded: %#v", plans[0].Params)
	}
	ref5, _ := plans[0].Params["ref5"].(map[string]any)
	if _, ok := ref5["futureConfig"].([]any); !ok {
		t.Errorf("future config was lost: %#v", ref5)
	}
}

func TestTemplatesDecodeRef5VersionContract(t *testing.T) {
	client := newAPIClientForTest(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/templates" || r.URL.Query().Get("limit") != "100" {
			t.Errorf("request = %s %s?%s", r.Method, r.URL.Path, r.URL.RawQuery)
		}
		writeJSONForTest(t, w, http.StatusOK, map[string]any{
			"items": []any{map[string]any{
				"id":         "template-1",
				"slug":       Ref5TemplateSlug,
				"name":       "REF5 Adaptive Strength (Base)",
				"type":       "LOGIC",
				"visibility": "PUBLIC",
				"latestVersion": map[string]any{
					"id":      "version-1",
					"version": 1,
					"definition": map[string]any{
						"kind":   Ref5ProgramFamily,
						"family": Ref5ProgramFamily,
						"future": map[string]any{"engine": 512},
					},
					"defaults": map[string]any{
						"ref5": map[string]any{
							"protocolVersion":  Ref5ProtocolVersion,
							"startingValuesKg": map[string]any{"sqH3Kg": 82.5},
						},
					},
				},
			}},
		})
	})

	templates, err := client.Templates(context.Background())
	if err != nil {
		t.Fatalf("Templates: %v", err)
	}
	if len(templates) != 1 || templates[0].LatestVersion == nil || !templates[0].IsRef5() {
		t.Fatalf("REF5 template was not decoded: %#v", templates)
	}
	version := templates[0].LatestVersion
	if version.ID != "version-1" || version.Definition["kind"] != Ref5ProgramFamily {
		t.Errorf("version identity = %#v", version)
	}
	defaults, _ := version.Defaults["ref5"].(map[string]any)
	starts, _ := defaults["startingValuesKg"].(map[string]any)
	if starts["sqH3Kg"] != 82.5 {
		t.Errorf("version defaults were lost: %#v", version.Defaults)
	}
}

func TestPreviewAndStartRef5SessionShareImmutableEnvelope(t *testing.T) {
	var requests []Ref5GenerateRequest
	var rawRequests []map[string]any
	client := newAPIClientForTest(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/plans/plan-1/generate" {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		var raw json.RawMessage
		decodeJSONBodyForTest(t, r, &raw)
		var req Ref5GenerateRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			t.Errorf("decode typed request: %v", err)
		}
		var rawMap map[string]any
		if err := json.Unmarshal(raw, &rawMap); err != nil {
			t.Errorf("decode raw request: %v", err)
		}
		requests = append(requests, req)
		rawRequests = append(rawRequests, rawMap)
		id := "session-1"
		if req.Preview {
			id = ""
		}
		writeJSONForTest(t, w, http.StatusOK, map[string]any{
			"session": map[string]any{
				"id":         id,
				"planId":     "plan-1",
				"sessionKey": "REF5:2026-07-14T01:02:03.000Z:start-1",
				"snapshot":   map[string]any{"protocolVersion": Ref5ProtocolVersion},
			},
		})
	})

	input := Ref5GenerateInput{
		ProtocolVersion:   Ref5ProtocolVersion,
		ActualStartAt:     "2026-07-14T01:02:03.000Z",
		TodayBodyweightKg: 81.25,
		ManualMicro:       true,
		StartEventID:      "start-1",
	}
	if _, err := client.PreviewRef5Session(context.Background(), "plan-1", input); err != nil {
		t.Fatalf("PreviewRef5Session: %v", err)
	}
	if _, err := client.StartRef5Session(context.Background(), "plan-1", input); err != nil {
		t.Fatalf("StartRef5Session: %v", err)
	}
	if len(requests) != 2 {
		t.Fatalf("request count = %d", len(requests))
	}
	preview, start := requests[0], requests[1]
	if !preview.Preview || start.Preview {
		t.Fatalf("preview flags = %v, %v", preview.Preview, start.Preview)
	}
	preview.Preview = false
	if !reflect.DeepEqual(preview, start) {
		t.Errorf("preview/start immutable envelope differs:\npreview=%#v\nstart=%#v", preview, start)
	}
	for index, raw := range rawRequests {
		ref5, _ := raw["ref5"].(map[string]any)
		if _, legacy := ref5["bodyweightKg"]; legacy {
			t.Errorf("request %d sent legacy bodyweightKg", index)
		}
		if got := ref5["todayBodyweightKg"]; got != 81.25 {
			t.Errorf("request %d todayBodyweightKg = %#v", index, got)
		}
		if got := ref5["protocolVersion"]; got != Ref5ProtocolVersion {
			t.Errorf("request %d protocolVersion = %#v", index, got)
		}
		for _, retired := range []string{"climb", "climbing", "climbingWithin48h", "strongClimbing", "pullFallback", "substitute", "substitution", "omitPullVolume", "omitted", "omittedPrescriptions"} {
			if _, exists := ref5[retired]; exists {
				t.Errorf("request %d sent retired field %s", index, retired)
			}
		}
	}
}

func TestStartRef5SessionRetryUsesExactSamePayloadAndDecodesSameID(t *testing.T) {
	var mu sync.Mutex
	var bodies [][]byte
	client := newAPIClientForTest(t, func(w http.ResponseWriter, r *http.Request) {
		body := new(bytes.Buffer)
		if _, err := body.ReadFrom(r.Body); err != nil {
			t.Errorf("read body: %v", err)
		}
		mu.Lock()
		bodies = append(bodies, append([]byte(nil), body.Bytes()...))
		mu.Unlock()
		writeJSONForTest(t, w, http.StatusCreated, map[string]any{
			"session": map[string]any{
				"id":         "session-stable",
				"planId":     "plan-1",
				"sessionKey": "REF5:stable",
				"snapshot":   map[string]any{},
			},
		})
	})

	input := Ref5GenerateInput{
		ProtocolVersion:   Ref5ProtocolVersion,
		ActualStartAt:     "2026-07-14T01:02:03.000Z",
		TodayBodyweightKg: 80,
		StartEventID:      "start-stable",
	}
	first, err := client.StartRef5Session(context.Background(), "plan-1", input)
	if err != nil {
		t.Fatalf("first StartRef5Session: %v", err)
	}
	second, err := client.StartRef5Session(context.Background(), "plan-1", input)
	if err != nil {
		t.Fatalf("retry StartRef5Session: %v", err)
	}
	if first.ID != "session-stable" || second.ID != first.ID {
		t.Fatalf("ids = %q, %q", first.ID, second.ID)
	}
	if len(bodies) != 2 || !bytes.Equal(bodies[0], bodies[1]) {
		t.Errorf("retry bodies differ: %q / %q", bodies[0], bodies[1])
	}
}

func ref5SessionResponseForTest(id string) map[string]any {
	return map[string]any{
		"id":         id,
		"planId":     "plan-1",
		"sessionKey": "REF5:2026-07-14T01:02:03.000Z:start-1",
		"status":     "PLANNED",
		"updatedAt":  "2026-07-14T01:03:00.000Z",
		"snapshot": map[string]any{
			"schemaVersion":    4,
			"protocolVersion":  Ref5ProtocolVersion,
			"actualStartAt":    "2026-07-14T01:02:03.000Z",
			"totalWorkingSets": 1,
			"program": map[string]any{
				"slug":            Ref5TemplateSlug,
				"family":          Ref5ProgramFamily,
				"protocolVersion": Ref5ProtocolVersion,
			},
			"ref5": map[string]any{
				"protocolVersion": Ref5ProtocolVersion,
				"snapshotId":      "start-1:snapshot",
				"sessionId":       "REF5:session-1",
				"startEventId":    "start-1",
				"decision": map[string]any{
					"sessionType":       "NORMAL",
					"microReasons":      []string{},
					"focus":             "PULL",
					"squatPrescription": "H3",
				},
				"domainSnapshot": map[string]any{
					"schemaVersion":   1,
					"protocolVersion": Ref5ProtocolVersion,
					"snapshotId":      "start-1:snapshot",
					"sessionId":       "REF5:session-1",
					"actualStartAt":   "2026-07-14T01:02:03.000Z",
					"timeZone":        "Asia/Seoul",
					"calendarDate":    "2026-07-14",
					"exercises":       []any{},
				},
			},
			"exercises": []any{
				map[string]any{
					"exerciseName": "Back Squat",
					"role":         "MAIN",
					"ref5": map[string]any{
						"protocolVersion": Ref5ProtocolVersion,
						"snapshotId":      "start-1:snapshot",
						"sessionId":       "REF5:session-1",
						"prescriptionId":  "rx-sq-1",
						"lift":            "SQ",
						"stream":          "SQ_H3",
					},
					"sets": []any{
						map[string]any{
							"reps":           3,
							"plannedReps":    3,
							"targetWeightKg": 82.5,
							"externalLoadKg": 82.5,
							"totalLoadKg":    82.5,
							"meta": map[string]any{
								"ref5": map[string]any{
									"prescriptionId": "rx-sq-1",
									"futureField":    map[string]any{"nested": true},
								},
							},
						},
					},
				},
			},
		},
	}
}

func TestResumeGeneratedSessionPreservesRef5Snapshot(t *testing.T) {
	client := newAPIClientForTest(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/plans/plan-1/generated-sessions/session-1" {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		writeJSONForTest(t, w, http.StatusOK, map[string]any{"session": ref5SessionResponseForTest("session-1")})
	})

	session, err := client.ResumeGeneratedSession(context.Background(), "plan-1", "session-1")
	if err != nil {
		t.Fatalf("ResumeGeneratedSession: %v", err)
	}
	if session.ID != "session-1" || session.PlanID != "plan-1" {
		t.Fatalf("identity = %q / %q", session.ID, session.PlanID)
	}
	if !session.Snapshot.IsRef5() || session.Snapshot.Ref5 == nil {
		t.Fatal("snapshot not recognized as REF5")
	}
	if got := session.Snapshot.Ref5.DomainSnapshot.TimeZone; got != "Asia/Seoul" {
		t.Errorf("domain timezone = %q", got)
	}
	set := session.Snapshot.Exercises[0].Sets[0]
	if set.Meta == nil || set.Meta.Ref5["prescriptionId"] != "rx-sq-1" {
		t.Fatalf("set REF5 metadata = %#v", set.Meta)
	}
	if _, ok := set.Meta.Ref5["futureField"].(map[string]any); !ok {
		t.Errorf("future REF5 metadata lost: %#v", set.Meta.Ref5)
	}
}

func TestListGeneratedSessionsIncludesSnapshotAndPlanIdentity(t *testing.T) {
	client := newAPIClientForTest(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/generated-sessions" {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		if got := r.URL.Query().Get("planId"); got != "plan-1" {
			t.Errorf("planId = %q", got)
		}
		if got := r.URL.Query().Get("includeSnapshot"); got != "1" {
			t.Errorf("includeSnapshot = %q", got)
		}
		if got := r.URL.Query().Get("limit"); got != "100" {
			t.Errorf("limit = %q", got)
		}
		item := ref5SessionResponseForTest("session-open")
		delete(item, "planId") // collection endpoint intentionally omits it
		writeJSONForTest(t, w, http.StatusOK, map[string]any{"items": []any{item}})
	})

	items, err := client.ListGeneratedSessions(context.Background(), "plan-1")
	if err != nil {
		t.Fatalf("ListGeneratedSessions: %v", err)
	}
	if len(items) != 1 || items[0].ID != "session-open" || items[0].PlanID != "plan-1" {
		t.Fatalf("items = %#v", items)
	}
	if !items[0].Snapshot.IsRef5() {
		t.Error("listed snapshot not recognized as REF5")
	}
}

func TestRef5PlanStatusDecodesProtocolFields(t *testing.T) {
	client := newAPIClientForTest(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/plans/plan-1/progression-state" {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		writeJSONForTest(t, w, http.StatusOK, map[string]any{
			"program": "ref5",
			"state":   map[string]any{"revision": 7, "futureRuntimeField": true},
			"ref5Status": map[string]any{
				"schemaVersion":   1,
				"protocolVersion": Ref5ProtocolVersion,
				"revision":        7,
				"nextFocus":       "BP",
				"nextSquatHard":   "H2",
				"pendingMicro": map[string]any{
					"pending": true,
					"reasons": []string{"STAGNATION_SQ"},
					"forcedToken": map[string]any{
						"eventId":                    "forced-1",
						"sourceFailEventIds":         []string{"fail-1", "fail-2"},
						"createdByCompletionEventId": "complete-1",
					},
					"stagnationLifts": []string{"SQ"},
				},
				"windows": map[string]any{
					"SQ": map[string]any{"current": 2, "threshold": 6, "volumeFailures": 1, "completed": 3},
				},
				"directStandardsKg": map[string]any{
					"sqH3Kg": 85, "bpFocusKg": 82.5, "pullFocusTotalKg": 90,
					"deadliftKg": 75, "ohpKg": 35,
				},
				"pullLock": map[string]any{
					"windowId": "pull-2", "focusTargetTotalKg": 90, "volumeTargetTotalKg": 77.5,
					"focusAddedKg": 10, "volumeAddedKg": 0,
				},
				"startedSessionCount":   8,
				"completedSessionCount": 7,
			},
		})
	})

	status, err := client.Ref5PlanStatus(context.Background(), "plan-1")
	if err != nil {
		t.Fatalf("Ref5PlanStatus: %v", err)
	}
	if status == nil {
		t.Fatal("Ref5PlanStatus = nil")
	}
	if status.ProtocolVersion != Ref5ProtocolVersion || status.Revision != 7 || status.NextFocus != "BP" {
		t.Errorf("status identity = %#v", status)
	}
	if !status.PendingMicro.Pending || status.Windows["SQ"].Threshold != 6 {
		t.Errorf("status decisions = %#v", status)
	}
	if status.PendingMicro.ForcedToken == nil || status.PendingMicro.ForcedToken.EventID != "forced-1" {
		t.Errorf("forced micro token = %#v", status.PendingMicro.ForcedToken)
	}
	if float64(status.DirectStandardsKg.SqH3Kg) != 85 || status.PullLock == nil || status.PullLock.WindowID != "pull-2" {
		t.Errorf("status weights = %#v", status)
	}
}

func TestRef5SetMetaRoundTripPreservesCanonicalMetadata(t *testing.T) {
	original := []byte(`{
		"bodyweightKg":"81.25",
		"totalLoadKg":91.25,
		"futureTopLevel":{"owner":"engine","values":[1,2,3]},
		"ref5":{
			"protocolVersion":"1.2",
			"snapshotId":"snapshot-1",
			"sessionId":"session-1",
			"prescriptionId":"rx-pull-1",
			"plannedReps":3,
			"actualReps":2,
			"terminationReason":"FORCE_OR_TECHNIQUE",
			"prescription":{"pull":{"actualTotalKg":91.25},"futureNested":{"a":true}}
		}
	}`)
	var meta SetMeta
	if err := json.Unmarshal(original, &meta); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if float64(meta.BodyweightKg) != 81.25 || float64(meta.TotalLoadKg) != 91.25 {
		t.Errorf("known load fields = %#v", meta)
	}
	if meta.Ref5["terminationReason"] != "FORCE_OR_TECHNIQUE" {
		t.Errorf("REF5 termination = %#v", meta.Ref5)
	}

	encoded, err := json.Marshal(meta)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var before, after map[string]any
	if err := json.Unmarshal(original, &before); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(encoded, &after); err != nil {
		t.Fatal(err)
	}
	// Numeric string tolerance is intentionally normalized to a JSON number.
	before["bodyweightKg"] = 81.25
	if !reflect.DeepEqual(before, after) {
		t.Errorf("metadata round trip differs:\nbefore=%#v\nafter=%#v", before, after)
	}
}

func TestSetMetaRoundTripPreservesExplicitZeroAndNull(t *testing.T) {
	original := []byte(`{"bodyweightKg":0,"totalLoadKg":0,"ref5":null,"future":false}`)
	var meta SetMeta
	if err := json.Unmarshal(original, &meta); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	encoded, err := json.Marshal(meta)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var before, after map[string]any
	if err := json.Unmarshal(original, &before); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(encoded, &after); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Errorf("explicit zero/null fields were lost: before=%#v after=%#v", before, after)
	}
}

func TestRef5CreateAndUpdateLogSerializeCanonicalIdentity(t *testing.T) {
	var bodies []map[string]any
	client := newAPIClientForTest(t, func(w http.ResponseWriter, r *http.Request) {
		if !((r.Method == http.MethodPost && r.URL.Path == "/api/logs") ||
			(r.Method == http.MethodPatch && r.URL.Path == "/api/logs/log-1")) {
			t.Errorf("request = %s %s", r.Method, r.URL.Path)
		}
		var body map[string]any
		decodeJSONBodyForTest(t, r, &body)
		bodies = append(bodies, body)
		writeJSONForTest(t, w, http.StatusOK, map[string]any{
			"log":         map[string]any{"id": "log-1"},
			"progression": map[string]any{"feedback": nil},
		})
	})

	performedAt := time.Date(2026, 7, 14, 1, 2, 3, 0, time.UTC)
	meta := &SetMeta{
		Ref5: map[string]any{
			"protocolVersion":   Ref5ProtocolVersion,
			"snapshotId":        "snapshot-1",
			"sessionId":         "session-domain-1",
			"prescriptionId":    "rx-sq-1",
			"plannedReps":       3,
			"actualReps":        2,
			"terminationReason": "FORCE_OR_TECHNIQUE",
			"actualStartAt":     performedAt.Format(time.RFC3339),
			"startEventId":      "start-1",
			"completionEventId": "start-1:completion",
			"prescription":      map[string]any{"future": map[string]any{"kept": true}},
		},
	}
	request := CreateLogRequest{
		PlanID:             "plan-1",
		GeneratedSessionID: "generated-1",
		PerformedAt:        performedAt,
		Timezone:           "Asia/Seoul",
		Sets: []WorkoutSet{
			{
				ExerciseName: "Back Squat",
				SetNumber:    1,
				Reps:         2,
				WeightKg:     82.5,
				Meta:         meta,
			},
		},
	}
	if _, _, err := client.CreateLog(context.Background(), request); err != nil {
		t.Fatalf("CreateLog: %v", err)
	}
	if _, err := client.UpdateLog(context.Background(), "log-1", request); err != nil {
		t.Fatalf("UpdateLog: %v", err)
	}
	if len(bodies) != 2 || !reflect.DeepEqual(bodies[0], bodies[1]) {
		t.Fatalf("create/update bodies differ: %#v", bodies)
	}
	body := bodies[0]
	if body["planId"] != "plan-1" || body["generatedSessionId"] != "generated-1" {
		t.Errorf("canonical identity = %#v", body)
	}
	if body["performedAt"] != "2026-07-14T01:02:03Z" {
		t.Errorf("performedAt = %#v", body["performedAt"])
	}
	sets, _ := body["sets"].([]any)
	set, _ := sets[0].(map[string]any)
	setMeta, _ := set["meta"].(map[string]any)
	ref5, _ := setMeta["ref5"].(map[string]any)
	if ref5["completionEventId"] != "start-1:completion" || ref5["terminationReason"] != "FORCE_OR_TECHNIQUE" {
		t.Errorf("canonical REF5 set identity = %#v", ref5)
	}
	if _, ok := ref5["prescription"].(map[string]any); !ok {
		t.Errorf("full prescription metadata lost = %#v", ref5)
	}
}
