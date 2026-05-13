export const settingsListTokenDefaults = {
  "--settings-section-header-padding-inline":
    "var(--screen-section-text-inset-inline, var(--screen-text-inset-inline, 1.3rem))",
  "--settings-section-header-gap": "0.22rem",
  "--settings-row-min-height": "max(50px, 3em)",
  "--settings-row-padding-block": "0.84em",
  "--settings-row-padding-inline": "1.1rem",
  "--settings-row-content-gap": "0.84rem",
  "--settings-group-radius": "1.68rem",
  "--settings-group-background": "var(--v2-paper)",
  "--settings-group-border-color": "var(--v2-hairline)",
  "--settings-row-divider-color": "color-mix(in srgb, var(--v2-hairline) 52%, transparent)",
  "--settings-row-divider-inset-start": "var(--settings-row-padding-inline)",
  "--settings-row-divider-inset-end": "var(--settings-row-padding-inline)",
  "--settings-label-color": "var(--v2-ink)",
  "--settings-description-color": "var(--v2-ink-2)",
  "--settings-value-color": "var(--v2-ink-2)",
  "--settings-chevron-color": "var(--v2-ink-3)",
  "--settings-subtitle-color": "var(--v2-ink-2)",
  "--settings-row-icon-size": "2.02rem",
  "--settings-row-icon-radius": "0.62rem",
  "--settings-row-icon-font-size": "0.98rem",
  "--settings-badge-height": "1.15rem",
  "--settings-badge-radius": "999px",
  "--settings-badge-padding-inline": "0.4rem",
  "--settings-switch-off-color": "var(--v2-ink-3)",
  "--settings-switch-on-color": "var(--v2-c-success)",
  "--settings-focus-ring-color": "var(--v2-focus)",
} as const;

export type SettingsListTokenName = keyof typeof settingsListTokenDefaults;

export type SettingsListTokenOverrides = Partial<Record<SettingsListTokenName, string>>;
