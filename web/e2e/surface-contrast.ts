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
 *
 * 의미 톤(accent/danger/success)도 같은 값을 쓴다 — 근거는 아래 `SEMANTIC_TONE_BG`.
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

/**
 * 의미 톤(accent/danger/success)이 **paper 위에 놓였을 때** 요구되는 최소 ΔE.
 *
 * 측정 자체는 `MIN_SURFACE_DELTA_E`와 같다(톤을 배경 위에 합성해 배경과 비교). 다른
 * 것은 **문턱**이다. 다른 배경 위에서는 "표면이 보이는가"만 물으면 되지만, paper 위에
 * 놓인 톤은 곧 **"평범한 카드와 구분되는가"**이고, danger가 겨우 보이는 정도면
 * danger로 읽히지 않는다 — 이 톤들이 존재하는 이유가 의미 전달이기 때문이다.
 *
 * 값의 근거(2026-08-26, 14테마 × 3톤 = 42): paper 위 최저 **5.00**(kanagawa-lotus
 * success), 다음이 5.71·5.72·6.50, 최대 31.35. 다른 배경 위 최저는 2.76이었다.
 *
 * 3.0으로 잡는다 — 측정 최저 아래로 40% 여유이고, **디자인의 평범한 표면 단차
 * (2.04)보다는 높다.** 의미를 나르는 틴트가 단순 계층 단차보다 덜 보이면 안 된다는
 * 것이 이 값의 뜻이다.
 */
export const MIN_SEMANTIC_TINT_DELTA_E = 3.0;

/**
 * `V2Card`의 의미 톤 배경식. **프리미티브의 `CARD_BG`와 같은 식이어야 한다** —
 * 여기 값을 따로 적으면 프리미티브가 바뀌어도 이 게이트가 옛 값을 재게 된다.
 */
export const SEMANTIC_TONE_BG: Record<string, string> = {
  accent: "var(--v2-accent-weak)",
  danger: "color-mix(in srgb, var(--v2-c-danger) 10%, var(--v2-paper))",
  success: "color-mix(in srgb, var(--v2-c-success) 10%, var(--v2-paper))",
};

/** r·g·b는 0..255, a는 0..1. */
export type Rgba = readonly [number, number, number, number];

/**
 * CSS 색 문자열 파싱.
 *
 * `rgb()`/`rgba()`뿐 아니라 **`color(srgb …)`**도 받아야 한다 — `color-mix()`가 이
 * 형식으로 계산되고(`danger`·`success` 톤이 그렇다), 옛 정규식은 이걸 못 읽어 조용히
 * null을 냈다.
 */
export function parseColor(color: string): Rgba | null {
  const trimmed = color.trim();

  const legacy = trimmed.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/i,
  );
  if (legacy) {
    return [
      Number(legacy[1]),
      Number(legacy[2]),
      Number(legacy[3]),
      parseAlpha(legacy[4]),
    ];
  }

  // color(srgb 0.94 0.89 0.85 / 0.5) — 채널이 0..1이다.
  const modern = trimmed.match(
    /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.%]+))?\s*\)$/i,
  );
  if (modern) {
    return [
      Number(modern[1]) * 255,
      Number(modern[2]) * 255,
      Number(modern[3]) * 255,
      parseAlpha(modern[4]),
    ];
  }

  return null;
}

function parseAlpha(raw: string | undefined) {
  if (raw === undefined) return 1;
  return raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
}

function isOpaque(color: Rgba) {
  return color[3] >= 0.999;
}

function toCss(color: Rgba) {
  return `rgb(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])})`;
}

/** source-over 합성. */
function compositeOver(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top[3];
  return [
    alpha * top[0] + (1 - alpha) * bottom[0],
    alpha * top[1] + (1 - alpha) * bottom[1],
    alpha * top[2] + (1 - alpha) * bottom[2],
    bottom[3],
  ];
}

/**
 * 위→아래 순서의 색 스택을 합성해 **불투명한 한 색**으로 만든다.
 *
 * **왜 필요한가.** 다크 테마 7개 전부 `--v2-accent-weak`이 알파를 갖는다
 * (0.14~0.17). 그걸 불투명한 색처럼 비교하면 obsidian에서 ΔE 80.04가 나오는데
 * **실제 합성값은 13.49**다 — 6배 과대평가. 더 나쁜 건 알파가 0.01로 줄어
 * 표면이 사실상 사라져도(합성 ΔE 0.88) 원시 비교는 그대로 80.04를 찍는다는 점이다.
 * 즉 알파를 무시하면 이 게이트가 **가장 위험한 회귀를 못 본다.**
 *
 * 스택 끝까지 불투명해지지 않으면 `null`(호출자가 실패로 다룬다) — 뒤에 뭐가
 * 깔렸는지 모르는 채로 비교하느니 못 잰다고 말하는 편이 낫다.
 */
export function flattenStack(colors: readonly string[]): string | null {
  const parsed: Rgba[] = [];
  for (const color of colors) {
    const rgba = parseColor(color);
    if (!rgba) return null;
    parsed.push(rgba);
    if (isOpaque(rgba)) break;
  }
  if (parsed.length === 0) return null;
  const last = parsed[parsed.length - 1];
  if (!isOpaque(last)) return null;

  let result = last;
  for (let index = parsed.length - 2; index >= 0; index -= 1) {
    result = compositeOver(parsed[index], result);
  }
  return toCss(result);
}

/** sRGB → CIE Lab(D65). 지각 거리를 재려면 RGB 유클리드로는 부족하다. */
function srgbToLab(rgb: Rgba) {
  const linear = [rgb[0], rgb[1], rgb[2]].map((value) => {
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

/**
 * 두 색의 CIE76 ΔE.
 *
 * **반투명 색은 받지 않는다** — 파싱은 되지만 `null`을 낸다. 알파가 섞인 색을 실수로
 * 불투명처럼 비교하는 일을 타입이 아니라 계약으로 막는다. 호출자는 `flattenStack`으로
 * 먼저 평탄화할 것.
 */
export function deltaE(left: string, right: string) {
  const l = parseColor(left);
  const r = parseColor(right);
  if (!l || !r) return null;
  if (!isOpaque(l) || !isOpaque(r)) return null;
  const a = srgbToLab(l);
  const b = srgbToLab(r);
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
