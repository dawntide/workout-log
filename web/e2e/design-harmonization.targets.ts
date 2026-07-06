export type DesignHarmonizationTarget = {
  id: string;
  title: string;
  path: string;
  expectsBottomSheet?: boolean;
};

export const designHarmonizationTargets: DesignHarmonizationTarget[] = [
  { id: "home", title: "홈", path: "/" },
  { id: "plans", title: "플랜 홈", path: "/plans" },
  { id: "plans-create", title: "플랜 생성", path: "/plans/create" },
  { id: "plans-manage", title: "플랜 관리", path: "/plans/manage" },
  { id: "plans-context", title: "플랜 컨텍스트", path: "/plans/context" },
  { id: "plans-context-user-id", title: "컨텍스트 사용자", path: "/plans/context/select/user-id" },
  { id: "plans-context-session-key-mode", title: "컨텍스트 세션 키 방식", path: "/plans/context/select/session-key-mode" },
  { id: "plans-context-timezone", title: "컨텍스트 시간대", path: "/plans/context/select/timezone" },
  { id: "plans-context-start-date", title: "컨텍스트 시작일", path: "/plans/context/picker/start-date" },
  { id: "plans-context-week", title: "컨텍스트 주차", path: "/plans/context/picker/week" },
  { id: "plans-context-day", title: "컨텍스트 일차", path: "/plans/context/picker/day" },
  { id: "calendar", title: "캘린더", path: "/calendar" },
  { id: "calendar-options", title: "캘린더 옵션", path: "/calendar/options" },
  { id: "calendar-options-view-mode", title: "캘린더 보기 방식", path: "/calendar/options/select/view-mode" },
  { id: "calendar-options-auto-open", title: "캘린더 열기 동작", path: "/calendar/options/select/auto-open" },
  { id: "calendar-options-timezone", title: "캘린더 시간대", path: "/calendar/options/select/timezone" },
  { id: "calendar-options-open-time", title: "캘린더 기본 열기 시간", path: "/calendar/options/picker/open-time" },
  { id: "workout-today", title: "오늘 운동", path: "/workout/today" },
  { id: "workout-today-overrides", title: "오늘 운동 오버라이드", path: "/workout/today/overrides" },
  { id: "workout-log", title: "운동 기록", path: "/workout/log" },
  { id: "workout-log-add", title: "운동 기록 추가", path: "/workout/log/add-exercise" },
  { id: "workout-log-catalog", title: "운동 기록 카탈로그", path: "/workout/log/exercise-catalog" },
  { id: "program-store", title: "프로그램 스토어", path: "/program-store" },
  { id: "program-store-create", title: "프로그램 스토어 생성", path: "/program-store/create" },
  { id: "program-store-customize", title: "프로그램 스토어 커스터마이즈", path: "/program-store/customize" },
  { id: "program-store-detail", title: "프로그램 스토어 상세", path: "/program-store/detail" },
  { id: "stats", title: "통계(홈 데크)", path: "/?deck=stats" },
  { id: "settings", title: "설정 홈", path: "/settings" },
  { id: "settings-minimum-plate-modal", title: "설정 최소 원판 모달", path: "/settings/minimum-plate", expectsBottomSheet: true },
  { id: "settings-data-export-modal", title: "설정 데이터 내보내기 모달", path: "/settings/data-export", expectsBottomSheet: true },
  // 2026-07 설정 IA 개편: theme/bodyweight 등은 /settings 인라인 아코디언으로 흡수(직행 URL 404 → 타깃 제거),
  // exercise-management→/exercises, save-policy·ux-thresholds→/settings/debug로 승계.
  { id: "exercises", title: "운동 관리", path: "/exercises" },
  { id: "settings-debug", title: "설정 디버그(저장 정책·UX 임계값)", path: "/settings/debug" },
  { id: "settings-data-modal", title: "설정 데이터 모달", path: "/settings/data", expectsBottomSheet: true },
  { id: "settings-link-entry", title: "설정 딥링크 엔트리", path: "/settings/link?key=settings.theme" },
  { id: "settings-link-invalid", title: "설정 딥링크 에러", path: "/settings/link/settings.unknown", expectsBottomSheet: true },
];
