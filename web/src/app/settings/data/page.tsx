"use client";
import { errorMessage } from "@/lib/error-message";

import { useState } from "react";
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

type ResetAppDataResponse = {
  ok: boolean;
  summary?: {
    triggeredBy: string;
    baseTemplateCount: number;
    baseExerciseCount: number;
    includeDemoPlans: boolean;
  };
};

const LOCAL_STORAGE_PREFIXES = ["workout-log.setting.v1."];
const LOCAL_STORAGE_KEYS = [
  "workout-log.pending-logs.v1",
  "workoutlog:ux-events",
  "workoutlog:ux-events-synced-ids",
  "workoutlog:focus-mode",
] as const;

function clearLocalAppState() {
  apiInvalidateCache();
  if (typeof window === "undefined") return;

  try {
    const removeKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (LOCAL_STORAGE_KEYS.includes(key as (typeof LOCAL_STORAGE_KEYS)[number])) {
        removeKeys.push(key);
        continue;
      }
      if (LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        removeKeys.push(key);
      }
    }
    for (const key of removeKeys) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // noop
  }


}

export default function SettingsDataPage() {
  const { locale } = useLocale();
  const { confirm, alert } = useAppDialog();
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

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
          ? "기존 운동기록, 세트, 플랜, 커스텀 프로그램, 통계 캐시, 사용자 설정, UX 이벤트를 모두 삭제합니다.\n\n기본 프로그램 템플릿과 기본 운동종목은 새로 다시 세팅됩니다.\n이 작업은 복구할 수 없습니다."
          : "This deletes workout logs, sets, plans, custom programs, stats cache, user settings, and UX events.\n\nBase program templates and the default exercise catalog will be seeded again.\nThis action cannot be undone.",
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
        <V2SettingsSection title={locale === "ko" ? "앱 데이터 초기화" : "Reset App Data"} description={locale === "ko" ? "앱 전체 데이터를 정리하고 기본 카탈로그만 다시 세팅합니다." : "Clear app-wide data and seed only the base catalog again."} />
        <V2SettingsGroup ariaLabel={locale === "ko" ? "초기화 범위" : "Reset scope"}>
          <V2NavRow
            as="div"
            label={locale === "ko" ? "삭제되는 데이터" : "Data Removed"}
            description={locale === "ko" ? "운동기록, 세트, 생성 세션, 플랜, 커스텀 프로그램, 통계 캐시, 사용자 설정, UX 이벤트" : "Workout logs, sets, generated sessions, plans, custom programs, stats cache, user settings, and UX events"}
            value={locale === "ko" ? "전체" : "All"}
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
            ? "이 작업은 앱 전체 데이터를 대상으로 하며 복구할 수 없습니다. 초기화 후 설정 홈으로 돌아가며, 필요한 경우 새 플랜을 다시 생성해야 합니다."
            : "This action affects all app data and cannot be undone. After the reset you return to settings home, and you may need to create plans again."}
        </V2SettingsFootnote>
      </section>
    </div>
  );
}
