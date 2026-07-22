import type { useLocale } from "@/components/locale-provider";
import type { usePlansManageController } from "@/features/plans-manage/model/use-plans-manage-controller";

/** 화면 전역에서 돌려 쓰는 카피/로케일 타입 — 섹션마다 재선언하지 않는다. */
export type PlansManageCopy = ReturnType<typeof useLocale>["copy"];
export type LocaleKey = "ko" | "en";

/** 컨트롤러 훅의 반환 bag. 시트는 이 bag을 그대로 받고, 리프 섹션은 필요한 조각만 받는다. */
export type PlansManageController = ReturnType<typeof usePlansManageController>;
