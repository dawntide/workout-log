// Package api is a thin HTTP client for the workout-log backend. It authenticates
// in dual mode: when the backend returns a session token in the login/signup
// body (the standalone apps/api Hono backend), it is sent as
// `Authorization: Bearer <token>`; the wl_session cookie jar is also kept so the
// same client still works against the cookie-only Next.js API (whose same-origin
// CSRF check passes for origin-less CLI requests). Either path authenticates;
// the Bearer path is what the B2 cutover uses.
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// SessionCookieName is the backend's session cookie (wl_session).
const SessionCookieName = "wl_session"

// Client talks to one backend base URL. It carries an opaque session token sent
// as a Bearer header (when known), and a cookie jar that stores/replays the
// wl_session cookie — both back the same opaque auth_session, so either
// authenticates.
type Client struct {
	baseURL *url.URL
	http    *http.Client
	jar     *cookiejar.Jar
	token   string // opaque session token; sent as Authorization: Bearer when set
}

// New constructs a client for the given base URL (e.g. http://localhost:3000).
func New(baseURL string) (*Client, error) {
	u, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return nil, fmt.Errorf("parse base url: %w", err)
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	return &Client{
		baseURL: u,
		jar:     jar,
		http:    &http.Client{Jar: jar, Timeout: 30 * time.Second},
	}, nil
}

// SetSessionToken seeds both the Bearer token and the cookie jar from a
// persisted token, so a fresh process is authenticated without re-login against
// either backend (Bearer for apps/api, cookie for the Next.js API).
func (c *Client) SetSessionToken(tok string) {
	c.token = tok
	c.jar.SetCookies(c.baseURL, []*http.Cookie{{
		Name:  SessionCookieName,
		Value: tok,
		Path:  "/",
	}})
}

// BaseURL returns the backend base URL this client talks to.
func (c *Client) BaseURL() string {
	if c == nil || c.baseURL == nil {
		return ""
	}
	return c.baseURL.String()
}

// SessionToken returns the current session token: the Bearer token if set
// (apps/api), otherwise the wl_session cookie value from the jar (Next.js API),
// or "".
func (c *Client) SessionToken() string {
	if c.token != "" {
		return c.token
	}
	for _, ck := range c.jar.Cookies(c.baseURL) {
		if ck.Name == SessionCookieName {
			return ck.Value
		}
	}
	return ""
}

// APIError is a non-2xx HTTP response from the backend.
type APIError struct {
	Status     int
	Message    string
	RetryAfter int // seconds (429 only)
}

func (e *APIError) Error() string {
	return fmt.Sprintf("api: %d %s", e.Status, e.Message)
}

// IsUnauthorized reports whether err is a 401 (session missing/expired).
func IsUnauthorized(err error) bool {
	var ae *APIError
	return errors.As(err, &ae) && ae.Status == http.StatusUnauthorized
}

// IsRateLimited reports whether err is a 429.
func IsRateLimited(err error) bool {
	var ae *APIError
	return errors.As(err, &ae) && ae.Status == http.StatusTooManyRequests
}

// IsConflict reports whether err is a 409 (duplicate name/alias).
func IsConflict(err error) bool {
	var ae *APIError
	return errors.As(err, &ae) && ae.Status == http.StatusConflict
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reqBody = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL.String()+path, reqBody)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		ae := &APIError{Status: resp.StatusCode, Message: extractError(data, resp.Status)}
		if resp.StatusCode == http.StatusTooManyRequests {
			ae.RetryAfter, _ = strconv.Atoi(resp.Header.Get("Retry-After"))
		}
		return ae
	}
	if out != nil && len(data) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return fmt.Errorf("decode %s: %w", path, err)
		}
	}
	return nil
}

func extractError(data []byte, fallback string) string {
	var e struct {
		Error   string `json:"error"`
		Message string `json:"message"`
	}
	if json.Unmarshal(data, &e) == nil {
		if e.Error != "" {
			return e.Error
		}
		if e.Message != "" {
			return e.Message
		}
	}
	return fallback
}
