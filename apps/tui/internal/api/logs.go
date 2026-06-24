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
