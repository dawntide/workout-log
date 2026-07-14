package api

import (
	"bytes"
	"encoding/json"
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
//
// REF5 stores its immutable prescription and completion identity below ref5.
// Extra retains every other JSONB member verbatim. This is deliberate: a TUI
// read/edit/save cycle must not discard metadata owned by a program engine it
// does not understand yet.
type SetMeta struct {
	BodyweightKg    Float64                    `json:"bodyweightKg,omitempty"`
	TotalLoadKg     Float64                    `json:"totalLoadKg,omitempty"`
	Ref5            map[string]any             `json:"ref5,omitempty"`
	Extra           map[string]json.RawMessage `json:"-"`
	hasBodyweightKg bool
	hasTotalLoadKg  bool
	hasRef5         bool
}

// UnmarshalJSON decodes the fields consumed directly by the TUI while keeping
// all other JSONB members available for a lossless round trip.
func (m *SetMeta) UnmarshalJSON(data []byte) error {
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		*m = SetMeta{}
		return nil
	}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}

	var next SetMeta
	if raw, ok := fields["bodyweightKg"]; ok {
		next.hasBodyweightKg = true
		if err := json.Unmarshal(raw, &next.BodyweightKg); err != nil {
			return err
		}
		delete(fields, "bodyweightKg")
	}
	if raw, ok := fields["totalLoadKg"]; ok {
		next.hasTotalLoadKg = true
		if err := json.Unmarshal(raw, &next.TotalLoadKg); err != nil {
			return err
		}
		delete(fields, "totalLoadKg")
	}
	if raw, ok := fields["ref5"]; ok {
		next.hasRef5 = true
		if !bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			if err := json.Unmarshal(raw, &next.Ref5); err != nil {
				return err
			}
		}
		delete(fields, "ref5")
	}
	if len(fields) > 0 {
		next.Extra = fields
	}
	*m = next
	return nil
}

// MarshalJSON merges the known fields back into the untouched JSONB members.
func (m SetMeta) MarshalJSON() ([]byte, error) {
	fields := make(map[string]json.RawMessage, len(m.Extra)+3)
	for key, value := range m.Extra {
		fields[key] = append(json.RawMessage(nil), value...)
	}
	if m.hasBodyweightKg || m.BodyweightKg != 0 {
		raw, err := json.Marshal(m.BodyweightKg)
		if err != nil {
			return nil, err
		}
		fields["bodyweightKg"] = raw
	}
	if m.hasTotalLoadKg || m.TotalLoadKg != 0 {
		raw, err := json.Marshal(m.TotalLoadKg)
		if err != nil {
			return nil, err
		}
		fields["totalLoadKg"] = raw
	}
	if m.hasRef5 || m.Ref5 != nil {
		raw, err := json.Marshal(m.Ref5)
		if err != nil {
			return nil, err
		}
		fields["ref5"] = raw
	}
	return json.Marshal(fields)
}

// WorkoutSet is one logged set (also used as the create-log request element).
type WorkoutSet struct {
	ExerciseID   string   `json:"exerciseId,omitempty"`
	ExerciseName string   `json:"exerciseName"`
	SortOrder    int      `json:"sortOrder,omitempty"`
	SetNumber    int      `json:"setNumber,omitempty"`
	Reps         int      `json:"reps"`
	WeightKg     float64  `json:"weightKg"`
	RPE          *int     `json:"rpe,omitempty"`
	IsExtra      bool     `json:"isExtra,omitempty"`
	Meta         *SetMeta `json:"meta,omitempty"`
}

// LoggedSet is one set within a workout log.
type LoggedSet struct {
	ID           string   `json:"id,omitempty"`
	ExerciseID   *string  `json:"exerciseId,omitempty"`
	ExerciseName string   `json:"exerciseName"`
	SortOrder    int      `json:"sortOrder,omitempty"`
	SetNumber    int      `json:"setNumber,omitempty"`
	WeightKg     Float64  `json:"weightKg"`
	Reps         int      `json:"reps"`
	RPE          *int     `json:"rpe,omitempty"`
	IsExtra      bool     `json:"isExtra,omitempty"`
	Meta         *SetMeta `json:"meta,omitempty"`
}

// GeneratedSessionRef is the session-key reference embedded in a log item
// (present when includeGeneratedSession is on, which is the API default).
type GeneratedSessionRef struct {
	ID         string `json:"id"`
	SessionKey string `json:"sessionKey"`
}

// LogItem is one workout session in a list response.
type LogItem struct {
	ID                 string               `json:"id"`
	PlanID             *string              `json:"planId"`
	GeneratedSessionID *string              `json:"generatedSessionId"`
	PerformedAt        time.Time            `json:"performedAt"`
	DurationMinutes    *int                 `json:"durationMinutes,omitempty"`
	Notes              *string              `json:"notes,omitempty"`
	Tags               []string             `json:"tags,omitempty"`
	Sets               []LoggedSet          `json:"sets"`
	GeneratedSession   *GeneratedSessionRef `json:"generatedSession"`
}

// CreateLogRequest is the POST /api/logs body.
type CreateLogRequest struct {
	PlanID             string       `json:"planId,omitempty"`
	GeneratedSessionID string       `json:"generatedSessionId,omitempty"`
	ClientMutationID   string       `json:"clientMutationId,omitempty"`
	Sets               []WorkoutSet `json:"sets"`
	PerformedAt        time.Time    `json:"performedAt"`
	Timezone           string       `json:"timezone,omitempty"`
	DurationMinutes    *int         `json:"durationMinutes,omitempty"`
	Notes              string       `json:"notes,omitempty"`
	Tags               []string     `json:"tags,omitempty"`
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
	ID                 string            `json:"id"`
	PlanID             *string           `json:"planId"`
	GeneratedSessionID *string           `json:"generatedSessionId"`
	PerformedAt        time.Time         `json:"performedAt"`
	DurationMinutes    *int              `json:"durationMinutes,omitempty"`
	Notes              *string           `json:"notes,omitempty"`
	Tags               []string          `json:"tags,omitempty"`
	Sets               []LoggedSet       `json:"sets"`
	GeneratedSession   *GeneratedSession `json:"generatedSession"`
	PersonalRecords    []PersonalRecord  `json:"personalRecords"`
}
