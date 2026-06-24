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
	envBaseURL  = "IRONLOG_API_URL"
	defaultBase = "http://localhost:3000"
)

// Config holds runtime configuration for the TUI.
type Config struct {
	BaseURL string
	dir     string
}

// Load reads the base URL (from $IRONLOG_API_URL, else the localhost default)
// and ensures the per-user config dir exists (~/.config/ironlog on *nix,
// %AppData%\ironlog on Windows).
func Load() (Config, error) {
	base := strings.TrimRight(os.Getenv(envBaseURL), "/")
	if base == "" {
		base = defaultBase
	}
	ucd, err := os.UserConfigDir()
	if err != nil {
		return Config{}, err
	}
	dir := filepath.Join(ucd, appDir)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return Config{}, err
	}
	return Config{BaseURL: base, dir: dir}, nil
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
