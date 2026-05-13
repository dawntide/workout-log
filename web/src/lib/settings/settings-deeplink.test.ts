import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSettingsDeepLink,
  toSettingsDeepLinkHref,
  toSettingsRowAnchorId,
} from "./settings-deeplink";

test("toSettingsDeepLinkHref builds canonical key route", () => {
  const href = toSettingsDeepLinkHref({ key: "settings.save-policy", source: "search" });
  assert.equal(href, "/settings/link/settings.save-policy?source=search");
});

test("resolveSettingsDeepLink resolves known key and row anchor", () => {
  // After S-6-A IA compaction, the save-policy page was consolidated into
  // /settings/debug. The settings-search-index now maps the save-policy key
  // there. Deeplink row anchors still resolve normally against the new path.
  const resolved = resolveSettingsDeepLink({
    key: "settings.save-policy",
    row: "auto-sync",
  });

  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.entry.path, "/settings/debug");
    assert.equal(resolved.anchorId, "row-auto-sync");
    assert.equal(resolved.target, "/settings/debug?row=auto-sync&source=deeplink#row-auto-sync");
  }
});

test("resolveSettingsDeepLink rejects unknown key", () => {
  const resolved = resolveSettingsDeepLink({ key: "settings.unknown" });
  assert.equal(resolved.ok, false);
  if (!resolved.ok) {
    assert.equal(resolved.errorCode, "unknown_key");
  }
});

test("resolveSettingsDeepLink rejects invalid row token", () => {
  const resolved = resolveSettingsDeepLink({ key: "settings.save-policy", row: "..//bad row" });
  assert.equal(resolved.ok, false);
  if (!resolved.ok) {
    assert.equal(resolved.errorCode, "invalid_row");
  }
});

test("toSettingsRowAnchorId normalizes row key", () => {
  assert.equal(toSettingsRowAnchorId("Prefs.Auto Sync"), "row-prefs-auto-sync");
});
