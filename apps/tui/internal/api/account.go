package api

import (
	"context"
	"time"
)

// Session is one active sign-in for the account (GET /api/auth/sessions).
type Session struct {
	TokenMask string    `json:"tokenMask"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
	IsCurrent bool      `json:"isCurrent"`
	IsExpired bool      `json:"isExpired"`
}

// ChangePassword updates the account password. The server verifies the current
// password, requires the new one to be ≥8 chars and different from the current,
// then rotates the session: all sessions are revoked and a fresh cookie is
// issued on this response — the client jar absorbs it, so the session stays
// valid without a re-login.
func (c *Client) ChangePassword(ctx context.Context, current, next string) error {
	var out struct {
		Token string `json:"token"`
	}
	if err := c.do(ctx, "POST", "/api/auth/password", map[string]string{
		"currentPassword": current,
		"newPassword":     next,
	}, &out); err != nil {
		return err
	}
	// apps/api revokes all sessions and returns a fresh token in the body — adopt
	// it so this client stays authenticated (the Next.js API rotates via cookie).
	if out.Token != "" {
		c.SetSessionToken(out.Token)
	}
	return nil
}

// DeleteAccount permanently deletes the account and all personal data after
// re-confirming the password. The session cookie is cleared on success; callers
// should return to the login gate.
func (c *Client) DeleteAccount(ctx context.Context, password string) error {
	return c.do(ctx, "DELETE", "/api/auth/account", map[string]string{
		"confirmToken": "DELETE_MY_ACCOUNT",
		"password":     password,
	}, nil)
}

// Sessions lists the account's active sign-ins (most recent first).
func (c *Client) Sessions(ctx context.Context) ([]Session, error) {
	var out struct {
		Items []Session `json:"items"`
	}
	if err := c.do(ctx, "GET", "/api/auth/sessions", nil, &out); err != nil {
		return nil, err
	}
	return out.Items, nil
}

// RevokeOtherSessions terminates every session except the current cookie's and
// returns how many were revoked (0 if the server reports null).
func (c *Client) RevokeOtherSessions(ctx context.Context) (int, error) {
	var out struct {
		Revoked int `json:"revoked"`
	}
	if err := c.do(ctx, "DELETE", "/api/auth/sessions", nil, &out); err != nil {
		return 0, err
	}
	return out.Revoked, nil
}

// ResendEmailVerification sends a fresh verification email. It returns
// alreadyVerified=true (no email sent) when the address is already verified.
func (c *Client) ResendEmailVerification(ctx context.Context) (alreadyVerified bool, err error) {
	var out struct {
		AlreadyVerified bool `json:"alreadyVerified"`
	}
	if err := c.do(ctx, "POST", "/api/auth/email/verification/request", nil, &out); err != nil {
		return false, err
	}
	return out.AlreadyVerified, nil
}
