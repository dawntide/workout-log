package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveBaseURL(t *testing.T) {
	dir := t.TempDir()
	c := Config{dir: dir}

	// trailing slash is trimmed on save
	if err := c.SaveBaseURL("https://prod.example.com/"); err != nil {
		t.Fatalf("SaveBaseURL: %v", err)
	}
	b, err := os.ReadFile(filepath.Join(dir, baseURLFile))
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(b) != "https://prod.example.com" {
		t.Errorf("saved = %q, want https://prod.example.com", b)
	}

	// empty clears the saved value
	if err := c.SaveBaseURL("  "); err != nil {
		t.Fatalf("SaveBaseURL(clear): %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, baseURLFile)); !os.IsNotExist(err) {
		t.Error("empty url should remove the base_url file")
	}
	// clearing an already-absent file is not an error
	if err := c.SaveBaseURL(""); err != nil {
		t.Errorf("clearing absent file should not error: %v", err)
	}
}
