"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isOnboardingDone, markOnboardingDone } from "./onboarding-state";

/**
 * 첫 방문 감지 컴포넌트.
 * - localStorage에 done 플래그 없으면 /onboarding으로 1회 redirect.
 * - 기존 사용자(이미 데이터가 쌓인 사용자)에게는 깜빡임이 안 나도록,
 *   prop으로 "이미 활성 데이터 보유" 신호(`hasExistingData`)를 받으면 자동으로 done 마킹만 하고 끝낸다.
 *   → 이 앱은 싱글유저라 처음 빌드하는 사용자에만 정확히 동작.
 *
 * 깜빡임 최소화: useEffect가 hydration 직후 1회만 동작. SSR에는 영향 없음.
 */
export function V2OnboardingRedirect({
  hasExistingData,
}: {
  hasExistingData: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (isOnboardingDone()) return;

    // 이미 사용 흔적이 있으면 자동 트리거 안 함 (재설치/캐시 클리어 한 기존 사용자 대응)
    if (hasExistingData) {
      markOnboardingDone();
      return;
    }

    router.replace("/onboarding");
  }, [hasExistingData, router]);

  return null;
}
