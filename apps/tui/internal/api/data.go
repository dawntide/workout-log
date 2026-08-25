package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
)

// ExportData downloads the full user-data export as a raw file body (format
// "json" or "csv"). It bypasses do() since the response is a file, not the
// usual JSON envelope.
func (c *Client) ExportData(ctx context.Context, format string) ([]byte, error) {
	u := c.baseURL.String() + "/api/export?format=" + url.QueryEscape(format)
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "*/*")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, &APIError{Status: resp.StatusCode, Message: extractError(data, resp.Status)}
	}
	return data, nil
}

// ImportSummaryRow is one table's import preview (rows to delete vs insert).
//
// WillRecompute marks a table the file does not carry: it is deleted and then
// rebuilt from the logs after the import (plan_runtime_state today). Its
// WillInsert is always 0, so a count-only summary reads as plain data loss.
// Absent on servers older than that field, which decodes to false — the
// pre-existing count-only rendering.
type ImportSummaryRow struct {
	Table         string `json:"table"`
	WillDelete    int    `json:"willDelete"`
	WillInsert    int    `json:"willInsert"`
	WillRecompute bool   `json:"willRecompute"`
}

// ImportResult is the /api/me/import response. summary is the per-table preview
// (populated for both dryRun and replace).
type ImportResult struct {
	Applied  bool               `json:"applied"`
	Mode     string             `json:"mode"`
	Summary  []ImportSummaryRow `json:"summary"`
	Warnings []string           `json:"warnings"`
}

// ImportData uploads an export payload. replace=false is a dryRun (validate +
// preview counts, no changes); replace=true wipes and replaces all user data
// (confirmToken gate). data is the parsed export JSON, passed through verbatim.
func (c *Client) ImportData(ctx context.Context, data json.RawMessage, replace bool) (*ImportResult, error) {
	body := map[string]any{"data": data, "mode": "dryRun"}
	if replace {
		body["mode"] = "replace"
		body["confirmToken"] = "REPLACE_USER_DATA"
	}
	var out ImportResult
	if err := c.do(ctx, "POST", "/api/me/import", body, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
