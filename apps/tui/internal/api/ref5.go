package api

import (
	"context"
	"encoding/json"
	"net/url"
)

// Ref5GenerateInput is the immutable start tuple shared by preview and start.
// Callers should keep one value (especially StartEventID) and reuse it for a
// preview, the confirming start, and any network retry.
type Ref5GenerateInput struct {
	ProtocolVersion   string  `json:"protocolVersion"`
	ActualStartAt     string  `json:"actualStartAt"`
	TodayBodyweightKg float64 `json:"todayBodyweightKg"`
	ManualMicro       bool    `json:"manualMicro"`
	StartEventID      string  `json:"startEventId"`
}

// Ref5GenerateRequest is the POST /generate envelope. Preview is the only
// field that differs between the write-free preview and the persisted start.
type Ref5GenerateRequest struct {
	Preview bool              `json:"preview"`
	Ref5    Ref5GenerateInput `json:"ref5"`
}

// PreviewRef5Session computes a prescription without mutating runtime state.
func (c *Client) PreviewRef5Session(ctx context.Context, planID string, input Ref5GenerateInput) (*GeneratedSession, error) {
	return c.generateRef5Session(ctx, planID, Ref5GenerateRequest{Preview: true, Ref5: input})
}

// StartRef5Session persists the immutable snapshot and consumes its first-set
// start event. Repeating the exact same request is server-side idempotent.
func (c *Client) StartRef5Session(ctx context.Context, planID string, input Ref5GenerateInput) (*GeneratedSession, error) {
	return c.generateRef5Session(ctx, planID, Ref5GenerateRequest{Preview: false, Ref5: input})
}

func (c *Client) generateRef5Session(ctx context.Context, planID string, req Ref5GenerateRequest) (*GeneratedSession, error) {
	var out struct {
		Session GeneratedSession `json:"session"`
	}
	if err := c.do(ctx, "POST", "/api/plans/"+url.PathEscape(planID)+"/generate", req, &out); err != nil {
		return nil, err
	}
	return &out.Session, nil
}

// Ref5DirectStandardsKg are the canonical mutable REF5 standards.
type Ref5DirectStandardsKg struct {
	SqH3Kg           Float64 `json:"sqH3Kg"`
	BpFocusKg        Float64 `json:"bpFocusKg"`
	PullFocusTotalKg Float64 `json:"pullFocusTotalKg"`
	DeadliftKg       Float64 `json:"deadliftKg"`
	OhpKg            Float64 `json:"ohpKg"`
}

type Ref5DerivedStandardsKg struct {
	SqH2Kg                  Float64 `json:"sqH2Kg"`
	SqVolumeKg              Float64 `json:"sqVolumeKg"`
	BpVolumeKg              Float64 `json:"bpVolumeKg"`
	PullVolumeTargetTotalKg Float64 `json:"pullVolumeTargetTotalKg"`
}

type Ref5ControlRefsKg struct {
	SqKg        Float64 `json:"sqKg"`
	BpKg        Float64 `json:"bpKg"`
	PullTotalKg Float64 `json:"pullTotalKg"`
	DeadliftKg  Float64 `json:"deadliftKg"`
	OhpKg       Float64 `json:"ohpKg"`
}

type Ref5AuxiliaryCapsKg struct {
	DeadliftMaxKg           Float64 `json:"deadliftMaxKg"`
	OhpMaxKg                Float64 `json:"ohpMaxKg"`
	DeadliftControlRefMaxKg Float64 `json:"deadliftControlRefMaxKg"`
	OhpControlRefMaxKg      Float64 `json:"ohpControlRefMaxKg"`
}

// Ref5SessionDecision is frozen into both the generated and domain snapshots.
type Ref5SessionDecision struct {
	SessionType       string   `json:"sessionType"`
	MicroReasons      []string `json:"microReasons"`
	Focus             string   `json:"focus"`
	SquatPrescription string   `json:"squatPrescription"`
	Hard              struct {
		Allowed          bool    `json:"allowed"`
		LastStartAt      *string `json:"lastStartAt"`
		StartsIn168Hours int     `json:"startsIn168Hours"`
	} `json:"hard"`
}

// Ref5PullPrescriptionMetadata preserves the total-load lock and the actual
// bodyweight-dependent external load used for one PULL prescription.
type Ref5PullPrescriptionMetadata struct {
	TargetTotalKg              Float64  `json:"targetTotalKg"`
	TodayBodyweightKg          Float64  `json:"todayBodyweightKg"`
	Recent7DayMeasurementCount int      `json:"recent7DayMeasurementCount"`
	Recent7DayAverageKg        *Float64 `json:"recent7DayAverageKg"`
	CalculationBodyweightKg    Float64  `json:"calculationBodyweightKg"`
	LockWindowID               string   `json:"lockWindowId"`
	LockedAddedKg              Float64  `json:"lockedAddedKg"`
	ActualTotalKg              Float64  `json:"actualTotalKg"`
}

// Ref5ExerciseMetadata is attached to each generic snapshot exercise.
type Ref5ExerciseMetadata struct {
	ProtocolVersion     string                        `json:"protocolVersion"`
	SnapshotID          string                        `json:"snapshotId"`
	SessionID           string                        `json:"sessionId"`
	PrescriptionID      string                        `json:"prescriptionId"`
	Lift                string                        `json:"lift"`
	Role                string                        `json:"role"`
	Stream              string                        `json:"stream"`
	ProgressionTargetKg Float64                       `json:"progressionTargetKg"`
	Pull                *Ref5PullPrescriptionMetadata `json:"pull"`
}

type Ref5PrescriptionSet struct {
	SetNumber      int     `json:"setNumber"`
	PlannedReps    int     `json:"plannedReps"`
	ExternalLoadKg Float64 `json:"externalLoadKg"`
	TotalLoadKg    Float64 `json:"totalLoadKg"`
}

type Ref5ExercisePrescription struct {
	PrescriptionID      string                        `json:"prescriptionId"`
	Lift                string                        `json:"lift"`
	ExerciseName        string                        `json:"exerciseName"`
	Role                string                        `json:"role"`
	Stream              string                        `json:"stream"`
	Sets                []Ref5PrescriptionSet         `json:"sets"`
	ProgressionTargetKg Float64                       `json:"progressionTargetKg"`
	Pull                *Ref5PullPrescriptionMetadata `json:"pull,omitempty"`
}

type Ref5DomainStartInput struct {
	SessionID                  string   `json:"sessionId"`
	SnapshotID                 string   `json:"snapshotId"`
	ActualStartAt              string   `json:"actualStartAt"`
	TimeZone                   string   `json:"timeZone"`
	TodayBodyweightKg          Float64  `json:"todayBodyweightKg"`
	Recent7DayMeasurementCount int      `json:"recent7DayMeasurementCount"`
	Recent7DayAverageKg        *Float64 `json:"recent7DayAverageKg"`
	ManualMicro                bool     `json:"manualMicro"`
}

// Ref5DomainSnapshot is the engine-native snapshot nested inside snapshot.ref5.
type Ref5DomainSnapshot struct {
	SchemaVersion      int                        `json:"schemaVersion"`
	ProtocolVersion    string                     `json:"protocolVersion"`
	SnapshotID         string                     `json:"snapshotId"`
	SessionID          string                     `json:"sessionId"`
	RuntimeRevision    int                        `json:"runtimeRevision"`
	ActualStartAt      string                     `json:"actualStartAt"`
	TimeZone           string                     `json:"timeZone"`
	CalendarDate       string                     `json:"calendarDate"`
	StartInput         Ref5DomainStartInput       `json:"startInput"`
	Decision           Ref5SessionDecision        `json:"decision"`
	DirectStandardsKg  Ref5DirectStandardsKg      `json:"directStandardsKg"`
	DerivedStandardsKg Ref5DerivedStandardsKg     `json:"derivedStandardsKg"`
	ControlRefsKg      Ref5ControlRefsKg          `json:"controlRefsKg"`
	AuxiliaryCapsKg    Ref5AuxiliaryCapsKg        `json:"auxiliaryCapsKg"`
	PullContext        map[string]any             `json:"pullContext"`
	Exercises          []Ref5ExercisePrescription `json:"exercises"`
	TotalWorkingSets   int                        `json:"totalWorkingSets"`
}

// Ref5SessionMetadata is the REF5-specific immutable portion of a generic
// generated-session snapshot.
type Ref5SessionMetadata struct {
	ProtocolVersion       string                 `json:"protocolVersion"`
	StartCommitted        bool                   `json:"startCommitted"`
	SnapshotID            string                 `json:"snapshotId"`
	SessionID             string                 `json:"sessionId"`
	ActualStartAt         string                 `json:"actualStartAt"`
	Timezone              string                 `json:"timezone"`
	StartEventID          string                 `json:"startEventId"`
	RuntimeRevisionBefore int                    `json:"runtimeRevisionBefore"`
	RuntimeRevisionAfter  int                    `json:"runtimeRevisionAfter"`
	Decision              Ref5SessionDecision    `json:"decision"`
	DirectStandardsKg     Ref5DirectStandardsKg  `json:"directStandardsKg"`
	DerivedStandardsKg    Ref5DerivedStandardsKg `json:"derivedStandardsKg"`
	ControlRefsKg         Ref5ControlRefsKg      `json:"controlRefsKg"`
	AuxiliaryCapsKg       Ref5AuxiliaryCapsKg    `json:"auxiliaryCapsKg"`
	PullContext           map[string]any         `json:"pullContext"`
	DomainSnapshot        Ref5DomainSnapshot     `json:"domainSnapshot"`
}

type Ref5ForcedMicroToken struct {
	EventID                    string   `json:"eventId"`
	SourceFailEventIDs         []string `json:"sourceFailEventIds"`
	CreatedByCompletionEventID string   `json:"createdByCompletionEventId"`
}

type Ref5PendingMicroStatus struct {
	Pending         bool                  `json:"pending"`
	Reasons         []string              `json:"reasons"`
	ForcedToken     *Ref5ForcedMicroToken `json:"forcedToken"`
	StagnationLifts []string              `json:"stagnationLifts"`
}

type Ref5WindowStatus struct {
	Current        int `json:"current"`
	Threshold      int `json:"threshold"`
	VolumeFailures int `json:"volumeFailures"`
	Completed      int `json:"completed"`
}

type Ref5StructureReviewStatus struct {
	Sq   bool `json:"SQ"`
	Bp   bool `json:"BP"`
	Pull bool `json:"PULL"`
	Any  bool `json:"any"`
}

type Ref5PullLockStatus struct {
	WindowID            string  `json:"windowId"`
	FocusTargetTotalKg  Float64 `json:"focusTargetTotalKg"`
	VolumeTargetTotalKg Float64 `json:"volumeTargetTotalKg"`
	FocusAddedKg        Float64 `json:"focusAddedKg"`
	VolumeAddedKg       Float64 `json:"volumeAddedKg"`
}

type Ref5ProgressionChange struct {
	EventID       string   `json:"eventId"`
	Lift          string   `json:"lift"`
	Kind          string   `json:"kind"`
	BeforeKg      Float64  `json:"beforeKg"`
	AfterKg       Float64  `json:"afterKg"`
	CauseEventIDs []string `json:"causeEventIds"`
}

// Ref5Status is the stable, display-oriented status returned by
// /api/plans/:id/progression-state.
type Ref5Status struct {
	SchemaVersion         int                         `json:"schemaVersion"`
	ProtocolVersion       string                      `json:"protocolVersion"`
	Revision              int                         `json:"revision"`
	NextFocus             string                      `json:"nextFocus"`
	NextSquatHard         string                      `json:"nextSquatHard"`
	PendingMicro          Ref5PendingMicroStatus      `json:"pendingMicro"`
	Windows               map[string]Ref5WindowStatus `json:"windows"`
	DirectStandardsKg     Ref5DirectStandardsKg       `json:"directStandardsKg"`
	DerivedStandardsKg    Ref5DerivedStandardsKg      `json:"derivedStandardsKg"`
	ControlRefsKg         Ref5ControlRefsKg           `json:"controlRefsKg"`
	AuxiliaryCapsKg       Ref5AuxiliaryCapsKg         `json:"auxiliaryCapsKg"`
	StructureReview       Ref5StructureReviewStatus   `json:"structureReview"`
	PullLock              *Ref5PullLockStatus         `json:"pullLock"`
	StartedSessionCount   int                         `json:"startedSessionCount"`
	CompletedSessionCount int                         `json:"completedSessionCount"`
	RecentChanges         []Ref5ProgressionChange     `json:"recentChanges"`
}

// PlanProgressionState keeps the full runtime JSON alongside the typed REF5
// status so future engine fields are not lost at this transport boundary.
type PlanProgressionState struct {
	Program    *string         `json:"program"`
	State      json.RawMessage `json:"state"`
	Ref5Status *Ref5Status     `json:"ref5Status"`
}

func (c *Client) PlanProgressionState(ctx context.Context, planID string) (*PlanProgressionState, error) {
	var out PlanProgressionState
	path := "/api/plans/" + url.PathEscape(planID) + "/progression-state"
	if err := c.do(ctx, "GET", path, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Ref5PlanStatus fetches the typed REF5 status for a plan. It returns nil when
// the server reports a non-REF5/no-progression plan.
func (c *Client) Ref5PlanStatus(ctx context.Context, planID string) (*Ref5Status, error) {
	state, err := c.PlanProgressionState(ctx, planID)
	if err != nil {
		return nil, err
	}
	return state.Ref5Status, nil
}
