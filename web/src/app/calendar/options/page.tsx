import { V2Hairline, V2NavRow, V2PrimaryBtn } from "@/components/v2/primitives";
import { APP_ROUTES } from "@/lib/app-routes";
import { getAppCopy, resolveRequestLocale } from "@/lib/i18n/messages";

type SearchParams = Record<string, string | string[] | undefined>;

function readString(params: SearchParams, key: string, fallback: string) {
  const raw = params[key];
  if (Array.isArray(raw)) return raw[0] ?? fallback;
  return raw ?? fallback;
}

function toSelectionHref(pathname: string, returnTo: string) {
  const sp = new URLSearchParams();
  sp.set("returnTo", returnTo);
  return `${pathname}?${sp.toString()}`;
}

type SettingItem = {
  href: string;
  label: string;
  description: string;
  currentValue: string;
  iconSymbol: string;
};

export default async function CalendarOptionsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const locale = await resolveRequestLocale();
  const copy = getAppCopy(locale);
  const params = searchParams ? await searchParams : {};
  const viewMode = readString(params, "viewMode", "month");
  const timezone = readString(params, "timezone", "UTC");
  const autoOpenMode = readString(params, "autoOpen", "OPEN_ONLY");
  const openTime = readString(params, "openTime", "08:00");

  const returnQuery = new URLSearchParams();
  returnQuery.set("viewMode", viewMode);
  returnQuery.set("timezone", timezone);
  returnQuery.set("autoOpen", autoOpenMode);
  returnQuery.set("openTime", openTime);
  const returnTo = `${APP_ROUTES.calendarOptions}?${returnQuery.toString()}`;

  const optionItems: SettingItem[] = [
    {
      href: toSelectionHref("/calendar/options/select/view-mode", returnTo),
      label: copy.calendarOptions.fields.viewMode.label,
      description: copy.calendarOptions.fields.viewMode.description,
      currentValue: viewMode,
      iconSymbol: "grid_view",
    },
    {
      href: toSelectionHref("/calendar/options/select/timezone", returnTo),
      label: copy.calendarOptions.fields.timezone.label,
      description: copy.calendarOptions.fields.timezone.description,
      currentValue: timezone,
      iconSymbol: "schedule",
    },
    {
      href: toSelectionHref("/calendar/options/select/auto-open", returnTo),
      label: copy.calendarOptions.fields.autoOpen.label,
      description: copy.calendarOptions.fields.autoOpen.description,
      currentValue:
        autoOpenMode === "AUTO_GENERATE"
          ? copy.calendarOptions.fields.autoOpen.autoGenerate
          : copy.calendarOptions.fields.autoOpen.openOnly,
      iconSymbol: "touch_app",
    },
    {
      href: toSelectionHref("/calendar/options/picker/open-time", returnTo),
      label: copy.calendarOptions.fields.openTime.label,
      description: copy.calendarOptions.fields.openTime.description,
      currentValue: openTime,
      iconSymbol: "access_time",
    },
  ];

  return (
    <div>
      <div
        style={{
          paddingBottom: "var(--v2-s-4)",
          marginBottom: "var(--v2-s-7)",
        }}
      >
        <p
          className="v2-eyebrow"
          style={{ color: "var(--v2-accent)", marginBottom: 4 }}
        >
          {copy.calendarOptions.eyebrow}
        </p>
        <h1 className="v2-h1" style={{ margin: "0 0 var(--v2-s-2)" }}>
          {copy.calendarOptions.title}
        </h1>
        <p
          className="v2-small"
          style={{
            color: "var(--v2-ink-2)",
            margin: "0 0 var(--v2-s-4)",
            lineHeight: 1.5,
          }}
        >
          {copy.calendarOptions.description}
        </p>
        <V2PrimaryBtn
          as="a"
          href={APP_ROUTES.calendarHome}
          icon="arrow_back"
          style={{
            minHeight: 44,
            padding: "9px 18px",
            borderRadius: "var(--v2-r-pill)",
            fontSize: 13,
          }}
        >
          {copy.calendarOptions.backToCalendar}
        </V2PrimaryBtn>
        <div style={{ marginTop: "var(--v2-s-4)" }}>
          <V2Hairline />
        </div>
      </div>

      <h2 className="v2-label" style={{ margin: "0 0 var(--v2-s-2)" }}>
        {copy.calendarOptions.sectionTitle}
      </h2>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-1)",
        }}
      >
        {optionItems.map((item) => (
          <V2NavRow
            key={item.href}
            as="a"
            href={item.href}
            icon={item.iconSymbol}
            label={item.label}
            description={item.description}
            value={item.currentValue}
          />
        ))}
      </div>
    </div>
  );
}
