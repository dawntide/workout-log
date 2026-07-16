package config

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows"
)

// claimRename serializes claims for one source path across Windows processes.
// The kernel releases an abandoned mutex automatically if a process exits.
func claimRename(source, target string) error {
	absolute, err := filepath.Abs(source)
	if err != nil {
		return err
	}
	key := strings.ToLower(filepath.Clean(absolute))
	sum := sha256.Sum256([]byte(key))
	name, err := windows.UTF16PtrFromString(fmt.Sprintf(`Local\ironlog-claim-%x`, sum))
	if err != nil {
		return err
	}
	mutex, err := windows.CreateMutex(nil, false, name)
	if err != nil && !errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		return err
	}
	if mutex == 0 {
		return fmt.Errorf("create claim mutex: invalid handle")
	}
	defer windows.CloseHandle(mutex)

	wait, err := windows.WaitForSingleObject(mutex, windows.INFINITE)
	if err != nil {
		return err
	}
	if wait != windows.WAIT_OBJECT_0 && wait != windows.WAIT_ABANDONED {
		return fmt.Errorf("wait for claim mutex: unexpected result %#x", wait)
	}

	renameErr := os.Rename(source, target)
	releaseErr := windows.ReleaseMutex(mutex)
	if renameErr != nil {
		return renameErr
	}
	return releaseErr
}
