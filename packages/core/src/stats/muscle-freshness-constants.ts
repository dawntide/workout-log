/**
 * 신선도 모델 상수 — **의존성 0인 leaf 모듈이다.**
 *
 * `muscle-freshness.ts`가 아니라 여기 두는 이유: 설정
 * (`settings/workout-preferences.ts`)이 기본값을 알아야 하는데, 그 파일은
 * 클라이언트가 직접 import한다. `muscle-freshness.ts`는 `category-to-muscle` →
 * `all-exercises`(오픈 카탈로그 723종)를 끌고 오므로, 설정이 그쪽을 참조하면
 * 카탈로그가 통째로 클라이언트 번들에 실린다(#695에서 실제로 겪었다).
 *
 * 값을 양쪽에 복제하는 대신 여기 한 벌만 두고 둘 다 여기를 본다.
 */
export const MUSCLE_FRESHNESS_DEFAULTS = {
  /** 완전 회복까지의 시간. 6일 — Fitbod 공개 파라미터를 초기값으로 삼았다. */
  recoveryHours: 144,
  /** capacity 산출 창. 8주. */
  capacityWeeks: 8,
} as const;

/**
 * 사용자가 고를 수 있는 회복 시간 — 4~8일.
 *
 * 연속 값이 아니라 목록인 이유: 이 파라미터는 "정확한 값"이 아니라 **가정**이고,
 * 슬라이더로 137시간 같은 값을 만들게 하면 정밀해 보이는 착각을 준다. 근거 시트가
 * 식을 그대로 보여주는 화면이라 가정도 눈금으로 두는 편이 정직하다.
 */
export const FRESHNESS_RECOVERY_HOURS_OPTIONS = [96, 120, 144, 168, 192] as const;

export type FreshnessRecoveryHours = (typeof FRESHNESS_RECOVERY_HOURS_OPTIONS)[number];
