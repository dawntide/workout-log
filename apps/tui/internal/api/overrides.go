package api

import "context"

// OverrideSet is one prescribed set in an ADD_ACCESSORY override.
type OverrideSet struct {
	Reps     int     `json:"reps,omitempty"`
	WeightKg float64 `json:"weightKg"`
	RPE      int     `json:"rpe,omitempty"`
}

// AddAccessory creates a SESSION-scoped ADD_ACCESSORY override: a recurring
// accessory exercise appended to the given session (POST /api/plans/[id]/overrides).
func (c *Client) AddAccessory(ctx context.Context, planID, sessionKey, exerciseName string, sets []OverrideSet) error {
	body := map[string]any{
		"scope":      "SESSION",
		"sessionKey": sessionKey,
		"patch": map[string]any{
			"op":    "ADD_ACCESSORY",
			"value": map[string]any{"exerciseName": exerciseName, "sets": sets, "order": 99},
		},
		"note": "ironlog 보강",
	}
	return c.do(ctx, "POST", "/api/plans/"+planID+"/overrides", body, nil)
}

// ReplaceExercise creates a SESSION-scoped REPLACE_EXERCISE override: swaps the
// main lift of a block target for another exercise in the given session.
func (c *Client) ReplaceExercise(ctx context.Context, planID, sessionKey, blockTarget, exerciseName string) error {
	body := map[string]any{
		"scope":      "SESSION",
		"sessionKey": sessionKey,
		"patch": map[string]any{
			"op":     "REPLACE_EXERCISE",
			"target": map[string]any{"blockTarget": blockTarget},
			"value":  map[string]any{"exerciseName": exerciseName},
		},
		"note": "ironlog 교체",
	}
	return c.do(ctx, "POST", "/api/plans/"+planID+"/overrides", body, nil)
}
