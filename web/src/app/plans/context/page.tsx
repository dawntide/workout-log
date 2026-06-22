import Link from "next/link";
import { APP_ROUTES } from "@/lib/app-routes";
import { getAppCopy, resolveRequestLocale } from "@/lib/i18n/messages";
import { AppPage, PageSection } from "@/components/ui/page-layout";
import { V2SecondaryBtn, V2SectionHeader } from "@/components/v2/primitives";
import { V2Icon } from "@/components/v2/primitives/v2-icon";

type SearchParams = Record<string, string | string[] | undefined>;

function readString(params: SearchParams, key: string, fallback: string) {
  const raw = params[key];
  if (Array.isArray(raw)) return raw[0] ?? fallback;
  return raw ?? fallback;
}

function readPositiveInt(params: SearchParams, key: string, fallback: number) {
  const parsed = Number(readString(params, key, String(fallback)));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
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

function SettingRow({ item }: { item: SettingItem }) {
  return (
    <Link
      href={item.href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--v2-s-4)",
        padding: "var(--v2-s-4)",
        borderRadius: "var(--v2-r-3)",
        background: "var(--v2-paper)",
        textDecoration: "none",
      }}
    >
      <V2Icon name={item.iconSymbol} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="v2-body" style={{ fontWeight: 700 }}>{item.label}</div>
        <div className="v2-small" style={{ color: "var(--v2-ink-2)" }}>{item.description}</div>
      </div>
      <div style={{ fontSize: "var(--v2-t-12)", color: "var(--v2-ink-2)", whiteSpace: "nowrap" }}>{item.currentValue}</div>
    </Link>
  );
}

export default async function PlanContextPage({ searchParams }: { searchParams?: SearchParams | Promise<SearchParams> }) {
  const locale = await resolveRequestLocale();
  const copy = getAppCopy(locale);
  const params = searchParams ? await Promise.resolve(searchParams) : {};
  const userId = readString(params, "userId", "dev");
  const startDate = readString(params, "startDate", new Date().toISOString().slice(0, 10));
  const timezone = readString(params, "timezone", "UTC");
  const sessionKeyMode = readString(params, "sessionKeyMode", "DATE");
  const week = readPositiveInt(params, "week", 1);
  const day = readPositiveInt(params, "day", 1);

  const returnQuery = new URLSearchParams();
  returnQuery.set("userId", userId);
  returnQuery.set("startDate", startDate);
  returnQuery.set("timezone", timezone);
  returnQuery.set("sessionKeyMode", sessionKeyMode);
  returnQuery.set("week", String(week));
  returnQuery.set("day", String(day));
  const returnTo = `${APP_ROUTES.plansContext}?${returnQuery.toString()}`;

  const contextItems: SettingItem[] = [
    { href: toSelectionHref("/plans/context/select/user-id", returnTo), label: copy.plansContext.fields.userId.label, description: copy.plansContext.fields.userId.description, currentValue: userId, iconSymbol: "person" },
    { href: toSelectionHref("/plans/context/picker/start-date", returnTo), label: copy.plansContext.fields.startDate.label, description: copy.plansContext.fields.startDate.description, currentValue: startDate, iconSymbol: "calendar_today" },
    { href: toSelectionHref("/plans/context/select/timezone", returnTo), label: copy.plansContext.fields.timezone.label, description: copy.plansContext.fields.timezone.description, currentValue: timezone, iconSymbol: "schedule" },
    { href: toSelectionHref("/plans/context/select/session-key-mode", returnTo), label: copy.plansContext.fields.sessionKeyMode.label, description: copy.plansContext.fields.sessionKeyMode.description, currentValue: sessionKeyMode, iconSymbol: "key" },
    { href: toSelectionHref("/plans/context/picker/week", returnTo), label: copy.plansContext.fields.week.label, description: copy.plansContext.fields.week.description, currentValue: String(week), iconSymbol: "view_week" },
    { href: toSelectionHref("/plans/context/picker/day", returnTo), label: copy.plansContext.fields.day.label, description: copy.plansContext.fields.day.description, currentValue: String(day), iconSymbol: "today" },
  ];

  return (
    <AppPage>
      <V2SectionHeader level="h1" eyebrow={copy.plansContext.eyebrow} title={copy.plansContext.title} description={copy.plansContext.description} action={<V2SecondaryBtn as="a" href={APP_ROUTES.plansManage}>{copy.plans.manage}</V2SecondaryBtn>} />
      <PageSection title={copy.plansContext.sectionTitle}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
          {contextItems.map((item) => <SettingRow key={item.href} item={item} />)}
        </div>
      </PageSection>
      <PageSection title={copy.plansContext.previewTitle}>
        <div className="history-summary">
          <div className="history-summary__cell"><div className="history-summary__label">{locale === "ko" ? "사용자" : "User"}</div><div className="history-summary__value">{userId}</div></div>
          <div className="history-summary__cell"><div className="history-summary__label">{locale === "ko" ? "시작일" : "Start Date"}</div><div className="history-summary__value">{startDate}</div></div>
          <div className="history-summary__cell"><div className="history-summary__label">{locale === "ko" ? "시간대" : "Timezone"}</div><div className="history-summary__value">{timezone}</div></div>
          <div className="history-summary__cell"><div className="history-summary__label">{locale === "ko" ? "주/일" : "Week/Day"}</div><div className="history-summary__value">W{week} · D{day}</div></div>
        </div>
      </PageSection>
    </AppPage>
  );
}
