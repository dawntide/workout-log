package api

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"time"
)

// BodyweightEntry is one recorded measurement.
type BodyweightEntry struct {
	ID         string  `json:"id"`
	ValueKg    float64 `json:"valueKg"`
	MeasuredAt string  `json:"measuredAt"`
}

// Bodyweight lists recorded measurements, newest first.
//
// ⚠️ 설정의 `prefs.bodyweight.kg`와는 **다른 것**이다. 그쪽은 "오늘 체중" 단일값이고
// 이쪽이 이력이다 — 강도 점수·asymptote 모니터가 세션 시점 체중을 여기서 찾는다.
// 설정만 고치면 과거 세션의 배율은 그대로 틀린 채 남는다.
func (c *Client) Bodyweight(ctx context.Context, days int) ([]BodyweightEntry, error) {
	q := url.Values{}
	if days > 0 {
		q.Set("days", strconv.Itoa(days))
	}
	path := "/api/bodyweight"
	if enc := q.Encode(); enc != "" {
		path += "?" + enc
	}
	var out struct {
		Items []BodyweightEntry `json:"items"`
	}
	if err := c.do(ctx, "GET", path, nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// RecordBodyweight stores a measurement. 같은 시각이면 서버가 덮어쓴다.
func (c *Client) RecordBodyweight(ctx context.Context, valueKg float64, at time.Time) (*BodyweightEntry, error) {
	body := map[string]any{
		"valueKg":    valueKg,
		"measuredAt": at.UTC().Format(time.RFC3339),
	}
	var out struct {
		Item BodyweightEntry `json:"item"`
	}
	if err := c.do(ctx, "POST", "/api/bodyweight", body, &out); err != nil {
		return nil, fmt.Errorf("record bodyweight: %w", err)
	}
	return &out.Item, nil
}
