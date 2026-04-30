import Link from "next/link";
import { APP_ROUTES } from "@/lib/app-routes";
import { getAppCopy, resolveRequestLocale } from "@/lib/i18n/messages";
import { NavRow } from "@/components/workout/nav-row";
import { Button } from "@/components/ui/button";
import { AppPage, PageHeader, PageSection } from "@/components/ui/page-layout";

type NavItem = {
  href: string;
  label: string;
  subtitle: string;
  description: string;
  iconSymbol: string;
};

export default async function PlansIndexPage() {
  const locale = await resolveRequestLocale();
  const copy = getAppCopy(locale);
  const managementItems: NavItem[] = [
    {
      href: APP_ROUTES.plansManage,
      label: copy.plans.managementItems.active.label,
      subtitle: copy.plans.managementItems.active.subtitle,
      description: copy.plans.managementItems.active.description,
      iconSymbol: "assignment",
    },
    {
      href: APP_ROUTES.plansHistory,
      label: copy.plans.managementItems.history.label,
      subtitle: copy.plans.managementItems.history.subtitle,
      description: copy.plans.managementItems.history.description,
      iconSymbol: "history",
    },
  ];

  return (
    <AppPage>
      <PageHeader
        eyebrow={copy.plans.headerEyebrow}
        title={copy.plans.title}
        description={locale === "ko" ? "지금 진행 중인 플랜과 누적 수행 기록을 한눈에 관리하세요." : "Manage your active plans and training history in one place."}
        actions={(
          <Button as={Link} href={APP_ROUTES.programStore} variant="secondary">
            {locale === "ko" ? "프로그램 스토어" : "Program Store"}
          </Button>
        )}
      />

      <PageSection title={copy.plans.managementSection}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
          {managementItems.map((item) => (
            <NavRow key={item.href} item={item} />
          ))}
        </div>
      </PageSection>

      <PageSection title={locale === "ko" ? "빠른 이동" : "Quick Access"}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
          <NavRow
            item={{
              href: APP_ROUTES.programStore,
              label: locale === "ko" ? "프로그램 스토어" : "Program Store",
              subtitle: locale === "ko" ? "시작" : "Start",
              description:
                locale === "ko"
                  ? "새 플랜 시작, 커스텀 프로그램 생성은 프로그램 스토어에서 진행합니다."
                  : "Start new plans and create custom programs directly from the Program Store.",
              iconSymbol: "library_books",
            }}
          />
        </div>
      </PageSection>
    </AppPage>
  );
}
