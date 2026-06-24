package api

import "context"

// Plan is a user's training plan.
type Plan struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Type            string `json:"type"`
	BaseProgramName string `json:"baseProgramName"`
}

// Plans lists the user's plans.
func (c *Client) Plans(ctx context.Context) ([]Plan, error) {
	var out struct {
		Items []Plan `json:"items"`
	}
	if err := c.do(ctx, "GET", "/api/plans", nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// DeletePlan removes a plan and its logs.
func (c *Client) DeletePlan(ctx context.Context, id string) error {
	return c.do(ctx, "DELETE", "/api/plans/"+id, nil, nil)
}
