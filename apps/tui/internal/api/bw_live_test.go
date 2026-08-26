package api

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestLiveBodyweightRoundTrip(t *testing.T) {
	base := os.Getenv("IRONLOG_SPIKE_URL")
	if base == "" {
		t.Skip("set IRONLOG_SPIKE_URL")
	}
	c, err := New(base)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	before, err := c.Bodyweight(ctx, 365)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Now()
	saved, err := c.RecordBodyweight(ctx, 73.4, at)
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	t.Logf("기록: %.1fkg @ %s (id %s)", saved.ValueKg, saved.MeasuredAt, saved.ID[:8])
	after, err := c.Bodyweight(ctx, 365)
	if err != nil {
		t.Fatal(err)
	}
	if len(after) <= len(before) {
		t.Fatalf("기록이 늘지 않았다: %d → %d", len(before), len(after))
	}
	if after[0].ValueKg != 73.4 {
		t.Fatalf("최신순이 아니거나 값이 다르다: %+v", after[0])
	}
	t.Logf("조회: %d건, 최신 %.1fkg", len(after), after[0].ValueKg)
}
