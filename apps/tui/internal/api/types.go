package api

import (
	"strconv"
	"strings"
	"time"
)

// Float64 tolerates JSON numbers that arrive as either bare numbers or strings
// (Postgres numeric columns serialize as strings via node-postgres).
type Float64 float64

func (f *Float64) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), `"`)
	if s == "" || s == "null" {
		*f = 0
		return nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return err
	}
	*f = Float64(v)
	return nil
}

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

// SetMeta is the per-set JSONB meta. For bodyweight exercises it carries the
// user's bodyweight and the bodyweight-inclusive total load, so the external
// added weight (weightKg) and the total can both be reconstructed.
type SetMeta struct {
	BodyweightKg Float64 `json:"bodyweightKg,omitempty"`
	TotalLoadKg  Float64 `json:"totalLoadKg,omitempty"`
}

// WorkoutSet is one logged set (also used as the create-log request element).
type WorkoutSet struct {
	ExerciseID   string   `json:"exerciseId,omitempty"`
	ExerciseName string   `json:"exerciseName"`
	SetNumber    int      `json:"setNumber,omitempty"`
	Reps         int      `json:"reps"`
	WeightKg     float64  `json:"weightKg"`
	RPE          *int     `json:"rpe,omitempty"`
	IsExtra      bool     `json:"isExtra,omitempty"`
	Meta         *SetMeta `json:"meta,omitempty"`
}

// LoggedSet is one set within a workout log.
type LoggedSet struct {
	ExerciseName string   `json:"exerciseName"`
	WeightKg     Float64  `json:"weightKg"`
	Reps         int      `json:"reps"`
	RPE          *int     `json:"rpe,omitempty"`
	Meta         *SetMeta `json:"meta,omitempty"`
}

// GeneratedSessionRef is the session-key reference embedded in a log item
// (present when includeGeneratedSession is on, which is the API default).
type GeneratedSessionRef struct {
	SessionKey string `json:"sessionKey"`
}

// LogItem is one workout session in a list response.
type LogItem struct {
	ID               string               `json:"id"`
	PlanID           *string              `json:"planId"`
	PerformedAt      time.Time            `json:"performedAt"`
	Sets             []LoggedSet          `json:"sets"`
	GeneratedSession *GeneratedSessionRef `json:"generatedSession"`
}

// CreateLogRequest is the POST /api/logs body.
type CreateLogRequest struct {
	Sets        []WorkoutSet `json:"sets"`
	PerformedAt time.Time    `json:"performedAt"`
	Timezone    string       `json:"timezone,omitempty"`
	Notes       string       `json:"notes,omitempty"`
}

// PersonalRecord is a server-detected PR (Epley e1RM) returned on log create.
type PersonalRecord struct {
	ExerciseName string  `json:"exerciseName"`
	TopWeightKg  Float64 `json:"topWeightKg"`
	TopReps      int     `json:"topReps"`
	EstOneRm     Float64 `json:"estOneRm"`
	DeltaE1rm    Float64 `json:"deltaE1rm"`
}

// LogDetail is the GET /api/logs/[id] item, including server-detected PRs.
type LogDetail struct {
	ID              string           `json:"id"`
	PersonalRecords []PersonalRecord `json:"personalRecords"`
}
