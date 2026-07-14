// Package config resolves the ironlog config directory and persists the
// session token + API base URL across runs.
package config

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	appDir                = "ironlog"
	sessionFile           = "session"
	baseURLFile           = "base_url"
	draftFile             = "draft.json"
	envBaseURL            = "IRONLOG_API_URL"
	legacyUnclaimedPrefix = "draft.legacy-unclaimed."
	legacyClaimedPrefix   = "draft.legacy-claimed."
)

// defaultBase is the fallback API URL when neither $IRONLOG_API_URL nor a saved
// config is present. Release builds inject the production URL via -ldflags
// (see apps/tui/.goreleaser.yaml); a plain `go build` keeps localhost for dev.
var defaultBase = "http://localhost:3000"

// Config holds runtime configuration for the TUI.
type Config struct {
	BaseURL    string
	dir        string
	draftOwner string
}

// WithDraftOwner returns a store view whose crash draft is namespaced to one
// authenticated account. The owner hash is filesystem-safe and does not expose
// the raw account id in the config directory.
func (c Config) WithDraftOwner(userID string) Config {
	c.draftOwner = strings.TrimSpace(userID)
	return c
}

func (c Config) draftPath() string {
	if c.draftOwner == "" {
		return filepath.Join(c.dir, draftFile)
	}
	principal := strings.TrimRight(strings.TrimSpace(c.BaseURL), "/") + "\x00" + c.draftOwner
	sum := sha256.Sum256([]byte(principal))
	return filepath.Join(c.dir, "draft."+fmt.Sprintf("%x", sum[:8])+".json")
}

// MigrateLegacyDraft binds the pre-account-namespace draft.json to the user
// whose persisted session has just been verified. It never overwrites a newer
// owner draft, and removes the legacy file only after the owner copy is durable.
func (c Config) MigrateLegacyDraft(userID string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil
	}
	target := c.WithDraftOwner(userID)
	if _, err := os.Stat(target.draftPath()); err == nil {
		return c.QuarantineLegacyDraft()
	} else if !os.IsNotExist(err) {
		return err
	}
	legacyPath := c.WithDraftOwner("").draftPath()
	data, err := os.ReadFile(legacyPath)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(data, &payload); err != nil {
		_ = c.QuarantineLegacyDraft()
		return err
	}
	if payload == nil {
		_ = c.QuarantineLegacyDraft()
		return fmt.Errorf("legacy draft is not a JSON object")
	}
	if raw := payload["userId"]; len(raw) > 0 {
		var existing string
		if json.Unmarshal(raw, &existing) == nil && existing != "" && existing != userID {
			return c.QuarantineLegacyDraft()
		}
	} else {
		path, quarantineErr := c.QuarantineLegacyDraftPath()
		if quarantineErr != nil {
			return quarantineErr
		}
		return fmt.Errorf("ownerless legacy draft quarantined at %s; explicit recovery required", path)
	}
	payload["userId"], _ = json.Marshal(userID)
	migrated, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if err := target.SaveDraft(migrated); err != nil {
		_ = c.QuarantineLegacyDraft()
		return err
	}
	quarantined, err := c.QuarantineLegacyDraftPath()
	if err != nil {
		return err
	}
	if quarantined != "" {
		return os.Remove(quarantined)
	}
	return nil
}

// QuarantineLegacyDraft makes an ambiguous pre-namespace draft ineligible for
// automatic ownership by any future account while preserving the bytes for
// explicit/manual recovery.
func (c Config) QuarantineLegacyDraft() error {
	_, err := c.QuarantineLegacyDraftPath()
	return err
}

func (c Config) QuarantineLegacyDraftPath() (string, error) {
	legacyPath := c.WithDraftOwner("").draftPath()
	if _, err := os.Stat(legacyPath); os.IsNotExist(err) {
		return "", nil
	} else if err != nil {
		return "", err
	}
	quarantine := filepath.Join(c.dir, fmt.Sprintf("%s%d.json", legacyUnclaimedPrefix, time.Now().UnixNano()))
	if err := os.Rename(legacyPath, quarantine); err != nil {
		return "", err
	}
	return quarantine, nil
}

// LatestQuarantinedDraft returns the newest ambiguous legacy draft awaiting an
// explicit recovery/discard decision.
func (c Config) LatestQuarantinedDraft() string {
	matches, _ := filepath.Glob(filepath.Join(c.dir, legacyUnclaimedPrefix+"*.json"))
	latest := ""
	var latestTime time.Time
	for _, path := range matches {
		owner, err := c.QuarantinedDraftOwner(path)
		if err != nil || owner != "" {
			continue
		}
		info, err := os.Stat(path)
		if err == nil && (latest == "" || info.ModTime().After(latestTime)) {
			latest, latestTime = path, info.ModTime()
		}
	}
	return latest
}

// LatestQuarantinedDraftFor returns the newest unclaimed draft, or a draft
// already durably claimed by userID during an interrupted recovery. A claimed
// draft is never offered to a different authenticated account.
func (c Config) LatestQuarantinedDraftFor(userID string) string {
	userID = strings.TrimSpace(userID)
	unclaimed, _ := filepath.Glob(filepath.Join(c.dir, legacyUnclaimedPrefix+"*.json"))
	claimed, _ := filepath.Glob(filepath.Join(c.dir, legacyClaimedPrefix+"*.json"))
	matches := append(unclaimed, claimed...)
	latest := ""
	var latestTime time.Time
	for _, path := range matches {
		if !c.CanRecoverQuarantinedDraft(path, userID) {
			continue
		}
		info, err := os.Stat(path)
		if err == nil && (latest == "" || info.ModTime().After(latestTime)) {
			latest, latestTime = path, info.ModTime()
		}
	}
	return latest
}

func (c Config) validQuarantinePath(path string) bool {
	clean := filepath.Clean(path)
	base := filepath.Base(clean)
	return filepath.Dir(clean) == filepath.Clean(c.dir) &&
		(strings.HasPrefix(base, legacyUnclaimedPrefix) || strings.HasPrefix(base, legacyClaimedPrefix)) &&
		strings.HasSuffix(base, ".json")
}

func (c Config) quarantineOwnerKey(userID string) string {
	principal := strings.TrimRight(strings.TrimSpace(c.BaseURL), "/") + "\x00" + strings.TrimSpace(userID)
	sum := sha256.Sum256([]byte(principal))
	return fmt.Sprintf("%x", sum[:8])
}

func (c Config) claimedPathMatchesUser(path, userID string) bool {
	base := filepath.Base(filepath.Clean(path))
	return strings.HasPrefix(base, legacyClaimedPrefix+c.quarantineOwnerKey(userID)+".")
}

// CanRecoverQuarantinedDraft checks both the atomic claimed filename and the
// payload owner stamp. The filename remains authoritative in the tiny crash
// window between renaming an ownerless source and stamping its JSON payload.
func (c Config) CanRecoverQuarantinedDraft(path, userID string) bool {
	userID = strings.TrimSpace(userID)
	if userID == "" || !c.validQuarantinePath(path) {
		return false
	}
	base := filepath.Base(filepath.Clean(path))
	if strings.HasPrefix(base, legacyClaimedPrefix) && !c.claimedPathMatchesUser(path, userID) {
		return false
	}
	owner, err := c.QuarantinedDraftOwner(path)
	return err == nil && (owner == "" || owner == userID)
}

// QuarantinedDraftOwner returns the owner durably claimed inside a quarantine
// payload, or "" while it is still ownerless.
func (c Config) QuarantinedDraftOwner(path string) (string, error) {
	if !c.validQuarantinePath(path) {
		return "", fmt.Errorf("invalid legacy draft path")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(data, &payload); err != nil || payload == nil {
		return "", fmt.Errorf("legacy draft is not a JSON object")
	}
	var owner string
	if raw := payload["userId"]; len(raw) > 0 {
		_ = json.Unmarshal(raw, &owner)
	}
	return strings.TrimSpace(owner), nil
}

func writeAtomicFile(path string, data []byte) error {
	tmp := fmt.Sprintf("%s.tmp.%d", path, time.Now().UnixNano())
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	removeTmp := true
	defer func() {
		if removeTmp {
			_ = os.Remove(tmp)
		}
	}()
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		return err
	}
	removeTmp = false
	return nil
}

func writeFileIfAbsent(path string, data []byte) error {
	tmp := fmt.Sprintf("%s.recover.%d", path, time.Now().UnixNano())
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	defer os.Remove(tmp)
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	// A same-directory hard link atomically publishes the fully-written file
	// only when the owner namespace is still empty; it never overwrites work
	// created by another terminal while this prompt was open.
	return os.Link(tmp, path)
}

func randomClaimSuffix() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err == nil {
		return hex.EncodeToString(value[:])
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

// claimQuarantinedDraft atomically moves an ownerless source to an
// owner-specific filename. Concurrent accounts race on one source rename, so
// exactly one can win; a crash before the JSON stamp is still protected by the
// owner hash encoded in the claimed filename.
func (c Config) claimQuarantinedDraft(path, userID string) (string, error) {
	base := filepath.Base(filepath.Clean(path))
	claimedPath := path
	if strings.HasPrefix(base, legacyUnclaimedPrefix) {
		claimedPath = filepath.Join(c.dir, fmt.Sprintf(
			"%s%s.%s.json", legacyClaimedPrefix, c.quarantineOwnerKey(userID), randomClaimSuffix(),
		))
		if err := os.Rename(path, claimedPath); err != nil {
			return "", fmt.Errorf("claim legacy draft: %w", err)
		}
	} else if !c.claimedPathMatchesUser(path, userID) {
		return "", fmt.Errorf("legacy draft belongs to another account")
	}
	return claimedPath, nil
}

// RecoverQuarantinedDraft explicitly binds an ambiguous legacy payload to the
// selected authenticated account, then removes the quarantine copy.
func (c Config) RecoverQuarantinedDraft(path, userID string) error {
	userID = strings.TrimSpace(userID)
	if !c.CanRecoverQuarantinedDraft(path, userID) {
		return fmt.Errorf("invalid legacy draft recovery target")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(data, &payload); err != nil || payload == nil {
		return fmt.Errorf("legacy draft is not a JSON object")
	}
	existingOwner := ""
	if raw := payload["userId"]; len(raw) > 0 {
		if json.Unmarshal(raw, &existingOwner) == nil && existingOwner != "" && existingOwner != userID {
			return fmt.Errorf("legacy draft belongs to another account")
		}
	}
	payload["userId"], _ = json.Marshal(userID)
	migrated, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	target := c.WithDraftOwner(userID)
	if current, err := target.LoadDraft(); err != nil {
		return err
	} else if len(current) > 0 {
		// Complete the final remove after a crash that happened between publishing
		// this exact owner copy and deleting its already-claimed quarantine.
		if c.claimedPathMatchesUser(path, userID) && bytes.Equal(current, migrated) {
			return os.Remove(path)
		}
		return fmt.Errorf("this account already has a draft; resolve it before recovering the legacy draft")
	}
	claimedPath, err := c.claimQuarantinedDraft(path, userID)
	if err != nil {
		return err
	}
	// Recheck after the atomic claim. Another terminal for the same account may
	// have published a draft between the first check and the source rename.
	if current, err := target.LoadDraft(); err != nil {
		return err
	} else if len(current) > 0 {
		if bytes.Equal(current, migrated) {
			return os.Remove(claimedPath)
		}
		return fmt.Errorf("this account already has a draft; resolve it before recovering the legacy draft")
	}
	if err := writeFileIfAbsent(target.draftPath(), migrated); err != nil {
		return fmt.Errorf("publish recovered draft: %w", err)
	}
	return os.Remove(claimedPath)
}

func (c Config) DiscardQuarantinedDraft(path, userID string) error {
	if !c.validQuarantinePath(path) {
		return fmt.Errorf("invalid legacy draft discard target")
	}
	userID = strings.TrimSpace(userID)
	base := filepath.Base(filepath.Clean(path))
	if strings.HasPrefix(base, legacyClaimedPrefix) && !c.claimedPathMatchesUser(path, userID) {
		return fmt.Errorf("legacy draft belongs to another account")
	}
	owner, err := c.QuarantinedDraftOwner(path)
	if err != nil {
		return err
	}
	if owner != "" && owner != userID {
		return fmt.Errorf("legacy draft belongs to another account")
	}
	err = os.Remove(path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
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

// LoadDraft returns the persisted today-buffer draft (crash recovery), or nil
// when none exists. The draft schema is owned by the ui package — config only
// stores bytes.
func (c Config) LoadDraft() ([]byte, error) {
	b, err := os.ReadFile(c.draftPath())
	if os.IsNotExist(err) {
		return nil, nil
	}
	return b, err
}

// SaveDraft persists the today-buffer draft atomically (tmp + rename), so a
// crash mid-write can't corrupt the previous draft.
func (c Config) SaveDraft(data []byte) error {
	p := c.draftPath()
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// ClearDraft removes the draft (after a successful save). Missing file is fine.
func (c Config) ClearDraft() error {
	err := os.Remove(c.draftPath())
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
