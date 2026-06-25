package api

import (
	"testing"
	"time"
)

func tm(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t
}

func ptm(s string) *time.Time {
	t := tm(s)
	return &t
}

func TestActivePlan(t *testing.T) {
	tests := []struct {
		name   string
		plans  []Plan
		wantID string
		wantOK bool
	}{
		{
			name:   "empty list has no active plan",
			plans:  nil,
			wantOK: false,
		},
		{
			name: "all archived has no active plan",
			plans: []Plan{
				{ID: "a", IsArchived: true, CreatedAt: tm("2026-01-01T00:00:00Z")},
			},
			wantOK: false,
		},
		{
			name:   "single active plan wins",
			plans:  []Plan{{ID: "a", CreatedAt: tm("2026-01-01T00:00:00Z")}},
			wantID: "a",
			wantOK: true,
		},
		{
			name: "most recently performed wins over older performance",
			plans: []Plan{
				{ID: "old", LastPerformedAt: ptm("2026-06-01T00:00:00Z"), CreatedAt: tm("2026-01-01T00:00:00Z")},
				{ID: "recent", LastPerformedAt: ptm("2026-06-20T00:00:00Z"), CreatedAt: tm("2026-01-01T00:00:00Z")},
			},
			wantID: "recent",
			wantOK: true,
		},
		{
			name: "a performed plan beats a newer never-performed plan",
			plans: []Plan{
				{ID: "never", CreatedAt: tm("2026-06-25T00:00:00Z")}, // newer but never performed
				{ID: "performed", LastPerformedAt: ptm("2026-06-01T00:00:00Z"), CreatedAt: tm("2026-01-01T00:00:00Z")},
			},
			wantID: "performed",
			wantOK: true,
		},
		{
			name: "with no performance the newest created wins",
			plans: []Plan{
				{ID: "older", CreatedAt: tm("2026-01-01T00:00:00Z")},
				{ID: "newer", CreatedAt: tm("2026-06-01T00:00:00Z")},
			},
			wantID: "newer",
			wantOK: true,
		},
		{
			name: "archived is excluded even if most recently performed",
			plans: []Plan{
				{ID: "archived", LastPerformedAt: ptm("2026-06-25T00:00:00Z"), CreatedAt: tm("2026-06-25T00:00:00Z"), IsArchived: true},
				{ID: "active", LastPerformedAt: ptm("2026-06-01T00:00:00Z"), CreatedAt: tm("2026-01-01T00:00:00Z")},
			},
			wantID: "active",
			wantOK: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := ActivePlan(tt.plans)
			if ok != tt.wantOK {
				t.Fatalf("ActivePlan ok = %v, want %v", ok, tt.wantOK)
			}
			if ok && got.ID != tt.wantID {
				t.Errorf("ActivePlan ID = %q, want %q", got.ID, tt.wantID)
			}
		})
	}
}
