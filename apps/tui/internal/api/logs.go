package api

import (
	"context"
	"net/url"
	"strconv"
)

// ListLogsParams are the query filters for GET /api/logs.
type ListLogsParams struct {
	Date     string // YYYY-MM-DD (optional)
	Timezone string // IANA zone (optional)
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

// CreateLog saves a workout and returns the new log id. The POST response is
// {log, progression}; PRs are computed on the read path, so fetch them via
// GetLog.
func (c *Client) CreateLog(ctx context.Context, req CreateLogRequest) (string, error) {
	var out struct {
		Log struct {
			ID string `json:"id"`
		} `json:"log"`
	}
	if err := c.do(ctx, "POST", "/api/logs", req, &out); err != nil {
		return "", err
	}
	return out.Log.ID, nil
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
