"use client";
import { errorMessage } from "@/lib/error-message";

import { useEffect, useState } from "react";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useLocale } from "@/components/locale-provider";
import { NoticeStateRows } from "@/components/ui/settings-state";
import { V2NavRow, V2SecondaryBtn } from "@/components/v2/primitives";
import {
  V2SettingsFootnote,
  V2SettingsGroup,
  V2SettingsSection,
  mergeRowSubtitle,
} from "@/components/v2/settings/section";
import { apiInvalidateCache, apiPost } from "@/lib/api";
import { clearLocalAppState } from "@/lib/local-app-state";

type ResetAppDataResponse = {
  ok: boolean;
  summary?: {
    triggeredBy: string;
    baseTemplateCount: number;
    baseExerciseCount: number;
    includeDemoPlans: boolean;
  };
};

export default function SettingsDataPage() {
  const { locale } = useLocale();
  const { confirm, alert } = useAppDialog();
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // 데모 시드는 테스트 계정에서만 노출한다. 실제 경계는 서버가 잡는다(role !== "test" → 403).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { user?: { role?: string } | null };
        if (!cancelled) setIsTestAccount(body.user?.role === "test");
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runSeedDemoPlans = async () => {
    if (seeding) return;
    try {
      setSeeding(true);
      setError(null);
      setNotice(null);

      await apiPost("/api/settings/seed-demo-plans", {});
      // 플랜·프로그램 목록이 통째로 바뀐다 — 캐시를 비워야 새 데이터가 보인다.
      apiInvalidateCache();

      setNotice(
        locale === "ko"
          ? "데모 플랜을 시드했습니다."
          : "Demo plans have been seeded.",
      );
      window.location.assign("/plans");
    } catch (e) {
      setError(
        errorMessage(e) ??
          (locale === "ko" ? "데모 플랜 시드에 실패했습니다." : "Failed to seed demo plans."),
      );
      setSeeding(false);
    }
  };

  const runClearCache = async () => {
    const confirmed = await confirm({
      title: locale === "ko" ? "캐시 전체 삭제" : "Clear All Cache",
      message: locale === "ko"
        ? "서버 통계 캐시, 클라이언트 API 캐시, 브라우저 캐시(Service Worker)를 모두 삭제합니다.\n\n운동 기록이나 설정은 변경되지 않습니다."
        : "This clears the server stats cache, client API cache, and browser cache managed by the Service Worker.\n\nWorkout logs and settings are not changed.",
      confirmText: locale === "ko" ? "삭제" : "Clear",
      cancelText: locale === "ko" ? "취소" : "Cancel",
      tone: "default",
    });
    if (!confirmed) return;

    try {
      setClearingCache(true);
      setError(null);
      setNotice(null);

      await apiPost("/api/settings/clear-cache", {});
      apiInvalidateCache();

      if (typeof window !== "undefined" && "caches" in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((key) => window.caches.delete(key)));
      }

      setNotice(locale === "ko" ? "캐시를 성공적으로 삭제했습니다." : "Cache was cleared successfully.");
    } catch (e) {
      const message = errorMessage(e) ?? (locale === "ko" ? "캐시 삭제에 실패했습니다." : "Failed to clear the cache.");
      setError(message);
      await alert({
        title: locale === "ko" ? "캐시 삭제 실패" : "Cache Clear Failed",
        message,
        tone: "danger",
      });
    } finally {
      setClearingCache(false);
    }
  };

  const runReset = async () => {
    const confirmed = await confirm({
      title: locale === "ko" ? "앱 데이터 초기화" : "Reset App Data",
      message:
        locale === "ko"
          ? "내 계정의 운동기록, 세트, 플랜, 커스텀 프로그램, 통계 캐시, 사용자 설정, UX 이벤트를 삭제합니다.\n\n공용 프로그램 템플릿과 운동종목 카탈로그는 유지되며, 다른 사용자의 데이터는 건드리지 않습니다.\n이 작업은 복구할 수 없습니다."
          : "This deletes this account's workout logs, sets, plans, custom programs, stats cache, user settings, and UX events.\n\nThe shared program templates and exercise catalog are kept, and other users' data is untouched.\nThis action cannot be undone.",
      confirmText: locale === "ko" ? "초기화" : "Reset",
      cancelText: locale === "ko" ? "취소" : "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      setResetting(true);
      setError(null);
      setNotice(null);

      const response = await apiPost<ResetAppDataResponse>("/api/settings/app-reset", {
        confirmToken: "RESET_APP_DATA",
      });

      clearLocalAppState();

      await apiPost("/api/settings/clear-cache", {});
      if (typeof window !== "undefined" && "caches" in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((key) => window.caches.delete(key)));
      }

      const summary =
        response.summary
          ? locale === "ko"
            ? `기본 템플릿 ${response.summary.baseTemplateCount}개와 운동종목 ${response.summary.baseExerciseCount}개를 다시 세팅했습니다.`
            : `Re-seeded ${response.summary.baseTemplateCount} base templates and ${response.summary.baseExerciseCount} exercises.`
          : locale === "ko"
            ? "기본 템플릿과 운동종목을 다시 세팅했습니다."
            : "Re-seeded the base templates and exercises.";

      setNotice(locale === "ko" ? "앱 데이터 초기화를 완료했습니다." : "App data reset is complete.");
      await alert({
        title: locale === "ko" ? "초기화 완료" : "Reset Complete",
        message: locale === "ko"
          ? `앱 데이터를 초기 상태로 되돌렸습니다.\n${summary}\n\n확인 후 설정 홈으로 돌아갑니다.`
          : `App data has been reset to its initial state.\n${summary}\n\nAfter confirming, you will return to the settings home.`,
      });

      window.location.assign("/settings");
    } catch (e) {
      const message = errorMessage(e) ?? (locale === "ko" ? "앱 데이터 초기화에 실패했습니다." : "Failed to reset app data.");
      setError(message);
      await alert({
        title: locale === "ko" ? "초기화 실패" : "Reset Failed",
        message,
        tone: "danger",
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <NoticeStateRows message={notice} tone="success" label={locale === "ko" ? "초기화 완료" : "Reset Complete"} />
      <NoticeStateRows message={error} tone="warning" label={locale === "ko" ? "초기화 실패" : "Reset Failed"} />

      <section>
        <V2SettingsSection title={locale === "ko" ? "캐시 관리" : "Cache Management"} description={locale === "ko" ? "캐시가 오래되거나 표시 오류가 있을 때 수동으로 삭제할 수 있습니다." : "You can clear cache manually when cached data is stale or UI state looks incorrect."} />
        <V2SettingsGroup ariaLabel={locale === "ko" ? "캐시 작업" : "Cache actions"}>
          <V2NavRow
            as="div"
            label={locale === "ko" ? "서버 통계 캐시" : "Server Stats Cache"}
            description={locale === "ko" ? "e1rm, 볼륨, PR 등 집계 결과물" : "Aggregated outputs such as e1RM, volume, and PR stats"}
            value="Stats"
            trailing="none"
          />
          <V2NavRow
            as="div"
            label={locale === "ko" ? "브라우저 캐시" : "Browser Cache"}
            description={locale === "ko" ? "Service Worker가 보관하는 오프라인용 리소스 캐시" : "Offline resource cache stored by the Service Worker"}
            value="SW Cache"
            trailing="none"
          />
        </V2SettingsGroup>
        <V2SecondaryBtn
          full
          style={{ marginTop: "var(--v2-s-2)" }}
          onClick={() => {
            void runClearCache();
          }}
          disabled={clearingCache}
        >
          {clearingCache ? (locale === "ko" ? "캐시 삭제 중..." : "Clearing Cache...") : (locale === "ko" ? "캐시 전체 삭제" : "Clear All Cache")}
        </V2SecondaryBtn>
        <V2SettingsFootnote>{locale === "ko" ? "삭제 후 다음 조회 시 자동으로 재생성됩니다. 운동 기록과 설정은 변경되지 않습니다." : "The cache is regenerated automatically on the next fetch. Workout logs and settings are not changed."}</V2SettingsFootnote>
      </section>

      {isTestAccount && (
        <section>
          <V2SettingsSection
            title={locale === "ko" ? "데모 데이터" : "Demo Data"}
            description={
              locale === "ko"
                ? "테스트 계정에만 보이는 항목입니다. 16개 프로그램의 예시 플랜을 채워 실제에 가까운 상태로 확인합니다."
                : "Visible on test accounts only. Fills in example plans for 16 programs so you can try the app with realistic data."
            }
          />
          <V2SettingsGroup ariaLabel={locale === "ko" ? "데모 데이터" : "Demo data"}>
            <V2NavRow
              as="div"
              label={locale === "ko" ? "만들어지는 데이터" : "Data Created"}
              description={
                locale === "ko"
                  ? "Operator · 5/3/1 · nSuns · GZCLP 등 프로그램별 예시 플랜"
                  : "Example plans per program — Operator, 5/3/1, nSuns, GZCLP, and more"
              }
              value={locale === "ko" ? "플랜" : "Plans"}
              trailing="none"
            />
          </V2SettingsGroup>
          <V2SecondaryBtn
            full
            style={{ marginTop: "var(--v2-s-2)" }}
            onClick={() => {
              void runSeedDemoPlans();
            }}
            disabled={seeding}
          >
            {seeding
              ? locale === "ko"
                ? "시드 중..."
                : "Seeding..."
              : locale === "ko"
                ? "데모 플랜 시드"
                : "Seed Demo Plans"}
          </V2SecondaryBtn>
          <V2SettingsFootnote>
            {locale === "ko"
              ? "이름 기준으로 덮어쓰므로 여러 번 눌러도 중복되지 않고, 직접 만든 플랜은 지워지지 않습니다."
              : "Plans are upserted by name — repeat runs create no duplicates, and plans you made yourself are kept."}
          </V2SettingsFootnote>
        </section>
      )}

      <section>
        <V2SettingsSection title={locale === "ko" ? "데이터 작업" : "Data Actions"} description={locale === "ko" ? "내보내기와 전체 초기화를 한 화면에서 관리합니다." : "Manage export and full reset actions from one place."} />
        <V2SettingsGroup ariaLabel={locale === "ko" ? "데이터 작업" : "Data actions"}>
          <V2NavRow
            as="a"
            href="/settings/data-export"
            label={locale === "ko" ? "데이터 Export" : "Data Export"}
            description={mergeRowSubtitle(
              "Backup",
              locale === "ko" ? "초기화 전에 JSON / CSV 백업을 생성합니다." : "Create a JSON / CSV backup before resetting.",
            )}
            value={locale === "ko" ? "열기" : "Open"}
          />
        </V2SettingsGroup>
        <V2SettingsFootnote>{locale === "ko" ? "초기화 전에 먼저 Export로 백업 파일을 보관하는 편이 안전합니다." : "It is safer to keep an export backup before running a reset."}</V2SettingsFootnote>
      </section>

      <section>
        <V2SettingsSection title={locale === "ko" ? "앱 데이터 초기화" : "Reset App Data"} description={locale === "ko" ? "내 계정의 데이터만 정리하고 기본 카탈로그를 다시 확인합니다." : "Clear only this account's data and re-verify the base catalog."} />
        <V2SettingsGroup ariaLabel={locale === "ko" ? "초기화 범위" : "Reset scope"}>
          <V2NavRow
            as="div"
            label={locale === "ko" ? "삭제되는 데이터" : "Data Removed"}
            description={locale === "ko" ? "운동기록, 세트, 생성 세션, 플랜, 커스텀 프로그램, 통계 캐시, 사용자 설정, UX 이벤트" : "Workout logs, sets, generated sessions, plans, custom programs, stats cache, user settings, and UX events"}
            value={locale === "ko" ? "내 계정" : "This account"}
            trailing="none"
          />
          <V2NavRow
            as="div"
            label={locale === "ko" ? "다시 세팅되는 데이터" : "Data Re-Seeded"}
            description={locale === "ko" ? "기본 프로그램 템플릿과 기본 운동종목 카탈로그" : "Base program templates and the default exercise catalog"}
            value="Base Seed"
            trailing="none"
          />
          <V2NavRow
            as="div"
            label={locale === "ko" ? "생성되지 않는 데이터" : "Data Not Recreated"}
            description={locale === "ko" ? "예시 플랜이나 데모 기록은 다시 만들지 않습니다." : "Demo plans and sample history are not recreated."}
            value={locale === "ko" ? "Demo 없음" : "No Demo"}
            trailing="none"
          />
        </V2SettingsGroup>

        <V2SecondaryBtn
          full
          tone="danger"
          style={{ marginTop: "var(--v2-s-2)" }}
          onClick={() => {
            void runReset();
          }}
          disabled={resetting}
        >
          {resetting ? (locale === "ko" ? "앱 데이터 초기화 중..." : "Resetting App Data...") : (locale === "ko" ? "앱 데이터 초기화" : "Reset App Data")}
        </V2SecondaryBtn>

        <V2SettingsFootnote>
          {locale === "ko"
            ? "이 작업은 내 계정의 데이터만 지우며 복구할 수 없습니다. 다른 사용자의 기록에는 영향을 주지 않습니다. 초기화 후 설정 홈으로 돌아가며, 필요한 경우 새 플랜을 다시 생성해야 합니다."
            : "This clears only this account's data and cannot be undone. Other users' records are unaffected. After the reset you return to settings home, and you may need to create plans again."}
        </V2SettingsFootnote>
      </section>
    </div>
  );
}
