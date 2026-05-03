import Link from "next/link";
import { APP_ROUTES } from "@/lib/app-routes";
import { NavRow } from "@/components/workout/nav-row";
import { PageSection } from "@/components/ui/page-layout";
import type {
  HomeData,
  HomeLastSession,
  HomePlanOverview,
  HomeTodaySummary,
  HomeWeeklySummary,
} from "@/lib/home/home-data-source";
import type { AppCopy, AppLocale } from "@/lib/i18n/messages";

// ─── Helpers ──────────────────────────────────────────────────────────

function formatVolumeTons(kg: number): string {
  const tons = kg / 1000;
  return tons % 1 === 0 ? `${tons}` : `${tons.toFixed(1)}`;
}

function formatDurationMin(sets: number): number {
  return Math.max(20, Math.round(sets * 2));
}

function todayDateString(locale: string, options: Intl.DateTimeFormatOptions): string {
  const now = new Date();
  return now.toLocaleDateString(locale, options);
}

// ─── Section 1: Welcome Header ────────────────────────────────────────

function WelcomeSection({ today, copy, locale }: { today: HomeTodaySummary; copy: AppCopy; locale: AppLocale }) {
  const hasPlan = today.hasPlan;
  const statusLabel = hasPlan ? copy.home.welcome.active : copy.home.welcome.noPlan;

  return (
    <section className="hd-welcome">
      <p className="hd-welcome__status">{statusLabel}</p>
      <h1 className="hd-welcome__title">{todayDateString(locale, copy.home.todayDate)}</h1>
    </section>
  );
}

// ─── Section 2: Today's Protocol Card ────────────────────────────────

function TodayProtocolCard({
  today,
  planOverview,
  weeklySummary,
  copy,
}: {
  today: HomeTodaySummary;
  planOverview: HomePlanOverview;
  weeklySummary: HomeWeeklySummary;
  copy: AppCopy;
}) {
  const hasPlan = planOverview.totalPlans > 0;
  const programName = planOverview.highlightedProgramName ?? planOverview.highlightedPlanName ?? null;
  const planName = planOverview.highlightedPlanName ?? today.programName;
  const hasTodayActivity = today.completedSets > 0;
  const isTodayComplete =
    hasTodayActivity &&
    today.totalPlannedSets > 0 &&
    today.completedSets >= today.totalPlannedSets;

  const completedDays = weeklySummary.days.filter((d) => d.hasWorkout).length;
  const totalDays = weeklySummary.days.length;
  const weekProgressPct = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

  const ctaLabel = isTodayComplete
    ? copy.home.protocol.logMore
    : hasTodayActivity
      ? copy.home.protocol.continue
      : hasPlan
        ? copy.home.protocol.start
        : copy.home.protocol.chooseProgram;
  const ctaIcon = isTodayComplete ? "add" : "play_arrow";
  const ctaHref = today.href;

  if (!hasPlan) {
    return (
      <section className="hd-section">
        <div className="hd-section__header">
          <h3 className="hd-section__title">{copy.home.protocol.title}</h3>
        </div>
        <div className="hd-protocol hd-protocol--empty">
          <div className="hd-protocol__inner">
            <span className="hd-protocol__eyebrow">{copy.home.protocol.noProgram}</span>
            <h4 className="hd-protocol__name">{copy.home.protocol.selectProgram}</h4>
            <p className="hd-protocol__empty-desc">
              {copy.home.protocol.emptyDescription}
            </p>
            <Link href={APP_ROUTES.programStore} className="hd-cta-btn">
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
              >
                library_books
              </span>
              <span>{copy.home.protocol.browsePrograms}</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="hd-section">
      <div className="hd-section__header">
        <h3 className="hd-section__title">{copy.home.protocol.title}</h3>
        {planOverview.lastPerformedAtLabel && (
          <span className="hd-section__meta">{copy.home.protocol.lastPerformed} {planOverview.lastPerformedAtLabel}</span>
        )}
      </div>

      <div className="hd-protocol">
        <div className="hd-protocol__gradient" aria-hidden="true" />
        <div className="hd-protocol__inner">
          {programName && (
            <span className="hd-protocol__eyebrow">{programName}</span>
          )}
          <h4 className="hd-protocol__name">{planName}</h4>

          <div className="hd-protocol__progress">
            <div className="hd-protocol__progress-labels">
              <span className="hd-protocol__progress-label">{copy.home.protocol.weeklyActivity}</span>
              <span className="hd-protocol__progress-pct">{weekProgressPct}%</span>
            </div>
            <div className="hd-protocol__progress-track" role="progressbar" aria-valuenow={weekProgressPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="hd-protocol__progress-fill" style={{ width: `${weekProgressPct}%` }} />
            </div>
          </div>

          <div
            className="hd-protocol__week-dots"
            aria-label={copy.home.protocol.recent7Days}
          >
            {weeklySummary.days.map((day) => (
              <div
                key={day.key}
                className="hd-protocol__week-day"
                aria-label={`${day.dateLabel} ${day.shortLabel} ${day.hasWorkout ? copy.home.protocol.workedOut : copy.home.protocol.rest}`}
              >
                <span className="hd-protocol__day-label">{day.shortLabel}</span>
                <span
                  className={`hd-protocol__dot ${day.hasWorkout ? "hd-protocol__dot--active" : ""} ${day.isToday ? "hd-protocol__dot--today" : ""}`}
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>

          {isTodayComplete && (
            <div className="hd-protocol__done-badge" role="status">
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
              >
                check_circle
              </span>
              <span>{copy.home.protocol.doneToday}</span>
            </div>
          )}

          <Link href={ctaHref} className="hd-cta-btn">
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            >
              {ctaIcon}
            </span>
            <span>{ctaLabel}</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Section 4: Last Entry Bento ─────────────────────────────────────

function LastEntryBento({ session, copy }: { session: HomeLastSession; copy: AppCopy }) {
  const totalVolumeTons = formatVolumeTons(session.totalVolume);
  const durationMin = formatDurationMin(session.totalSets);

  const prCount = session.exercises.filter(
    (ex) => ex.weightDelta !== null && ex.weightDelta <= 0
  ).length;

  return (
    <section className="hd-section">
      <div className="hd-section__header">
        <h3 className="hd-section__title">{copy.home.lastSession.title}</h3>
        <span className="hd-section__meta">{session.date}</span>
      </div>

      <Link href={session.href} className="hd-bento-grid" aria-label={copy.home.lastSession.ariaLabel(session.planName)}>
        <div className="hd-bento-tile hd-bento-tile--wide">
          <div>
            <p className="hd-bento-tile__label">{copy.home.lastSession.totalWorkload}</p>
            <div className="hd-bento-tile__value-row">
              <span className="hd-bento-tile__number">{totalVolumeTons}</span>
              <span className="hd-bento-tile__unit">{copy.home.lastSession.tons}</span>
            </div>
            <p className="hd-bento-tile__sub">{session.planName}</p>
          </div>
          <span className="material-symbols-outlined hd-bento-tile__icon hd-bento-tile__icon--secondary">
            fitness_center
          </span>
        </div>

        <div className="hd-bento-tile">
          <p className="hd-bento-tile__label">{copy.home.lastSession.duration}</p>
          <div className="hd-bento-tile__value-row">
            <span className="hd-bento-tile__number">{durationMin}</span>
            <span className="hd-bento-tile__unit">{copy.home.lastSession.min}</span>
          </div>
          <p className="hd-bento-tile__sub">{session.totalSets} {copy.home.lastSession.sets}</p>
        </div>

        <div className="hd-bento-tile hd-bento-tile--pr">
          <p className="hd-bento-tile__label">{copy.home.lastSession.goalHits}</p>
          <div className="hd-bento-tile__value-row hd-bento-tile__value-row--tertiary">
            <span className="hd-bento-tile__number">{prCount}</span>
            <span
              className="material-symbols-outlined hd-bento-tile__star"
              style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            >
              stars
            </span>
          </div>
          <p className="hd-bento-tile__sub">{session.exercises.length} {copy.home.lastSession.exercises}</p>
        </div>
      </Link>
    </section>
  );
}

// ─── Section 5: Logistics Quick Links ────────────────────────────────

function LogisticsSection({ copy, locale }: { copy: AppCopy; locale: AppLocale }) {
  const links = [
    {
      href: APP_ROUTES.programStore,
      icon: "library_books",
      title: copy.home.logistics.links.programStore.title,
      subtitle: copy.home.logistics.links.programStore.subtitle,
    },
    {
      href: APP_ROUTES.plansHome,
      icon: "calendar_month",
      title: copy.home.logistics.links.plans.title,
      subtitle: copy.home.logistics.links.plans.subtitle,
    },
    {
      href: APP_ROUTES.statsHome,
      icon: "show_chart",
      title: copy.home.logistics.links.stats.title,
      subtitle: copy.home.logistics.links.stats.subtitle,
    },
  ];

  return (
    <PageSection title={copy.home.logistics.title}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
        {links.map((link) => (
          <NavRow
            key={link.href}
            item={{
              href: link.href,
              iconSymbol: link.icon,
              subtitle: locale === "ko" ? "바로가기" : "Shortcut",
              label: link.title,
              description: link.subtitle,
            }}
          />
        ))}
      </div>
    </PageSection>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────

export function HomeDashboard({ data, copy, locale }: { data: HomeData; copy: AppCopy; locale: AppLocale }) {
  return (
    <div className="hd-root">
      <WelcomeSection today={data.today} copy={copy} locale={locale} />
      <TodayProtocolCard
        today={data.today}
        planOverview={data.planOverview}
        weeklySummary={data.weeklySummary}
        copy={copy}
      />
      {data.lastSession && <LastEntryBento session={data.lastSession} copy={copy} />}
      <LogisticsSection copy={copy} locale={locale} />
    </div>
  );
}
