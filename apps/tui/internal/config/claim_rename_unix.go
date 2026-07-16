//go:build !windows

package config

import "os"

func claimRename(source, target string) error {
	return os.Rename(source, target)
}
