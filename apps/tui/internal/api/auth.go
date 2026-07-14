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
	// Token is present from the apps/api backend (Bearer model); the Next.js API
	// sets a cookie instead and omits it.
	Token string `json:"token"`
	User  *User  `json:"user"`
}

// Login authenticates with email/password. The session is captured from either
// the response token (apps/api → Bearer) or the wl_session cookie (Next.js API →
// jar), and replayed on subsequent requests.
func (c *Client) Login(ctx context.Context, email, password string) (*User, error) {
	var out userEnvelope
	if err := c.do(ctx, "POST", "/api/auth/login", Credentials{Email: email, Password: password}, &out); err != nil {
		return nil, err
	}
	if out.Token != "" {
		c.SetSessionToken(out.Token)
	}
	return out.User, nil
}

// Signup creates a new account and starts a session (token in body for apps/api,
// cookie for the Next.js API).
func (c *Client) Signup(ctx context.Context, req SignupRequest) (*User, error) {
	var out userEnvelope
	if err := c.do(ctx, "POST", "/api/auth/signup", req, &out); err != nil {
		return nil, err
	}
	if out.Token != "" {
		c.SetSessionToken(out.Token)
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
	if err := c.do(ctx, "POST", "/api/auth/logout", nil, nil); err != nil {
		return err
	}
	c.ClearSessionToken()
	return nil
}

// RequestPasswordReset sends a reset email if the address has an account. The
// response is intentionally generic (no account-existence leak); only rate
// limiting (429) surfaces as an error.
func (c *Client) RequestPasswordReset(ctx context.Context, email string) error {
	return c.do(ctx, "POST", "/api/auth/password/reset/request", map[string]string{"email": email}, nil)
}
