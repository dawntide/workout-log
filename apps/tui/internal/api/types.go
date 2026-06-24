package api

import (
	"encoding/json"
	"time"
)

// User is the authenticated account as returned by /api/auth/*.
type User struct {
	ID              string     `json:"id"`
	Email           string     `json:"email"`
	DisplayName     string     `json:"displayName"`
	EmailVerifiedAt *time.Time `json:"emailVerifiedAt"`
	// Fallback is true when the server authenticated via the WORKOUT_AUTH_USER_ID
	// dev env var rather than a real cookie session.
	Fallback bool `json:"fallback"`
}

// LogItem is one workout session. Sets are kept raw for the auth spike; the
// hero logging view (A4) decodes them once the real set shape is exercised
// (weightKg may arrive as a numeric string from Postgres).
type LogItem struct {
	ID          string          `json:"id"`
	PlanID      *string         `json:"planId"`
	PerformedAt time.Time       `json:"performedAt"`
	Sets        json.RawMessage `json:"sets"`
}
