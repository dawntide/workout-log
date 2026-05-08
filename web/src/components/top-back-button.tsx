"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";

function titleFromPathname(pathname: string, locale: "ko" | "en") {
  if (pathname === "/") return locale === "ko" ? "홈" : "Home";
  if (pathname.startsWith("/workout/log/add-exercise")) return locale === "ko" ? "운동 추가" : "Add Exercise";
  if (pathname.startsWith("/workout/log/overrides")) return locale === "ko" ? "세션 조정" : "Session Overrides";
  if (pathname.startsWith("/workout/log")) return locale === "ko" ? "기록" : "Log";
  if (pathname.startsWith("/exercises")) return locale === "ko" ? "운동" : "Exercises";
  if (pathname.startsWith("/program-store/create")) return locale === "ko" ? "프로그램 만들기" : "Create Program";
  if (pathname.startsWith("/program-store/customize")) return locale === "ko" ? "프로그램 수정" : "Edit Program";
  if (pathname.startsWith("/program-store/detail")) return locale === "ko" ? "프로그램 상세" : "Program Details";
  if (pathname.startsWith("/program-store")) return locale === "ko" ? "프로그램" : "Programs";
  if (pathname.startsWith("/stats")) return locale === "ko" ? "통계" : "Stats";
  if (pathname.startsWith("/settings/theme")) return locale === "ko" ? "테마" : "Theme";
  if (pathname.startsWith("/settings/minimum-plate")) return locale === "ko" ? "최소 원판" : "Minimum Plate";
  if (pathname.startsWith("/settings/bodyweight")) return locale === "ko" ? "몸무게" : "Bodyweight";
  if (pathname.startsWith("/settings/exercise-management")) return locale === "ko" ? "운동종목 관리" : "Exercise Management";
  if (pathname.startsWith("/settings/data-export")) return locale === "ko" ? "데이터 내보내기" : "Data Export";
  if (pathname.startsWith("/settings/about")) return locale === "ko" ? "앱 정보" : "About";
  if (pathname.startsWith("/settings")) return locale === "ko" ? "설정" : "Settings";
  return locale === "ko" ? "운동 기록" : "Workout Log";
}

export function TopBackButton() {
  const { locale } = useLocale();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const title = titleFromPathname(pathname, locale);
  const isSettingsRoute = pathname.startsWith("/settings");

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }, [router]);

  return (
    <div>
      <div>
        <button type="button" onClick={handleBack} aria-label={locale === "ko" ? "뒤로 가기" : "Go back"}>
          <span aria-hidden="true" />
        </button>
      </div>
      <div>{title}</div>
      <div>
        <Link
          href="/settings"
          aria-label={locale === "ko" ? "설정" : "Settings"}
          aria-current={isSettingsRoute ? "page" : undefined}
        >
          <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'wght' 400" }}>settings</span>
        </Link>
      </div>
    </div>
  );
}
