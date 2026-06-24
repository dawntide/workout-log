package api

import (
	"context"
	"encoding/json"
)

// Settings fetches the user's settings as a raw key→value map (merged with
// server defaults). Keys are dotted (e.g. "prefs.locale").
func (c *Client) Settings(ctx context.Context) (map[string]json.RawMessage, error) {
	var out struct {
		Settings map[string]json.RawMessage `json:"settings"`
	}
	if err := c.do(ctx, "GET", "/api/settings", nil, &out); err != nil {
		return nil, err
	}
	return out.Settings, nil
}

// SetSetting updates one setting (value may be string|number|bool|null).
func (c *Client) SetSetting(ctx context.Context, key string, value any) error {
	return c.do(ctx, "PATCH", "/api/settings", map[string]any{"key": key, "value": value}, nil)
}
