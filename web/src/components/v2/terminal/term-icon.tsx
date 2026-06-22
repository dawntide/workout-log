"use client";

import type { CSSProperties } from "react";

/**
 * Material Symbols(ligature) → 터미널 글리프 매핑.
 *
 * 두 글리프 소스(둘 다 var(--term-mono) 체인으로 자동 라우팅):
 * - **Nerd Font / Font Awesome** (NF_CODEPOINT): PUA 코드포인트(0xFxxx). 실물 아이콘
 *   (자물쇠·달력·사람 등). self-host "Symbols Nerd Font Mono" woff2 + @font-face
 *   (terminal-mono.css)가 unicode-range로 PUA만 담당. JetBrains Mono엔 PUA 글리프가
 *   없어 자연히 넘어온다. 소스 안전을 위해 PUA 문자 대신 숫자로 보관 → fromCodePoint.
 * - **Unicode geometric/화살표** (UNICODE_GLYPH): JetBrains Mono가 커버하는 추상 기호.
 *
 * 매핑이 없으면 GLYPH_FALLBACK("·") — tofu(□) 노출 방지.
 * nf 코드포인트 출처: Nerd Fonts glyphnames(Font Awesome set).
 */
const NF_CODEPOINT: Record<string, number> = {
  search: 0xf002, // fa-search
  edit: 0xf040, // fa-pencil
  edit_note: 0xf040,
  logout: 0xf011, // fa-power-off
  swap_horiz: 0xf0ec, // fa-exchange
  lock: 0xf023, // fa-lock
  lock_reset: 0xf023,
  person: 0xf007, // fa-user
  manage_accounts: 0xf007,
  account_circle: 0xf007,
  calendar_month: 0xf073, // fa-calendar
  calendar_today: 0xf073,
  today: 0xf073,
  event_note: 0xf073,
  event_repeat: 0xf073,
  date_range: 0xf073,
  bolt: 0xf0e7, // fa-bolt
  shield: 0xf132, // fa-shield
  bug_report: 0xf188, // fa-bug
  language: 0xf1ab, // fa-language
  public: 0xf0ac, // fa-globe
  hourglass_empty: 0xf254, // fa-hourglass
  hourglass_top: 0xf254,
  palette: 0xf1fc, // fa-paint-brush

  // ── Nerd Font / Material Design Icons (FA에 없는 실물 아이콘, PUA Plane 15) ──
  fitness_center: 0xf01e6, // md-dumbbell
  straighten: 0xf046d, // md-ruler
  monitor_weight: 0xf0473, // md-scale-bathroom
  speed: 0xf04c5, // md-speedometer
  storefront: 0xf07c7, // md-storefront
  track_changes: 0xf04fe, // md-target
  show_chart: 0xf012a, // md-chart-line
  monitoring: 0xf012a,
  leaderboard: 0xf0128, // md-chart-bar
  equalizer: 0xf0128,
  bar_chart: 0xf0128,

  // ── 페이퍼 잔재 정리: 시트·공유·인증 raw Material 교체용 (FA) ──
  visibility: 0xf06e, // fa-eye
  visibility_off: 0xf070, // fa-eye-slash
  settings: 0xf013, // fa-cog
  new_releases: 0xf0f3, // fa-bell
  notifications: 0xf0f3,
  arrow_downward: 0xf063, // fa-arrow-down
};

const UNICODE_GLYPH: Record<string, string> = {
  // 액션
  close: "✕",
  cancel: "✕",
  clear: "✕",
  delete: "✕",
  delete_outline: "✕",
  search_off: "✕",
  playlist_remove: "✕",
  check: "✓",
  done: "✓",
  check_circle: "✓",
  task_alt: "✓",
  check_box: "✓",
  check_box_outline_blank: "·",
  add: "+",
  add_circle: "+",
  remove: "−",
  do_not_disturb_on: "−",
  refresh: "↻",
  restart_alt: "↻",
  sync: "↻",
  cloud_sync: "↻",
  cloud_done: "✓",
  cloud_upload: "↑",
  play_arrow: "▶",
  tune: "≡",
  settings: "≡",

  // 방향/네비
  arrow_back: "‹",
  chevron_left: "‹",
  navigate_before: "‹",
  arrow_forward: "›",
  chevron_right: "›",
  navigate_next: "›",
  expand_more: "▾",
  keyboard_arrow_down: "▾",
  arrow_drop_down: "▾",
  unfold_more: "▾",
  expand_less: "▴",
  keyboard_arrow_up: "▴",
  arrow_drop_up: "▴",
  more_horiz: "…",
  more_vert: "⋮",

  // 의미/지표
  mail: "@",
  workspace_premium: "★",
  star: "★",
  trending_up: "↗",
  trending_down: "↘",
  trending_flat: "→",
  open_in_new: "↗",
  launch: "↗",
  contrast: "◐",
  all_inclusive: "∞",
  warning: "!",
  error: "!",
  report: "!",
  info: "i",
  terminal: "▸",
};

export const GLYPH_FALLBACK = "·";

export function materialToTermGlyph(name: string): string {
  const cp = NF_CODEPOINT[name];
  if (cp !== undefined) return String.fromCodePoint(cp);
  return UNICODE_GLYPH[name] ?? GLYPH_FALLBACK;
}

/**
 * 터미널 글리프 아이콘. Material span과 동일 자리에서 쓰되, 호출처가
 * skin === "terminal"일 때만 렌더한다(분기는 호출처 책임).
 * 색/크기는 style prop으로 — Material span의 스타일을 그대로 넘기면 정합.
 */
export function TermIcon({
  name,
  style,
  className,
}: {
  name: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        fontFamily: "var(--term-mono)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
        ...style,
      }}
    >
      {materialToTermGlyph(name)}
    </span>
  );
}
