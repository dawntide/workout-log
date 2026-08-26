import type { Page } from "@playwright/test";

export type DesignHarmonizationTarget = {
  id: string;
  title: string;
  path: string;
  /**
   * 이 경로가 **리다이렉트 셤**일 때 최종 도착 pathname.
   *
   * 두 종류가 섞여 있고 위험도가 다르다:
   * - `next.config.ts`의 redirects(308) — HTTP 단계라 `page.goto`가 따라간다. 무해.
   * - 서버 컴포넌트 `redirect()` — app router가 **클라이언트 내비게이션**으로 처리한다.
   *   `goto`가 돌아온 시점에 URL은 아직 셤이고, 잠시 뒤 목적지로 바뀐다.
   *
   * 후자를 모르고 감사하면 **아직 비어 있는 셤을 찍는다** — 2026-08-26 실측에서
   * 감사 시점 스크린샷이 2742바이트(단색)였고, `plans-create`·`workout-log-add`·
   * `program-store-detail`이 실행마다 번갈아 실패한 원인이 이거다. 그래서 도착지를
   * 여기 적고 스펙이 `waitForURL`로 기다린다 — 경쟁이 **계약**으로 바뀐다.
   *
   * 셤을 없애면 이 값이 틀려져 테스트가 알려 준다.
   */
  redirectsTo?: string;
  expectsBottomSheet?: boolean;
  /**
   * 이 화면이 반드시 렌더해야 하는 `V2Card` 톤들(카드 첫 줄 텍스트로 식별).
   *
   * 카탈로그가 톤을 빼면 감사가 **조용히 커버리지를 잃는다** — 카드는 여전히 있으니
   * 셀렉터 가드도 안 울린다. 여기 적어 두면 그때 테스트가 말한다.
   */
  expectsCardTones?: readonly string[];
  /**
   * 감사 전에 화면을 **그 상태로 만든다**(시트 열기 등).
   *
   * 의미 톤 카드(accent·danger)의 실제 사용처는 전부 상호작용 뒤에 있어, 경로만
   * 열어서는 닿지 않는다. `/design-system` 카탈로그 감사는 **프리미티브가 톤을
   * 입히는지**까지만 보장하고, 그 카드가 **올바른 배경 위에 놓였는지**는 못 본다 —
   * 실제로 시작 시트를 열어 보니 기본 톤 카드가 paper 시트 위에 얹혀 ΔE=0이었다.
   */
  prepare?: (page: Page) => Promise<void>;
};

export const designHarmonizationTargets: DesignHarmonizationTarget[] = [
  { id: "home", title: "홈", path: "/" },
  { id: "plans", title: "플랜 홈", path: "/plans" },
  // ⚠️ 아래 셤 넷은 결국 /program-store를 감사한다 — program-store 타깃과 화면이 같다.
  // 중복을 감수하는 이유는 "셤이 살아 있고 목적지가 렌더된다"까지 이 스펙이 지키기
  // 때문이다. 화면 커버리지로 세지 말 것.
  { id: "plans-create", title: "플랜 생성", path: "/plans/create", redirectsTo: "/program-store" },
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
  // next.config redirects(308) — HTTP 단계라 경쟁은 없지만, 목적지를 적어 두면
  // 셤이 어디로 가는지가 이 파일에서 읽힌다.
  { id: "workout-today", title: "오늘 운동", path: "/workout/today", redirectsTo: "/" },
  { id: "workout-today-overrides", title: "오늘 운동 오버라이드", path: "/workout/today/overrides", redirectsTo: "/workout/log/overrides" },
  { id: "workout-log", title: "운동 기록", path: "/workout/log" },
  { id: "workout-log-add", title: "운동 기록 추가", path: "/workout/log/add-exercise", redirectsTo: "/workout/log" },
  { id: "workout-log-catalog", title: "운동 기록 카탈로그", path: "/workout/log/exercise-catalog", redirectsTo: "/exercises" },
  { id: "program-store", title: "프로그램 스토어", path: "/program-store" },
  { id: "program-store-create", title: "프로그램 스토어 생성", path: "/program-store/create", redirectsTo: "/program-store" },
  { id: "program-store-customize", title: "프로그램 스토어 커스터마이즈", path: "/program-store/customize", redirectsTo: "/program-store" },
  { id: "program-store-detail", title: "프로그램 스토어 상세", path: "/program-store/detail", redirectsTo: "/program-store" },
  { id: "stats", title: "통계(홈 데크)", path: "/?deck=stats" },
  { id: "settings", title: "설정 홈", path: "/settings" },
  { id: "settings-minimum-plate-modal", title: "설정 최소 원판 모달", path: "/settings/minimum-plate", expectsBottomSheet: true },
  { id: "settings-data-export-modal", title: "설정 데이터 내보내기 모달", path: "/settings/data-export", expectsBottomSheet: true },
  // 2026-07 설정 IA 개편: theme/bodyweight 등은 /settings 인라인 아코디언으로 흡수(직행 URL 404 → 타깃 제거),
  // exercise-management→/exercises, save-policy·ux-thresholds→/settings/debug로 승계.
  { id: "exercises", title: "운동 관리", path: "/exercises" },
  { id: "settings-debug", title: "설정 디버그(저장 정책·UX 임계값)", path: "/settings/debug" },
  { id: "settings-data-modal", title: "설정 데이터 모달", path: "/settings/data", expectsBottomSheet: true },
  { id: "settings-link-entry", title: "설정 딥링크 엔트리", path: "/settings/link?key=settings.theme", redirectsTo: "/settings" },
  { id: "settings-link-invalid", title: "설정 딥링크 에러", path: "/settings/link/settings.unknown", expectsBottomSheet: true },
  // 사용자 화면이 아니라 **프리미티브 카탈로그**다. 여기를 넣는 이유는 하나 —
  // `V2Card`의 6개 톤(accent·danger·success 포함)이 **실제로 렌더되는 유일한 곳**이라,
  // 토큰 계산이 아니라 컴포넌트가 톤을 제대로 입히는지까지 잰다.
  {
    id: "design-system",
    title: "프리미티브 카탈로그",
    path: "/design-system",
    // 의미 톤(accent·danger·success)이 **실제로 렌더되는 유일한 곳**이다. 나머지
    // 사용처 6곳은 전부 상호작용·상태 뒤에 있어 이 감사가 닿지 못한다.
    expectsCardTones: ["paper", "inset", "strong", "accent", "danger", "success"],
  },
  // ── 상호작용으로만 닿는 표면 ──────────────────────────────────────────────
  // 카탈로그가 못 보는 것을 본다: 톤 카드가 **어떤 배경 위에 놓였는가**.
  {
    id: "program-store-start-sheet",
    title: "프로그램 시작 시트",
    path: "/program-store",
    expectsBottomSheet: true,
    expectsCardTones: ["accent"],
    // ⚠️ 첫 번째 `시작하기`를 누르면 안 된다 — 스토어 정렬에 개인화가 붙어 있어
    // 어느 프로그램이 걸릴지 실행마다 달라진다. 이름으로 특정한다.
    prepare: async (page) => {
      await page.getByPlaceholder(/프로그램명, 설명, 태그 검색/).fill("REF5");
      await page
        .locator(".program-list-card")
        .filter({ hasText: "REF5 Adaptive Strength" })
        .first()
        .getByRole("button", { name: /시작하기/ })
        .click();
    },
  },
  {
    id: "calendar-delete-sheet",
    title: "캘린더 기록 삭제 확인",
    path: "/calendar",
    expectsBottomSheet: true,
    expectsCardTones: ["danger"],
    prepare: async (page) => {
      // 기록이 있는 날짜의 세션 칩 → 삭제. 시드에 기록이 있어야 닿는다.
      await page.getByRole("button", { name: /check_circle/ }).first().click();
      await page.getByRole("button", { name: "기록 삭제" }).click();
    },
  },
];
