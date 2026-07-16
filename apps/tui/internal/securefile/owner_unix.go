//go:build !windows

package securefile

import "os"

func restrictOwnerOnly(path string) error {
	return os.Chmod(path, 0o600)
}

func ownerOnly(path string) (bool, error) {
	info, err := os.Stat(path)
	if err != nil {
		return false, err
	}
	return info.Mode().Perm() == 0o600, nil
}
