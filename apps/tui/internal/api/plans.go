package api

import (
	"context"
	"time"
)

// Plan is a user's training plan.
type Plan struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	Type            string     `json:"type"`
	BaseProgramName string     `json:"baseProgramName"`
	IsArchived      bool       `json:"isArchived"`
	LastPerformedAt *time.Time `json:"lastPerformedAt"`
	CreatedAt       time.Time  `json:"createdAt"`
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

// Template is a program template from the store.
type Template struct {
	ID            string `json:"id"`
	Slug          string `json:"slug"`
	Name          string `json:"name"`
	Type          string `json:"type"` // LOGIC | MANUAL
	LatestVersion *struct {
		ID string `json:"id"`
	} `json:"latestVersion"`
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
	Name                 string `json:"name"`
	Type                 string `json:"type"`
	RootProgramVersionID string `json:"rootProgramVersionId"`
}

// CreatePlan creates a plan from a program version.
func (c *Client) CreatePlan(ctx context.Context, req CreatePlanRequest) error {
	return c.do(ctx, "POST", "/api/plans", req, nil)
}

// PlannedSet is one prescribed set in a generated session snapshot.
type PlannedSet struct {
	Reps           int     `json:"reps"`
	TargetWeightKg Float64 `json:"targetWeightKg"`
}

// PlannedExercise is one exercise in a generated session snapshot.
type PlannedExercise struct {
	ExerciseName      string       `json:"exerciseName"`
	Role              string       `json:"role"`              // MAIN | ASSIST | ...
	SourceBlockTarget string       `json:"sourceBlockTarget"` // e.g. "SQUAT" — for REPLACE_EXERCISE overrides
	Sets              []PlannedSet `json:"sets"`
}

// SnapshotPlan is the plan identity carried inside a session snapshot.
type SnapshotPlan struct {
	Name string `json:"name"`
}

// SessionSnapshot is the materialized planned session.
type SessionSnapshot struct {
	SessionKey string            `json:"sessionKey"`
	Plan       SnapshotPlan      `json:"plan"`
	Exercises  []PlannedExercise `json:"exercises"`
}

// GeneratedSession wraps the saved session row returned by POST
// /api/plans/[id]/generate ({session}). SessionKey (e.g. "C2W6D1") is the
// top-level key; the snapshot also carries it plus the plan name.
type GeneratedSession struct {
	SessionKey string          `json:"sessionKey"`
	Snapshot   SessionSnapshot `json:"snapshot"`
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
