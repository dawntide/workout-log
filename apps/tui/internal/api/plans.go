package api

import (
	"context"
	"net/url"
	"strings"
	"time"
)

const (
	Ref5TemplateSlug    = "ref5-adaptive-strength"
	Ref5ProgramFamily   = "ref5"
	Ref5ProtocolVersion = "1.2"
)

// Plan is a user's training plan.
type Plan struct {
	ID                   string         `json:"id"`
	UserID               string         `json:"userId,omitempty"`
	Name                 string         `json:"name"`
	Type                 string         `json:"type"`
	RootProgramVersionID *string        `json:"rootProgramVersionId"`
	Params               map[string]any `json:"params"`
	BaseProgramName      string         `json:"baseProgramName"`
	IsArchived           bool           `json:"isArchived"`
	LastPerformedAt      *time.Time     `json:"lastPerformedAt"`
	CreatedAt            time.Time      `json:"createdAt"`
	UpdatedAt            *time.Time     `json:"updatedAt,omitempty"`
}

// IsRef5 reports whether the plan carries the independent REF5 family marker
// or its immutable, versioned parameter block.
func (p Plan) IsRef5() bool {
	return IsRef5PlanParams(p.Params)
}

// IsRef5PlanParams mirrors the server's family/parameter detection without
// coupling callers to the concrete JSON representation of versioned params.
func IsRef5PlanParams(params map[string]any) bool {
	if strings.EqualFold(strings.TrimSpace(stringValue(params["programFamily"])), Ref5ProgramFamily) {
		return true
	}
	ref5, ok := params["ref5"].(map[string]any)
	return ok && len(ref5) > 0
}

// ActivePlan picks today's working plan from a plan list, mirroring the web
// bootstrap (home-service resolveHighlightedPlan): among non-archived plans,
// prefer the most recently performed, then the most recently created. A plan
// performed today naturally wins on lastPerformedAt, so the "logged today"
// rule folds into this ordering. Returns false when no active plan exists.
func ActivePlan(plans []Plan) (Plan, bool) {
	var best Plan
	found := false
	for _, p := range plans {
		if p.IsArchived {
			continue
		}
		if !found || morePreferredPlan(p, best) {
			best, found = p, true
		}
	}
	return best, found
}

// morePreferredPlan reports whether a should rank above b: more recent
// lastPerformedAt wins (a plan with any performance beats one without), then
// more recent createdAt breaks ties.
func morePreferredPlan(a, b Plan) bool {
	at, bt := timeOrZero(a.LastPerformedAt), timeOrZero(b.LastPerformedAt)
	if !at.Equal(bt) {
		return at.After(bt)
	}
	return a.CreatedAt.After(b.CreatedAt)
}

func timeOrZero(t *time.Time) time.Time {
	if t == nil {
		return time.Time{}
	}
	return *t
}

// Plans lists the user's plans.
func (c *Client) Plans(ctx context.Context) ([]Plan, error) {
	var out struct {
		Items []Plan `json:"items"`
	}
	if err := c.do(ctx, "GET", "/api/plans", nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// RenamePlan changes a plan's name (empty name is rejected with 400).
func (c *Client) RenamePlan(ctx context.Context, id, name string) error {
	return c.do(ctx, "PATCH", "/api/plans/"+id, map[string]string{"name": name}, nil)
}

// DeletePlan removes a plan and its logs.
func (c *Client) DeletePlan(ctx context.Context, id string) error {
	return c.do(ctx, "DELETE", "/api/plans/"+id, nil, nil)
}

// TemplateVersion is the complete latest version embedded by GET /api/templates.
// Definition and Defaults remain open JSON because program engines own their
// versioned shapes.
type TemplateVersion struct {
	ID              string         `json:"id"`
	TemplateID      string         `json:"templateId,omitempty"`
	Version         int            `json:"version,omitempty"`
	Changelog       *string        `json:"changelog,omitempty"`
	ParentVersionID *string        `json:"parentVersionId,omitempty"`
	Definition      map[string]any `json:"definition"`
	Defaults        map[string]any `json:"defaults"`
	IsDeprecated    bool           `json:"isDeprecated,omitempty"`
	CreatedAt       *time.Time     `json:"createdAt,omitempty"`
}

// Template is a program template from the store.
type Template struct {
	ID               string           `json:"id"`
	Slug             string           `json:"slug"`
	Name             string           `json:"name"`
	Type             string           `json:"type"` // LOGIC | MANUAL
	Visibility       string           `json:"visibility,omitempty"`
	OwnerUserID      *string          `json:"ownerUserId,omitempty"`
	ParentTemplateID *string          `json:"parentTemplateId,omitempty"`
	Description      *string          `json:"description,omitempty"`
	Tags             []string         `json:"tags,omitempty"`
	CreatedAt        *time.Time       `json:"createdAt,omitempty"`
	UpdatedAt        *time.Time       `json:"updatedAt,omitempty"`
	LatestVersion    *TemplateVersion `json:"latestVersion"`
}

// IsRef5 recognizes the stable public slug as well as definition markers so a
// renamed/private representation cannot accidentally enter a generic flow.
func (t Template) IsRef5() bool {
	if strings.EqualFold(strings.TrimSpace(t.Slug), Ref5TemplateSlug) {
		return true
	}
	if t.LatestVersion == nil {
		return false
	}
	definition := t.LatestVersion.Definition
	return strings.EqualFold(strings.TrimSpace(stringValue(definition["kind"])), Ref5ProgramFamily) ||
		strings.EqualFold(strings.TrimSpace(stringValue(definition["family"])), Ref5ProgramFamily)
}

// Templates lists program templates (public + the user's private).
func (c *Client) Templates(ctx context.Context) ([]Template, error) {
	var out struct {
		Items []Template `json:"items"`
	}
	if err := c.do(ctx, "GET", "/api/templates?limit=100", nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// CreatePlanRequest creates a SINGLE/MANUAL plan from a program version.
type CreatePlanRequest struct {
	Name                 string         `json:"name"`
	Type                 string         `json:"type"`
	RootProgramVersionID string         `json:"rootProgramVersionId"`
	Params               map[string]any `json:"params,omitempty"`
}

// CreatePlan creates a plan from a program version.
func (c *Client) CreatePlan(ctx context.Context, req CreatePlanRequest) error {
	return c.do(ctx, "POST", "/api/plans", req, nil)
}

// PlannedSet is one prescribed set in a generated session snapshot.
type PlannedSet struct {
	SetNumber      int      `json:"setNumber,omitempty"`
	Reps           int      `json:"reps"`
	TargetWeightKg Float64  `json:"targetWeightKg"`
	Amrap          bool     `json:"amrap,omitempty"`
	PlannedReps    int      `json:"plannedReps,omitempty"`
	ExternalLoadKg Float64  `json:"externalLoadKg,omitempty"`
	TotalLoadKg    Float64  `json:"totalLoadKg,omitempty"`
	Note           string   `json:"note,omitempty"`
	Meta           *SetMeta `json:"meta,omitempty"`
}

// PlannedExercise is one exercise in a generated session snapshot.
type PlannedExercise struct {
	ExerciseID         *string               `json:"exerciseId,omitempty"`
	ExerciseName       string                `json:"exerciseName"`
	Role               string                `json:"role"` // MAIN | ASSIST | ...
	RowType            string                `json:"rowType,omitempty"`
	Order              int                   `json:"order,omitempty"`
	ProgressionTarget  string                `json:"progressionTarget,omitempty"`
	ProgressionKey     string                `json:"progressionKey,omitempty"`
	EnforcePlannedReps bool                  `json:"enforcePlannedReps,omitempty"`
	SourceBlockTarget  string                `json:"sourceBlockTarget"` // e.g. "SQUAT" — for REPLACE_EXERCISE overrides
	Ref5               *Ref5ExerciseMetadata `json:"ref5,omitempty"`
	Sets               []PlannedSet          `json:"sets"`
}

// SnapshotPlan is the plan identity carried inside a session snapshot.
type SnapshotPlan struct {
	ID   string `json:"id,omitempty"`
	Type string `json:"type,omitempty"`
	Name string `json:"name"`
}

// SnapshotProgram is the immutable program identity embedded in a generated
// session. REF5 uses Kind/Family/ProtocolVersion instead of a generic cycle.
type SnapshotProgram struct {
	Slug            string `json:"slug,omitempty"`
	Name            string `json:"name,omitempty"`
	Type            string `json:"type,omitempty"`
	Version         int    `json:"version,omitempty"`
	Kind            string `json:"kind,omitempty"`
	Family          string `json:"family,omitempty"`
	ProtocolVersion string `json:"protocolVersion,omitempty"`
}

// SessionSnapshot is the materialized planned session.
type SessionSnapshot struct {
	SchemaVersion    int                  `json:"schemaVersion,omitempty"`
	ProtocolVersion  string               `json:"protocolVersion,omitempty"`
	SessionKey       string               `json:"sessionKey"`
	SessionDate      string               `json:"sessionDate,omitempty"`
	Timezone         string               `json:"timezone,omitempty"`
	ActualStartAt    string               `json:"actualStartAt,omitempty"`
	SessionType      string               `json:"sessionType,omitempty"`
	TotalWorkingSets int                  `json:"totalWorkingSets,omitempty"`
	Plan             SnapshotPlan         `json:"plan"`
	Program          SnapshotProgram      `json:"program,omitempty"`
	Ref5             *Ref5SessionMetadata `json:"ref5,omitempty"`
	Exercises        []PlannedExercise    `json:"exercises"`
	// v0.5.1 세션 수준 피드백 메타(서버 승격) — today 헤더 태그의 근거.
	AmrapDeferred  bool `json:"amrapDeferred"`  // 연속일로 오늘 AMRAP 보류됨
	LightBlockMode bool `json:"lightBlockMode"` // 라이트(회복) 블록 계수로 처방됨
}

// IsRef5 recognizes both the REF5 metadata block and immutable program markers.
func (s SessionSnapshot) IsRef5() bool {
	if s.Ref5 != nil && strings.EqualFold(strings.TrimSpace(s.Ref5.ProtocolVersion), Ref5ProtocolVersion) {
		return true
	}
	protocolVersion := strings.TrimSpace(s.ProtocolVersion)
	return strings.EqualFold(protocolVersion, Ref5ProtocolVersion) ||
		strings.EqualFold(strings.TrimSpace(s.Program.Slug), Ref5TemplateSlug) ||
		strings.EqualFold(strings.TrimSpace(s.Program.Family), Ref5ProgramFamily) ||
		strings.EqualFold(strings.TrimSpace(s.Program.Kind), Ref5ProgramFamily)
}

// GeneratedSession wraps the saved session row returned by POST
// /api/plans/[id]/generate ({session}). SessionKey (e.g. "C2W6D1") is the
// top-level key; the snapshot also carries it plus the plan name.
type GeneratedSession struct {
	ID          string          `json:"id"`
	PlanID      string          `json:"planId"`
	UserID      string          `json:"userId,omitempty"`
	SessionKey  string          `json:"sessionKey"`
	ScheduledAt *time.Time      `json:"scheduledAt,omitempty"`
	Status      string          `json:"status,omitempty"`
	Snapshot    SessionSnapshot `json:"snapshot"`
	CreatedAt   *time.Time      `json:"createdAt,omitempty"`
	UpdatedAt   *time.Time      `json:"updatedAt,omitempty"`
}

// GenerateSession generates (and saves) today's session for a plan.
func (c *Client) GenerateSession(ctx context.Context, planID string) (*GeneratedSession, error) {
	var out struct {
		Session GeneratedSession `json:"session"`
	}
	if err := c.do(ctx, "POST", "/api/plans/"+planID+"/generate", map[string]any{}, &out); err != nil {
		return nil, err
	}
	return &out.Session, nil
}

// ResumeGeneratedSession reloads one explicitly started immutable session.
func (c *Client) ResumeGeneratedSession(ctx context.Context, planID, sessionID string) (*GeneratedSession, error) {
	var out struct {
		Session GeneratedSession `json:"session"`
	}
	path := "/api/plans/" + url.PathEscape(planID) + "/generated-sessions/" + url.PathEscape(sessionID)
	if err := c.do(ctx, "GET", path, nil, &out); err != nil {
		return nil, err
	}
	return &out.Session, nil
}

// ListGeneratedSessions returns the most recent generated sessions with their
// snapshots. It is used to resume a started REF5 session in another process.
func (c *Client) ListGeneratedSessions(ctx context.Context, planID string) ([]GeneratedSession, error) {
	query := url.Values{}
	query.Set("planId", planID)
	query.Set("includeSnapshot", "1")
	query.Set("limit", "100")
	var out struct {
		Items []GeneratedSession `json:"items"`
	}
	if err := c.do(ctx, "GET", "/api/generated-sessions?"+query.Encode(), nil, &out); err != nil {
		return nil, err
	}
	// The collection endpoint omits planId because it is already the filter.
	for i := range out.Items {
		if out.Items[i].PlanID == "" {
			out.Items[i].PlanID = planID
		}
	}
	return out.Items, nil
}

func stringValue(value any) string {
	valueString, _ := value.(string)
	return valueString
}
