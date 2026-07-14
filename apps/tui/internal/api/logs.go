package api

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// ListLogsParams are the query filters for GET /api/logs.
type ListLogsParams struct {
	Date     string // YYYY-MM-DD (optional)
	Timezone string // IANA zone (optional)
	PlanID   string // owning plan id (optional)
	Limit    int    // 1..100 (optional)
}

// ListLogs fetches recent workout logs for the authenticated user.
func (c *Client) ListLogs(ctx context.Context, p ListLogsParams) ([]LogItem, error) {
	q := url.Values{}
	if p.Date != "" {
		q.Set("date", p.Date)
	}
	if p.Timezone != "" {
		q.Set("timezone", p.Timezone)
	}
	if p.PlanID != "" {
		q.Set("planId", p.PlanID)
	}
	if p.Limit > 0 {
		q.Set("limit", strconv.Itoa(p.Limit))
	}
	path := "/api/logs"
	if len(q) > 0 {
		path += "?" + q.Encode()
	}

	var out struct {
		Items []LogItem `json:"items"`
	}
	if err := c.do(ctx, "GET", path, nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// FeedbackBanner is a server-assembled notice (title+body) — e.g. the asymptote
// early-deload banner. Copy is composed server-side (core feedback-catalog) so
// web and TUI show identical wording; render as-is, no re-formatting.
type FeedbackBanner struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

// ProgressReportRow is one judgment line ("스쿼트 +2.5 (6연속 성공)" …).
type ProgressReportRow struct {
	Target string `json:"target"`
	Text   string `json:"text"`
}

// ProgressReport is the server-assembled progression judgment card (block-end
// TM changes, freezes, GZCLP stage moves …). nil when the event is noise.
type ProgressReport struct {
	EventID string              `json:"eventId"`
	Title   string              `json:"title"`
	Rows    []ProgressReportRow `json:"rows"`
}

// ProgressionFeedback is the `progression.feedback` payload on save responses.
type ProgressionFeedback struct {
	Report            *ProgressReport `json:"report"`
	EarlyDeloadBanner *FeedbackBanner `json:"earlyDeloadBanner"`
}

// saveResponse is the {log, progression} envelope shared by POST and PATCH.
type saveResponse struct {
	Log struct {
		ID string `json:"id"`
	} `json:"log"`
	Progression struct {
		Feedback *ProgressionFeedback `json:"feedback"`
	} `json:"progression"`
}

// CreateLog saves a workout and returns the new log id plus the server-assembled
// progression feedback (judgment card / early-deload banner; nil when none).
// PRs are computed on the read path, so fetch them via GetLog.
func (c *Client) CreateLog(ctx context.Context, req CreateLogRequest) (string, *ProgressionFeedback, error) {
	var out saveResponse
	if err := c.do(ctx, "POST", "/api/logs", req, &out); err != nil {
		return "", nil, err
	}
	if strings.TrimSpace(out.Log.ID) == "" {
		return "", nil, fmt.Errorf("decode /api/logs: response missing log.id")
	}
	return out.Log.ID, out.Progression.Feedback, nil
}

// UpdateLog replaces a past log's sets (and performedAt) via PATCH. The server
// upserts the set list wholesale and rebuilds plan progression, returning the
// same feedback envelope as CreateLog. PRs are computed on the read path, so
// fetch them via GetLog afterward.
func (c *Client) UpdateLog(ctx context.Context, id string, req CreateLogRequest) (*ProgressionFeedback, error) {
	var out saveResponse
	if err := c.do(ctx, "PATCH", "/api/logs/"+id, req, &out); err != nil {
		return nil, err
	}
	if strings.TrimSpace(out.Log.ID) == "" || out.Log.ID != id {
		return nil, fmt.Errorf("decode /api/logs/%s: response log.id mismatch", id)
	}
	return out.Progression.Feedback, nil
}

// DeleteLog removes a workout log (the server rebuilds plan progression).
func (c *Client) DeleteLog(ctx context.Context, id string) error {
	return c.do(ctx, "DELETE", "/api/logs/"+id, nil, nil)
}

// GetLog fetches one log with its server-detected personal records.
func (c *Client) GetLog(ctx context.Context, id string) (*LogDetail, error) {
	var out struct {
		Item LogDetail `json:"item"`
	}
	if err := c.do(ctx, "GET", "/api/logs/"+id, nil, &out); err != nil {
		return nil, err
	}
	return &out.Item, nil
}
