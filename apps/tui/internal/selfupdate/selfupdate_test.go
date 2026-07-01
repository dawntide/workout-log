package selfupdate

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"testing"
)

func TestArchiveName(t *testing.T) {
	for _, c := range []struct {
		goos, goarch, want string
	}{
		{"linux", "amd64", "ironlog_0.3.2_linux_amd64.tar.gz"},
		{"linux", "arm64", "ironlog_0.3.2_linux_arm64.tar.gz"},
		{"darwin", "amd64", "ironlog_0.3.2_macos_amd64.tar.gz"},
		{"darwin", "arm64", "ironlog_0.3.2_macos_arm64.tar.gz"},
		{"windows", "amd64", "ironlog_0.3.2_windows_amd64.zip"},
	} {
		if got := archiveName("0.3.2", c.goos, c.goarch); got != c.want {
			t.Errorf("archiveName(0.3.2, %s, %s) = %q, want %q", c.goos, c.goarch, got, c.want)
		}
	}
}

func TestChecksumFor(t *testing.T) {
	// Real GoReleaser format: `<sha256>  <file>` (two spaces).
	sums := "16967737fde092e8f96f93b2dbe8d68f33b433f4988d82bf4ff3a74d58d51046  ironlog_0.3.1_linux_amd64.tar.gz\n" +
		"ace6eef86eafceab248f6aee2a5c4b8ccd3eea642373da671f3461ef202c91a6  ironlog_0.3.1_linux_arm64.tar.gz\n"
	if got := checksumFor(sums, "ironlog_0.3.1_linux_arm64.tar.gz"); got != "ace6eef86eafceab248f6aee2a5c4b8ccd3eea642373da671f3461ef202c91a6" {
		t.Errorf("checksumFor arm64 = %q", got)
	}
	if got := checksumFor(sums, "ironlog_0.3.1_macos_amd64.tar.gz"); got != "" {
		t.Errorf("checksumFor missing file = %q, want empty", got)
	}
}

func TestExtractTarGz(t *testing.T) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	body := []byte("ELF-ish binary bytes")
	// Include a sibling file to ensure we pick out the binary by name.
	for _, f := range []struct {
		name string
		data []byte
	}{
		{"LICENSE", []byte("license text")},
		{"ironlog", body},
	} {
		if err := tw.WriteHeader(&tar.Header{Name: f.name, Mode: 0o755, Size: int64(len(f.data))}); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write(f.data); err != nil {
			t.Fatal(err)
		}
	}
	tw.Close()
	gz.Close()

	got, err := extractTarGz(buf.Bytes())
	if err != nil {
		t.Fatalf("extractTarGz: %v", err)
	}
	if !bytes.Equal(got, body) {
		t.Errorf("extracted = %q, want %q", got, body)
	}
}

func TestExtractTarGzMissingBinary(t *testing.T) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	tw.WriteHeader(&tar.Header{Name: "README.md", Mode: 0o644, Size: 2})
	tw.Write([]byte("hi"))
	tw.Close()
	gz.Close()
	if _, err := extractTarGz(buf.Bytes()); err == nil {
		t.Error("expected error when archive has no ironlog binary")
	}
}
