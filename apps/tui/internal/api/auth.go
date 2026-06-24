package api

import "context"

// Credentials is the /api/auth/login request body.
type Credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// SignupRequest is the /api/auth/signup request body.
type SignupRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName,omitempty"`
}

type userEnvelope struct {
	User *User `json:"user"`
}

// Login authenticates with email/password. On success the wl_session cookie is
// stored in the client's jar and replayed on subsequent requests.
func (c *Client) Login(ctx context.Context, email, password string) (*User, error) {
	var out userEnvelope
	if err := c.do(ctx, "POST", "/api/auth/login", Credentials{Email: email, Password: password}, &out); err != nil {
		return nil, err
	}
	return out.User, nil
}

// Signup creates a new account and starts a session (cookie set on success).
func (c *Client) Signup(ctx context.Context, req SignupRequest) (*User, error) {
	var out userEnvelope
	if err := c.do(ctx, "POST", "/api/auth/signup", req, &out); err != nil {
		return nil, err
	}
	return out.User, nil
}

// Me returns the current user, or nil if unauthenticated.
func (c *Client) Me(ctx context.Context) (*User, error) {
	var out userEnvelope
	if err := c.do(ctx, "GET", "/api/auth/me", nil, &out); err != nil {
		return nil, err
	}
	return out.User, nil
}

// Logout invalidates the server session and clears the cookie.
func (c *Client) Logout(ctx context.Context) error {
	return c.do(ctx, "POST", "/api/auth/logout", nil, nil)
}
