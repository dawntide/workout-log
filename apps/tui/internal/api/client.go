// Package api is a thin HTTP client for the workout-log backend. It manages the
// cookie-only session (wl_session) so a terminal client can authenticate
// against the existing API without backend changes — the server's same-origin
// CSRF check passes for origin-less CLI requests.
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

// Client talks to one backend base URL, carrying a cookie jar that stores and
// replays the wl_session cookie automatically.
type Client struct {
	baseURL *url.URL
	http    *http.Client
	jar     *cookiejar.Jar
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

// SetSessionToken seeds the jar with a persisted token so a fresh process is
// authenticated without re-login.
func (c *Client) SetSessionToken(tok string) {
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

// SessionToken returns the wl_session value currently held in the jar, or "".
func (c *Client) SessionToken() string {
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
