package api

import "context"

// MuscleFreshnessContribution is one session that still weighs on a group.
type MuscleFreshnessContribution struct {
	LogID       string  `json:"logId"`
	PerformedAt string  `json:"performedAt"`
	LoadKg      float64 `json:"loadKg"`
	Decay       float64 `json:"decay"`
	Fatigue     float64 `json:"fatigue"`
}

// MuscleFreshnessGroup is one muscle group's estimate.
//
// ⚠️ `FreshnessPct == 100`은 두 가지 뜻이다 — **`CapacityKg`로 갈라야 한다.**
// 0이면 "회복 완료"가 아니라 그 창에서 한 번도 안 쓴 부위다(기록 없음).
type MuscleFreshnessGroup struct {
	MuscleGroup   string                        `json:"muscleGroup"`
	FreshnessPct  int                           `json:"freshnessPct"`
	Fatigue       float64                       `json:"fatigue"`
	CapacityKg    float64                       `json:"capacityKg"`
	Contributions []MuscleFreshnessContribution `json:"contributions"`
}

// HasRecord reports whether the group was trained inside the capacity window.
func (g MuscleFreshnessGroup) HasRecord() bool { return g.CapacityKg > 0 }

// MuscleFreshness is the deterministic decay model's output.
type MuscleFreshness struct {
	Now           string                 `json:"now"`
	RecoveryHours int                    `json:"recoveryHours"`
	CapacityWeeks int                    `json:"capacityWeeks"`
	Groups        []MuscleFreshnessGroup `json:"groups"`
	OtherSetShare float64                `json:"otherSetShare"`
}

// MuscleFreshness fetches per-group recovery estimates.
func (c *Client) MuscleFreshness(ctx context.Context) (*MuscleFreshness, error) {
	var out MuscleFreshness
	if err := c.do(ctx, "GET", "/api/stats/muscle-freshness", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
