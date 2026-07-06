// Package selfupdate implements `ironlog update`: it replaces the running
// binary in place with the latest GitHub release for this OS/arch. It mirrors
// what install.sh does (detect platform → resolve latest → download → verify
// → install) but in-process, so an installed user upgrades with one command
// instead of re-piping the installer. No third-party deps — same spirit as the
// hand-rolled OAuth/PKCE client.
package selfupdate

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	repo    = "sharru0701/workout-log"
	binName = "ironlog"
	apiBase = "https://api.github.com/repos/" + repo
	dlBase  = "https://github.com/" + repo + "/releases/download"
)

// Run upgrades the current executable to the latest release. current is the
// build-time version string ("dev" for local `go build`).
func Run(current string) error {
	if current == "dev" || current == "" {
		return fmt.Errorf("개발 빌드(%s)는 자체 업데이트할 수 없습니다 — 릴리스 바이너리에서 사용하세요", current)
	}
	latest, err := latestTag()
	if err != nil {
		return fmt.Errorf("최신 버전 확인 실패: %w", err)
	}
	cur := strings.TrimPrefix(current, "v")
	lat := strings.TrimPrefix(latest, "v")
	if cur == lat {
		fmt.Printf("이미 최신입니다: v%s\n", lat)
		return nil
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}

	fmt.Printf("업데이트 중: v%s → v%s …\n", cur, lat)
	bin, err := downloadBinary(lat)
	if err != nil {
		return err
	}
	if err := replace(exe, bin); err != nil {
		return err
	}
	fmt.Printf("완료: v%s → v%s\n다시 실행하세요: %s\n", cur, lat, binName)
	return nil
}

func get(url, accept string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	// GitHub rejects requests without a User-Agent.
	req.Header.Set("User-Agent", binName+"-selfupdate")
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	return (&http.Client{Timeout: 60 * time.Second}).Do(req)
}

func fetch(url string) ([]byte, error) {
	resp, err := get(url, "")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// latestTag returns the tag_name of the latest GitHub release (e.g. "v0.3.2").
func latestTag() (string, error) {
	resp, err := get(apiBase+"/releases/latest", "application/vnd.github+json")
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API %d", resp.StatusCode)
	}
	var rel struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return "", err
	}
	if rel.TagName == "" {
		return "", fmt.Errorf("응답에 tag_name이 없습니다")
	}
	return rel.TagName, nil
}

// archiveName builds the release archive filename, matching the GoReleaser
// name_template in .goreleaser.yaml: darwin→macos, windows→.zip, else tar.gz.
func archiveName(ver, goos, goarch string) string {
	name := goos
	ext := "tar.gz"
	switch goos {
	case "darwin":
		name = "macos"
	case "windows":
		ext = "zip"
	}
	return fmt.Sprintf("%s_%s_%s_%s.%s", binName, ver, name, goarch, ext)
}

// downloadBinary fetches the release archive for ver, verifies it against
// checksums.txt, and returns the extracted ironlog binary bytes.
func downloadBinary(ver string) ([]byte, error) {
	name := archiveName(ver, runtime.GOOS, runtime.GOARCH)
	base := dlBase + "/v" + ver
	archive, err := fetch(base + "/" + name)
	if err != nil {
		return nil, fmt.Errorf("다운로드 실패 (%s): %w", name, err)
	}
	// Verify the SHA256 against the published checksums. Hard-fail: an
	// unreachable checksums.txt or a missing entry aborts the update — a binary
	// swap must never proceed unverified (GoReleaser always publishes the file,
	// so a legitimate release can't hit this).
	sums, err := fetch(base + "/checksums.txt")
	if err != nil {
		return nil, fmt.Errorf("체크섬 파일(checksums.txt) 다운로드 실패: %w — 무결성 검증 없이는 설치하지 않습니다", err)
	}
	if err := verifyChecksum(string(sums), name, archive); err != nil {
		return nil, err
	}
	if runtime.GOOS == "windows" {
		return extractZip(archive)
	}
	return extractTarGz(archive)
}

// verifyChecksum matches archive's SHA256 against the entry for name in a
// checksums.txt listing. A missing entry is an error, not a pass.
func verifyChecksum(sums, name string, archive []byte) error {
	want := checksumFor(sums, name)
	if want == "" {
		return fmt.Errorf("checksums.txt에 %s 항목이 없습니다 — 무결성 검증 없이는 설치하지 않습니다", name)
	}
	got := sha256.Sum256(archive)
	if hex.EncodeToString(got[:]) != want {
		return fmt.Errorf("체크섬 불일치 (%s) — 손상되었거나 변조되었습니다", name)
	}
	return nil
}

// checksumFor returns the hex SHA256 for file from a `<hash>  <file>` listing.
func checksumFor(sums, file string) string {
	for _, line := range strings.Split(sums, "\n") {
		if f := strings.Fields(line); len(f) == 2 && f[1] == file {
			return f[0]
		}
	}
	return ""
}

func extractTarGz(b []byte) ([]byte, error) {
	gz, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if filepath.Base(h.Name) == binName {
			return io.ReadAll(tr)
		}
	}
	return nil, fmt.Errorf("아카이브에서 %s 바이너리를 찾지 못했습니다", binName)
}

func extractZip(b []byte) ([]byte, error) {
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return nil, err
	}
	for _, f := range zr.File {
		if base := filepath.Base(f.Name); base == binName+".exe" || base == binName {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()
			return io.ReadAll(rc)
		}
	}
	return nil, fmt.Errorf("아카이브에서 %s 바이너리를 찾지 못했습니다", binName)
}

// replace swaps the binary at path with newBin. It writes a temp file in the
// same directory and renames over the target so the swap is atomic and never
// leaves a half-written binary. Linux/macOS allow replacing a running
// executable; on Windows the locked .exe is moved aside first.
func replace(path string, newBin []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, "."+binName+"-new-*")
	if err != nil {
		if os.IsPermission(err) {
			return permErr(path, err)
		}
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op once the rename below consumes it

	if _, err := tmp.Write(newBin); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, 0o755); err != nil {
		return err
	}
	if runtime.GOOS == "windows" {
		_ = os.Rename(path, path+".old") // running .exe is locked; best-effort
	}
	if err := os.Rename(tmpName, path); err != nil {
		if os.IsPermission(err) {
			return permErr(path, err)
		}
		return err
	}
	return nil
}

func permErr(path string, err error) error {
	return fmt.Errorf("%s 에 쓸 권한이 없습니다 (%v)\n  sudo로 다시 실행하거나 install.sh로 재설치하세요:\n  curl -fsSL https://raw.githubusercontent.com/%s/main/apps/tui/install.sh | sh",
		path, err, repo)
}
