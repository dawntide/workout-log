import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";
import Link from "next/link";
import { MINIMAL_COPY_MODE } from "@/lib/ui/minimal-copy";
import type { SettingsListTokenOverrides } from "./settings-list.tokens";

type BaseGroupedListProps = {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  tokens?: SettingsListTokenOverrides;
};

type SectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
};

type SectionFootnoteProps = {
  children: ReactNode;
  className?: string;
};

type RowTone = "neutral" | "success" | "warning" | "critical" | "disabled";
type RowBadgeTone = "note" | "metric" | "warning";
type RowIconTone = "neutral" | "surface" | "primary" | "success" | "warning" | "info";

type RowBaseProps = {
  rowId?: string;
  label: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  badgeTone?: RowBadgeTone;
  leading?: ReactNode;
  className?: string;
};

type NavigationRowProps = RowBaseProps & {
  href?: string;
  prefetch?: boolean;
  onPress?: () => void;
  value?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  showChevron?: boolean;
};

type ToggleRowProps = RowBaseProps & {
  checked: boolean;
  onCheckedChange: (nextChecked: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
};

type ValueRowProps = RowBaseProps & {
  value: ReactNode;
  wrapValue?: boolean;
  href?: string;
  onPress?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  showChevron?: boolean;
};

type InfoRowProps = RowBaseProps & {
  value?: ReactNode;
  tone?: RowTone;
};

type RowIconProps = {
  symbol: ReactNode;
  tone?: RowIconTone;
  label?: string;
};

type SubtitleRowProps = Omit<NavigationRowProps, "subtitle"> & {
  subtitle: ReactNode;
};

function tokensToStyle(tokens?: SettingsListTokenOverrides): CSSProperties | undefined {
  if (!tokens) return undefined;
  const next: CSSProperties = {};
  for (const [name, value] of Object.entries(tokens)) {
    if (!value) continue;
    (next as Record<string, string>)[name] = value;
  }
  return next;
}

function RowContent({
  label,
  subtitle,
  description,
  badge,
  badgeTone = "note",
  leading,
  trailing,
}: {
  label: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  badgeTone?: RowBadgeTone;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const badgeClassName =
    badgeTone === "metric"
      ? "label label-metric label-sm"
      : badgeTone === "warning"
        ? "label label-warning label-sm"
        : "label label-note label-sm";

  return (
    <div className="row-inner">
      {leading ? <span className="row-leading">{leading}</span> : null}
      <span className="row-label-group">
        <span className="row-label">{label}</span>
        {!MINIMAL_COPY_MODE && (subtitle || description) ? (
          <span className="row-subtitle">
            {subtitle}
            {subtitle && description ? " · " : ""}
            {description}
          </span>
        ) : null}
      </span>
      {(trailing || badge) && (
        <span className="row-trailing">
          {badge ? <span className={badgeClassName}>{badge}</span> : null}
          {trailing}
        </span>
      )}
    </div>
  );
}

export function BaseGroupedList({ children, ariaLabel, tokens }: BaseGroupedListProps) {
  return (
    <ul
      aria-label={ariaLabel}
      style={tokensToStyle(tokens)}
      data-settings-grouped-list="true"
    >
      {children}
    </ul>
  );
}

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <header data-settings-section-header="true">
      <h2>{title}</h2>
      {!MINIMAL_COPY_MODE && description ? <p>{description}</p> : null}
    </header>
  );
}

export function SectionFootnote({ children }: SectionFootnoteProps) {
  if (MINIMAL_COPY_MODE) return null;
  return (
    <p data-settings-footnote="true">
      {children}
    </p>
  );
}

// PERF: RowIcon 렌더마다 switch 실행 → 모듈 레벨 상수 룩업으로 교체
const ROW_ICON_TONE_STYLES: Record<RowIconTone, CSSProperties> = {
  primary: {
    backgroundColor: "color-mix(in srgb, var(--v2-accent) 14%, var(--v2-paper))",
    color: "var(--v2-accent-ink)",
  },
  info: {
    backgroundColor: "color-mix(in srgb, var(--v2-c-info) 14%, var(--v2-paper))",
    color: "var(--v2-c-info)",
  },
  success: {
    backgroundColor: "color-mix(in srgb, var(--v2-c-success) 14%, var(--v2-paper))",
    color: "var(--v2-c-success)",
  },
  warning: {
    backgroundColor: "color-mix(in srgb, var(--v2-c-warning) 14%, var(--v2-paper))",
    color: "var(--v2-c-warning)",
  },
  surface: {
    backgroundColor: "var(--v2-paper-2)",
    color: "var(--v2-ink)",
  },
  neutral: {
    backgroundColor: "var(--v2-paper-3)",
    color: "var(--v2-ink-2)",
  },
};

export function RowIcon({ symbol, tone = "neutral", label }: RowIconProps) {
  return (
    <span
      className="settings-row-icon"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        fontSize: "14px",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        ...ROW_ICON_TONE_STYLES[tone],
      }}
    >
      {symbol}
    </span>
  );
}

export function NavigationRow({
  rowId,
  label,
  subtitle,
  description,
  badge,
  badgeTone,
  leading,
  href,
  prefetch,
  onPress,
  value,
  disabled = false,
  ariaLabel,
  showChevron = true,
}: NavigationRowProps) {
  const hasLeading = Boolean(leading);
  const showChevronIndicator = showChevron;
  const trailing = (
    <>
      {!showChevronIndicator && value ? <span>{value}</span> : null}
      {showChevronIndicator ? (
        <span aria-hidden="true" />
      ) : null}
    </>
  );

  if (href && !disabled) {
    return (
      <li id={rowId} data-settings-row="navigation" data-has-leading={hasLeading ? "true" : "false"}>
        <Link
          href={href}
          prefetch={prefetch}
          aria-label={ariaLabel}
          data-settings-touch-target="true"
        >
          <RowContent
            label={label}
            subtitle={subtitle}
            description={description}
            badge={badge}
            badgeTone={badgeTone}
            leading={leading}
            trailing={trailing}
          />
        </Link>
      </li>
    );
  }

  if (!href && !onPress) {
    return (
      <li id={rowId} data-settings-row="navigation" data-has-leading={hasLeading ? "true" : "false"}>
        <div aria-label={ariaLabel} data-settings-touch-target="true">
          <RowContent
            label={label}
            subtitle={subtitle}
            description={description}
            badge={badge}
            badgeTone={badgeTone}
            leading={leading}
            trailing={trailing}
          />
        </div>
      </li>
    );
  }

  return (
    <li id={rowId} data-settings-row="navigation" data-has-leading={hasLeading ? "true" : "false"}>
      <button
        type="button"
        onClick={onPress}
        disabled={disabled}
        aria-label={ariaLabel}
        data-settings-touch-target="true"
      >
        <RowContent
          label={label}
          subtitle={subtitle}
          description={description}
          badge={badge}
          badgeTone={badgeTone}
          leading={leading}
          trailing={trailing}
        />
      </button>
    </li>
  );
}

export function ToggleRow({
  rowId,
  label,
  subtitle,
  description,
  badge,
  badgeTone,
  leading,
  checked,
  onCheckedChange,
  disabled = false,
  id,
  name,
}: ToggleRowProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasLeading = Boolean(leading);

  const trailing = (
    <span>
      <input
        id={inputId}
        name={name}
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        disabled={disabled}
      />
      <span aria-hidden="true">
        <span />
      </span>
    </span>
  );

  return (
    <li id={rowId} data-settings-row="toggle" data-has-leading={hasLeading ? "true" : "false"}>
      <label htmlFor={inputId} data-settings-touch-target="true">
        <RowContent
          label={label}
          subtitle={subtitle}
          description={description}
          badge={badge}
          badgeTone={badgeTone}
          leading={leading}
          trailing={trailing}
        />
      </label>
    </li>
  );
}

export function ValueRow({
  rowId,
  label,
  subtitle,
  description,
  badge,
  badgeTone,
  leading,
  value,
  href,
  onPress,
  disabled = false,
  ariaLabel,
  showChevron,
}: ValueRowProps) {
  const hasLeading = Boolean(leading);
  const isInteractive = Boolean((href || onPress) && !disabled);
  const showChevronIndicator = showChevron ?? isInteractive;
  const trailing = (
    <>
      {!showChevronIndicator ? <span>{value}</span> : null}
      {showChevronIndicator ? (
        <span aria-hidden="true" />
      ) : null}
    </>
  );

  if (href && !disabled) {
    return (
      <li id={rowId} data-settings-row="value" data-has-leading={hasLeading ? "true" : "false"}>
        <Link href={href} aria-label={ariaLabel} data-settings-touch-target="true">
          <RowContent
            label={label}
            subtitle={subtitle}
            description={description}
            badge={badge}
            badgeTone={badgeTone}
            leading={leading}
            trailing={trailing}
          />
        </Link>
      </li>
    );
  }

  if (!href && onPress) {
    return (
      <li id={rowId} data-settings-row="value" data-has-leading={hasLeading ? "true" : "false"}>
        <button
          type="button"
          onClick={onPress}
          disabled={disabled}
          aria-label={ariaLabel}
          data-settings-touch-target="true"
        >
          <RowContent
            label={label}
            subtitle={subtitle}
            description={description}
            badge={badge}
            badgeTone={badgeTone}
            leading={leading}
            trailing={trailing}
          />
        </button>
      </li>
    );
  }

  return (
    <li id={rowId} data-settings-row="value" data-has-leading={hasLeading ? "true" : "false"}>
      <div data-settings-touch-target="true">
        <RowContent
          label={label}
          subtitle={subtitle}
          description={description}
          badge={badge}
          badgeTone={badgeTone}
          leading={leading}
          trailing={trailing}
        />
      </div>
    </li>
  );
}

export function InfoRow({
  rowId,
  label,
  subtitle,
  description,
  badge,
  badgeTone,
  leading,
  value,
}: InfoRowProps) {
  const hasLeading = Boolean(leading);

  return (
    <li id={rowId} data-settings-row="info" data-has-leading={hasLeading ? "true" : "false"}>
      <div data-settings-touch-target="true">
        <RowContent
          label={label}
          subtitle={subtitle}
          description={description}
          badge={badge}
          badgeTone={badgeTone}
          leading={leading}
          trailing={value ? <span>{value}</span> : undefined}
        />
      </div>
    </li>
  );
}

export function SubtitleRow(props: SubtitleRowProps) {
  return <NavigationRow {...props} />;
}

export type {
  BaseGroupedListProps,
  SectionHeaderProps,
  SectionFootnoteProps,
  RowIconProps,
  SubtitleRowProps,
  RowIconTone,
  RowBadgeTone,
  NavigationRowProps,
  ToggleRowProps,
  ValueRowProps,
  InfoRowProps,
};
