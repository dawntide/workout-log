import Link from "next/link";
import type { ReactNode } from "react";
import { V2Icon } from "@/components/v2/primitives/v2-icon";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type AppPageProps = {
  children: ReactNode;
  className?: string;
  density?: "default" | "compact";
};

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

type SectionHeadingProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

type PageSectionProps = SectionHeadingProps & {
  children: ReactNode;
};

type StatusPillTone = "neutral" | "accent" | "success" | "warning" | "danger";

type StatusPillProps = {
  children: ReactNode;
  tone?: StatusPillTone;
  className?: string;
};

type ActionLinkRowProps = {
  href: string;
  onClick?: () => void;
  icon?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  className?: string;
  tone?: "default" | "accent";
};

type StateBlockTone = "neutral" | "accent" | "success" | "warning" | "danger";

type StateBlockProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: string;
  tone?: StateBlockTone;
  className?: string;
};

type FieldLabelProps = {
  children: ReactNode;
  className?: string;
};

type HelperTextProps = {
  children: ReactNode;
  className?: string;
};

export function AppPage({
  children,
  className = "",
  density = "default",
}: AppPageProps) {
  return (
    <div className={cx("app-page", density === "compact" && "app-page--compact", className)}>
      {children}
    </div>
  );
}

export function PageHeader(props: PageHeaderProps) {
  const {
    eyebrow,
    title,
    description,
    actions,
    className = "",
  } = props;

  return (
    <header className={cx("page-header", className)}>
      <div className="page-header__body">
        {eyebrow ? <p className="page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="page-header__title">{title}</h1>
        {description ? (
          <p className="page-header__description">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className = "",
}: SectionHeadingProps) {
  return (
    <div className={cx("section-heading", className)}>
      <div className="section-heading__body">
        {eyebrow ? <div className="section-heading__eyebrow">{eyebrow}</div> : null}
        <h2 className="section-heading__title">{title}</h2>
        {description ? <p className="section-heading__description">{description}</p> : null}
      </div>
      {action ? <div className="section-heading__action">{action}</div> : null}
    </div>
  );
}

export function PageSection({
  children,
  eyebrow,
  title,
  description,
  action,
  className = "",
}: PageSectionProps) {
  return (
    <section className={cx("app-section", className)}>
      {title ? (
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
          action={action}
        />
      ) : null}
      {children}
    </section>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
  className = "",
}: StatusPillProps) {
  return (
    <span className={cx("app-pill", className)} data-tone={tone}>
      {children}
    </span>
  );
}

export function ActionLinkRow({
  href,
  onClick,
  icon,
  eyebrow,
  title,
  description,
  meta,
  badge,
  className = "",
  tone = "default",
}: ActionLinkRowProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cx("app-action-row", className)}
      data-tone={tone}
    >
      {icon ? (
        <span className="app-action-row__icon-wrap" aria-hidden="true">
          <V2Icon name={icon} className="app-action-row__icon" weight={300} />
        </span>
      ) : null}

      <div className="app-action-row__body">
        {eyebrow ? <div className="app-action-row__eyebrow">{eyebrow}</div> : null}
        <div className="app-action-row__title-row">
          <div className="app-action-row__title">{title}</div>
          {badge ? <div className="app-action-row__badge">{badge}</div> : null}
        </div>
        {description ? <div className="app-action-row__description">{description}</div> : null}
        {meta ? <div className="app-action-row__meta">{meta}</div> : null}
      </div>

      <span className="app-action-row__chevron" aria-hidden="true">
        <V2Icon name="chevron_right" weight={300} />
      </span>
    </Link>
  );
}

export function StateBlock({
  title,
  description,
  action,
  icon = "info",
  tone = "neutral",
  className = "",
}: StateBlockProps) {
  return (
    <div className={cx("app-state-block", className)} data-tone={tone}>
      <div className="app-state-block__icon" aria-hidden="true">
        <V2Icon name={icon} fill weight={400} />
      </div>
      <div className="app-state-block__body">
        <div className="app-state-block__title">{title}</div>
        {description ? <div className="app-state-block__description">{description}</div> : null}
        {action ? <div className="app-state-block__action">{action}</div> : null}
      </div>
    </div>
  );
}

// StickyActionBar는 바텀 네비 compact에 연동돼야 해(useNavScrollCompact 구독)
// client 컴포넌트로 분리했다.
export { StickyActionBar } from "./sticky-action-bar";

export function FieldLabel({ children, className = "" }: FieldLabelProps) {
  return <div className={cx("app-field-label", className)}>{children}</div>;
}

export function HelperText({ children, className = "" }: HelperTextProps) {
  return <p className={cx("app-helper-text", className)}>{children}</p>;
}
