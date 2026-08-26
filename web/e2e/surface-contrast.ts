/**
 * 표면 대비 측정 — design-harmonization(화면별)과 color-themes(토큰 사다리)가 공유한다.
 *
 * **왜 이 측정이 필요한가.** No-Line Rule 때문에 계층 구분 수단이 배경색뿐이다(1px
 * 테두리 금지). 인접한 두 표면이 같은 색이 되면 위쪽 표면이 **통째로 사라진다** —
 * 테두리가 없으니 남는 단서가 없다.
 *
 * 실제로 두 번 일어났다:
 * - #653: 새 테마 3개가 원본 팔레트 배경을 `--v2-bg`와 `--v2-paper-2` 양쪽에 매핑해 ΔE=0.
 * - 2026-08-26: `/plans/manage` 히어로의 통계 타일 3개가 paper 카드 안 paper 타일이라 ΔE=0.
 */

/**
 * 인접 표면이 구분되기 위한 최소 ΔE(CIE76).
 *
 * 값의 근거 — 2026-08-26 실측 두 벌:
 * - **화면별**(35화면 × light/dark, 가시 카드 206개): 최저 **2.04**, 중앙값 3.25, 최대 7.94.
 * - **토큰 사다리**(14테마 × 인접쌍 5개 = 70): 최저 **2.04**, 다음이 2.38·2.65·2.80.
 *
 * 두 벌 모두 최저가 2.04이고 그건 같은 쌍이다 — light `paper` 테마의 `--v2-paper` on
 * `--v2-bg`, 즉 **디자인 자신이 쓰는 가장 좁은 단차**다. 실제로 검출된 위반은 전부
 * ΔE = 0.00(완전 동일색)이었고 [0, 2.04) 구간은 비어 있다.
 *
 * 그래서 1.5 — 출고된 최저 단차 아래로 26% 여유를 둬 팔레트 미세 조정에는 안 깨지고,
 * 충돌·준충돌은 잡는다. **팔레트를 바꾸다 이 값에 걸리면 임계값을 낮추기 전에 사다리를
 * 먼저 의심할 것.** 2.04는 이미 지각 한계에 가까워 더 좁힐 여지가 없다.
 */
export const MIN_SURFACE_DELTA_E = 1.5;

/**
 * 사다리에서 **인접한** 쌍. 서로 붙어 그려지므로 구분돼야 한다.
 *
 * `paper-2/bg`가 최다 빈도다(검색창·보조버튼·칩·아이콘버튼·스켈레톤 등 100+ 사용처).
 */
export const SURFACE_LADDER_PAIRS: readonly (readonly [string, string])[] = [
  ["--v2-paper", "--v2-bg"],
  ["--v2-paper-2", "--v2-bg"],
  ["--v2-paper-2", "--v2-paper"],
  ["--v2-paper-3", "--v2-paper-2"],
  ["--v2-accent-weak", "--v2-paper-2"],
];

export const SURFACE_LADDER_TOKENS: readonly string[] = [
  ...new Set(SURFACE_LADDER_PAIRS.flat()),
];

export function parseRgb(color: string) {
  const match = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

/** sRGB → CIE Lab(D65). 지각 거리를 재려면 RGB 유클리드로는 부족하다. */
function srgbToLab(rgb: readonly [number, number, number]) {
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047;
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)] as const;
}

/** 두 CSS 색의 CIE76 ΔE. 파싱 실패면 null(호출자가 실패로 다룬다). */
export function deltaE(left: string, right: string) {
  const l = parseRgb(left);
  const r = parseRgb(right);
  if (!l || !r) return null;
  const a = srgbToLab(l);
  const b = srgbToLab(r);
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
