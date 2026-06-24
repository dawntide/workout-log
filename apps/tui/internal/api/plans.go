package api

import "context"

// Plan is a user's training plan.
type Plan struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Type            string `json:"type"`
	BaseProgramName string `json:"baseProgramName"`
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
	ExerciseName string       `json:"exerciseName"`
	Role         string       `json:"role"`
	Sets         []PlannedSet `json:"sets"`
}

// SessionSnapshot is the materialized planned session.
type SessionSnapshot struct {
	Exercises []PlannedExercise `json:"exercises"`
}

// GeneratedSession wraps the snapshot returned by POST /api/plans/[id]/generate.
type GeneratedSession struct {
	Snapshot SessionSnapshot `json:"snapshot"`
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
