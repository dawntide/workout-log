package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestDefaultBase(t *testing.T) {
	if defaultBase == "" {
		t.Fatal("defaultBase must not be empty (release builds inject production via -ldflags)")
	}
	t.Logf("defaultBase (runtime) = %q", defaultBase)
}

func TestDraftsAreNamespacedPerAccount(t *testing.T) {
	base := Config{dir: t.TempDir()}
	a, b := base.WithDraftOwner("user-a"), base.WithDraftOwner("user-b")
	if err := a.SaveDraft([]byte(`{"userId":"user-a"}`)); err != nil {
		t.Fatal(err)
	}
	if err := b.SaveDraft([]byte(`{"userId":"user-b"}`)); err != nil {
		t.Fatal(err)
	}
	gotA, _ := a.LoadDraft()
	gotB, _ := b.LoadDraft()
	if string(gotA) != `{"userId":"user-a"}` || string(gotB) != `{"userId":"user-b"}` || a.draftPath() == b.draftPath() {
		t.Fatalf("account draft collision: a=%q b=%q paths=%q/%q", gotA, gotB, a.draftPath(), b.draftPath())
	}
	if err := b.ClearDraft(); err != nil {
		t.Fatal(err)
	}
	if stillA, _ := a.LoadDraft(); string(stillA) != `{"userId":"user-a"}` {
		t.Fatalf("clearing user-b removed user-a draft: %q", stillA)
	}
}

func TestOwnerlessLegacyDraftRequiresExplicitRecovery(t *testing.T) {
	base := Config{dir: t.TempDir()}
	legacy := []byte(`{"date":"2026-07-14","groups":[{"name":"Squat"}]}`)
	if err := base.SaveDraft(legacy); err != nil {
		t.Fatal(err)
	}
	if err := base.MigrateLegacyDraft("user-a"); err == nil {
		t.Fatal("ownerless draft must not be assigned automatically")
	}
	if old, _ := base.LoadDraft(); old != nil {
		t.Fatalf("legacy draft still present: %q", old)
	}
	quarantined := base.LatestQuarantinedDraft()
	if quarantined == "" {
		t.Fatal("ownerless draft was not quarantined")
	}
	if err := base.RecoverQuarantinedDraft(quarantined, "user-a"); err != nil {
		t.Fatal(err)
	}
	migrated, err := base.WithDraftOwner("user-a").LoadDraft()
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if json.Unmarshal(migrated, &payload) != nil || payload["userId"] != "user-a" || payload["date"] != "2026-07-14" {
		t.Fatalf("migrated payload = %s", migrated)
	}
}

func TestDraftNamespaceIncludesServer(t *testing.T) {
	dir := t.TempDir()
	a := Config{dir: dir, BaseURL: "https://one.example"}.WithDraftOwner("same-user")
	b := Config{dir: dir, BaseURL: "https://two.example"}.WithDraftOwner("same-user")
	if a.draftPath() == b.draftPath() {
		t.Fatal("same user id on different servers must not share a draft")
	}
	if err := a.SaveDraft([]byte(`{"server":"one"}`)); err != nil {
		t.Fatal(err)
	}
	if got, _ := b.LoadDraft(); got != nil {
		t.Fatalf("server-two read server-one draft: %s", got)
	}
}

func TestLegacyRecoveryPreservesExistingOwnerDraft(t *testing.T) {
	base := Config{dir: t.TempDir(), BaseURL: "https://api.example"}
	if err := base.SaveDraft([]byte(`{"date":"2026-07-14"}`)); err != nil {
		t.Fatal(err)
	}
	path, err := base.QuarantineLegacyDraftPath()
	if err != nil || path == "" {
		t.Fatalf("quarantine = %q, %v", path, err)
	}
	owner := base.WithDraftOwner("user-a")
	want := []byte(`{"userId":"user-a","date":"2026-07-15"}`)
	if err := owner.SaveDraft(want); err != nil {
		t.Fatal(err)
	}
	if err := base.RecoverQuarantinedDraft(path, "user-a"); err == nil {
		t.Fatal("recovery must reject an occupied owner namespace")
	}
	if got, _ := owner.LoadDraft(); string(got) != string(want) {
		t.Fatalf("owner draft overwritten: %s", got)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("quarantine was not preserved: %v", err)
	}
}

func TestClaimedLegacyDraftCannotCrossAccounts(t *testing.T) {
	base := Config{dir: t.TempDir(), BaseURL: "https://api.example"}
	if err := base.SaveDraft([]byte(`{"userId":"user-a","date":"2026-07-14"}`)); err != nil {
		t.Fatal(err)
	}
	path, err := base.QuarantineLegacyDraftPath()
	if err != nil || path == "" {
		t.Fatalf("quarantine = %q, %v", path, err)
	}
	if got := base.LatestQuarantinedDraftFor("user-b"); got != "" {
		t.Fatalf("user-b was offered user-a's claimed draft: %q", got)
	}
	if err := base.RecoverQuarantinedDraft(path, "user-b"); err == nil {
		t.Fatal("user-b recovered user-a's claimed draft")
	}
	if err := base.DiscardQuarantinedDraft(path, "user-b"); err == nil {
		t.Fatal("user-b discarded user-a's claimed draft")
	}
	if err := base.DiscardQuarantinedDraft(path, "user-a"); err != nil {
		t.Fatal(err)
	}
}

func TestOwnerlessLegacyRecoveryHasExactlyOneConcurrentWinner(t *testing.T) {
	base := Config{dir: t.TempDir(), BaseURL: "https://api.example"}
	if err := base.SaveDraft([]byte(`{"date":"2026-07-14","groups":[{"name":"Squat"}]}`)); err != nil {
		t.Fatal(err)
	}
	path, err := base.QuarantineLegacyDraftPath()
	if err != nil || path == "" {
		t.Fatalf("quarantine = %q, %v", path, err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, userID := range []string{"user-a", "user-b"} {
		userID := userID
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs <- base.RecoverQuarantinedDraft(path, userID)
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	successes := 0
	for err := range errs {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("successful recoveries = %d, want exactly one", successes)
	}

	ownerDrafts := 0
	for _, userID := range []string{"user-a", "user-b"} {
		data, loadErr := base.WithDraftOwner(userID).LoadDraft()
		if loadErr != nil {
			t.Fatal(loadErr)
		}
		if len(data) == 0 {
			continue
		}
		ownerDrafts++
		var payload map[string]any
		if json.Unmarshal(data, &payload) != nil || payload["userId"] != userID {
			t.Fatalf("%s received cross-account payload: %s", userID, data)
		}
	}
	if ownerDrafts != 1 {
		t.Fatalf("owner drafts = %d, want exactly one", ownerDrafts)
	}
}

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

func TestDraftRoundTrip(t *testing.T) {
	c := Config{dir: t.TempDir()}

	// absent draft is (nil, nil), and clearing it is not an error
	if b, err := c.LoadDraft(); b != nil || err != nil {
		t.Fatalf("LoadDraft(absent) = %v, %v; want nil, nil", b, err)
	}
	if err := c.ClearDraft(); err != nil {
		t.Fatalf("ClearDraft(absent): %v", err)
	}

	want := []byte(`{"date":"2026-07-06"}`)
	if err := c.SaveDraft(want); err != nil {
		t.Fatalf("SaveDraft: %v", err)
	}
	got, err := c.LoadDraft()
	if err != nil || string(got) != string(want) {
		t.Fatalf("LoadDraft = %q, %v; want %q", got, err, want)
	}
	// atomic write leaves no tmp file behind
	if _, err := os.Stat(filepath.Join(c.dir, draftFile+".tmp")); !os.IsNotExist(err) {
		t.Error("SaveDraft must not leave a .tmp file")
	}

	if err := c.ClearDraft(); err != nil {
		t.Fatalf("ClearDraft: %v", err)
	}
	if b, _ := c.LoadDraft(); b != nil {
		t.Error("draft should be gone after ClearDraft")
	}
}
