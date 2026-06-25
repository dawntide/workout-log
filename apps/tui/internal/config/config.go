// Package config resolves the ironlog config directory and persists the
// session token + API base URL across runs.
package config

import (
	"os"
	"path/filepath"
	"strings"
)

const (
	appDir      = "ironlog"
	sessionFile = "session"
	baseURLFile = "base_url"
	envBaseURL  = "IRONLOG_API_URL"
	defaultBase = "http://localhost:3000"
)

// Config holds runtime configuration for the TUI.
type Config struct {
	BaseURL string
	dir     string
}

// Load resolves the API base URL with precedence: $IRONLOG_API_URL (temporary
// override) > the saved config file (set once via `ironlog --set-server`) >
// the localhost default. It also ensures the per-user config dir exists
// (~/.config/ironlog on *nix, %AppData%\ironlog on Windows).
func Load() (Config, error) {
	ucd, err := os.UserConfigDir()
	if err != nil {
		return Config{}, err
	}
	dir := filepath.Join(ucd, appDir)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return Config{}, err
	}

	base := strings.TrimRight(os.Getenv(envBaseURL), "/")
	if base == "" {
		if b, err := os.ReadFile(filepath.Join(dir, baseURLFile)); err == nil {
			base = strings.TrimRight(strings.TrimSpace(string(b)), "/")
		}
	}
	if base == "" {
		base = defaultBase
	}
	return Config{BaseURL: base, dir: dir}, nil
}

// SaveBaseURL persists the API base URL so future runs don't need the env var.
// An empty url clears the saved value (reverting to the default).
func (c Config) SaveBaseURL(url string) error {
	url = strings.TrimRight(strings.TrimSpace(url), "/")
	p := filepath.Join(c.dir, baseURLFile)
	if url == "" {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	return os.WriteFile(p, []byte(url), 0o600)
}

// SessionToken returns the persisted wl_session token, or "" if none is saved.
func (c Config) SessionToken() string {
	b, err := os.ReadFile(filepath.Join(c.dir, sessionFile))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// SaveSessionToken persists the wl_session token with 0600 permissions.
func (c Config) SaveSessionToken(tok string) error {
	return os.WriteFile(filepath.Join(c.dir, sessionFile), []byte(tok), 0o600)
}

// ClearSession removes the persisted token (logout). Missing file is not an error.
func (c Config) ClearSession() error {
	err := os.Remove(filepath.Join(c.dir, sessionFile))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
