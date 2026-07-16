// Package securefile writes sensitive local state with OS-native access controls.
package securefile

import (
	"fmt"
	"os"
)

// WriteFile writes data and restricts the resulting file to trusted local principals.
func WriteFile(path string, data []byte) error {
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return err
	}
	if err := restrictOwnerOnly(path); err != nil {
		return fmt.Errorf("restrict sensitive file: %w", err)
	}
	return nil
}

// OpenExclusive creates a new sensitive file without replacing an existing path.
func OpenExclusive(path string) (*os.File, error) {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, err
	}
	if err := restrictOwnerOnly(path); err != nil {
		_ = f.Close()
		_ = os.Remove(path)
		return nil, fmt.Errorf("restrict sensitive file: %w", err)
	}
	return f, nil
}

// OwnerOnly reports whether the file has the platform's owner-only protection.
func OwnerOnly(path string) (bool, error) {
	return ownerOnly(path)
}
