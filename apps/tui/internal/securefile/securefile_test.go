package securefile

import (
	"path/filepath"
	"testing"
)

func TestWriteFileIsOwnerOnly(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret")
	if err := WriteFile(path, []byte("private")); err != nil {
		t.Fatal(err)
	}
	ok, err := OwnerOnly(path)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("sensitive file is not owner-only")
	}
}
