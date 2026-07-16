# IronGraph 2026 — 디자인 가이드 (통합본)

> **소스 통합**: Stitch 프로젝트 `13928559291120738968` (The Precision Ledger) · `stitch-design-guide.md` · `ui-system-audit.md`
> **최종 업데이트**: 2026-07-16

---

## 0. 디자인 철학 — "The Precision Ledger"

**Precision · Clarity · Speed**

전통적인 피트니스 앱의 게임화(gamified) 미학에서 벗어나, 고급 생산성 소프트웨어에서 영감을 받은 전문적이고 도구(tool)같은 경험을 목표로 합니다. 고급 물리적 로그북—고급 종이와 기술 제도 펜—을 디지털로 구현한 느낌입니다.

| 원칙 | 설명 |
|------|------|
| **Layered Elevation** | 무거운 그림자 대신 배경 색상 전환으로 계층 정의 |
| **Typography-First** | 운동 데이터(중량/횟수)의 가독성을 극대화한 타입 스케일 |
| **High-Density Utility** | 운동 중 화면은 최소 스크롤과 원-탭 액션 최적화 |
| **Tactile Feedback** | 모든 인터랙티브 요소에 최소 44×44px 터치 영역 |
| **System-Native Feel** | 장식보다 예측 가능한 인터랙션 패턴 |
| **Progressive Disclosure** | 고급 컨트롤은 단계적으로 노출 |

### 사용 환경

- **모바일 웹 퍼스트**: 한 손 조작, 엄지 영역 인식 컨트롤
- **PWA**: 오프라인 연속성, 설치 가능
- **정보 계층**: 오늘 세션 액션 → 플랜/통계 → 템플릿/설정/진단

### 테마 경계

웹 테마는 컴포넌트 트리와 레이아웃을 공유하고 색상 토큰만 교체한다. 테마별 셸·화면·컴포넌트 포크는 만들지 않는다. 터미널 UX는 독립 `apps/tui` 클라이언트가 담당한다.

설정은 `화면 모드(SYSTEM | LIGHT | DARK)`와 `라이트 컬러스키마`, `다크 컬러스키마`를 각각 저장한다. `SYSTEM`은 OS 모드가 바뀔 때 사용자가 고른 두 컬러스키마 사이를 자동 전환한다.

---

## 0.5. Hard Rules — 디자인 통일 5계명

화면 간 시각 어휘 통일을 강제하는 5개 규칙. 모든 새 코드는 이 규칙을 준수하고, 기존 코드는 점진적으로 마이그레이션한다. 위반은 `web/scripts/design-lint.mjs`와 ESLint `no-restricted-syntax`로 자동 차단된다.

### Rule 1 — Primitive-First Assembly

카드 · 버튼 · 네비행은 [`components/v2/primitives/*`](../src/components/v2/primitives/) 의 V2 primitive 조합으로만 조립한다. 페이지/feature 컴포넌트에서 inline `<div style={...}>` 또는 `<button style={...}>` 로 같은 역할을 재구현하지 않는다.

```tsx
// ✅ OK
<V2Card tone="paper" padding="var(--v2-s-5)">
  <V2PrimaryBtn full onClick={start}>운동 시작</V2PrimaryBtn>
</V2Card>

// ❌ NG
<div style={{ background: "var(--v2-paper)", borderRadius: 16, padding: 20 }}>
  <button style={{ background: "var(--v2-accent)", color: "white", padding: "12px 20px" }}>
    운동 시작
  </button>
</div>
```

**예외**: 차트 · 캘린더 셀 · 키패드 등 그리드/좌표 기반 동적 UI는 inline 조립 허용. 단 모든 값은 토큰만 (Rule 3 준수).

### Rule 2 — No-Line Rule

`border: "1px solid …"` 일절 금지. divider는 `<V2Hairline />`, 계층은 paper 톤 전환(`--v2-paper` → `--v2-paper-2` → `--v2-paper-3`), 선택/포커스 표시는 `boxShadow` inset로 표현한다.

```tsx
// ✅ OK — 계층은 톤 전환
<V2Card tone="paper">
  <div style={{ background: "var(--v2-paper-2)", padding: "var(--v2-s-3)" }}>
    중첩 영역
  </div>
</V2Card>

// ✅ OK — 선택 상태는 inset shadow
<button style={{
  background: "var(--v2-paper-2)",
  boxShadow: selected ? "inset 0 0 0 2px var(--v2-accent)" : "none",
}}>옵션</button>

// ✅ OK — divider
<V2Hairline />

// ❌ NG
<div style={{ border: "1px solid var(--v2-hairline)" }} />
<div style={{ borderTop: "1px dashed var(--v2-hairline)" }} />
```

**예외**: 차트 축선 (semantic 의미 있음).

### Rule 3 — Token-Only Values

`padding · margin · gap · borderRadius · fontSize · minHeight · minWidth` 등 시각 값은 `var(--v2-*)` 토큰만 사용. 하드코딩 숫자 금지.

| 카테고리 | 토큰 |
|---|---|
| spacing | `--v2-s-1` (4) ~ `--v2-s-9` (64) |
| radius | `--v2-r-1` (8) ~ `--v2-r-4` (20), `--v2-r-pill` |
| typography | `--v2-t-display`, `--v2-t-h1` ~ `--v2-t-h3`, `--v2-t-body`, `--v2-t-small`, `--v2-t-label`, `--v2-t-eyebrow` |

```tsx
// ✅ OK
<div style={{ padding: "var(--v2-s-4)", borderRadius: "var(--v2-r-3)" }}>

// ❌ NG
<div style={{ padding: 16, borderRadius: 12 }}>
<div style={{ padding: "14px 22px", borderRadius: 14 }}>
```

**예외**: `0` · `1` · `2` 같은 zero-or-hair 값, `flex: 1`, `width: "100%"`, `width: "auto"`.

### Rule 4 — Typography via Class, Override 금지

타이포는 type 클래스만 사용한다. inline `fontSize` · `fontWeight` · `fontFamily` override 금지. 새 변형이 필요하면 토큰/클래스를 추가하고 override 하지 않는다.

```tsx
// ✅ OK
<h1 className="v2-display">제목</h1>
<h2 className="v2-h2">섹션</h2>
<p className="v2-body">본문</p>
<span className="v2-mono-label">RPE 8.5</span>

// ❌ NG
<h1 className="v2-display" style={{ fontSize: 44 }}>제목</h1>
<span style={{ fontSize: 15, fontWeight: 500 }}>본문</span>
<span style={{ fontFamily: "var(--v2-f-display)" }}>숫자</span>
```

### Rule 5 — Single Source per Component Role

같은 역할의 컴포넌트가 둘 이상 공존하지 않는다. 중복이 발견되면 `deprecated 표시 → shim wrapper → 삭제` 3단계로 정리한다.

| 정식 | 정리 대상 |
|---|---|
| `V2PrimaryBtn` / `V2SecondaryBtn` | `.btn.btn-primary` · `.hd-cta-btn` 등 CSS 클래스 버튼 |
| `V2NavRow` | `NavigationRow` · `ToggleRow` · `ValueRow` (`ui/settings-list.tsx`) |
| `V2TextField` (예정) | `Field` (`v2-auth-form.tsx`) · onboarding inline input · `AppTextInput` |
| `V2Chip` | `.label-tag-*` CSS 클래스 |

---

### 1-1. 컬러스키마 목록

| 라이트 | 다크 |
|---|---|
| Paper (기본) | Obsidian (기본) |
| GitHub Light | GitHub Dark |
| Solarized Light | Solarized Dark |
| Catppuccin Latte | Catppuccin Mocha |
| Tokyo Night Day | Tokyo Night |

원본 개발 테마의 대표 팔레트를 앱의 semantic token에 매핑하되, 본문과 상태 텍스트는 WCAG AA 대비를 만족하도록 보정한다. 따라서 에디터 팔레트 값을 모든 역할에 그대로 복사하지 않는다.

### 1-2. 구현 규칙

- 소스: [`styles/color-themes.css`](../src/styles/color-themes.css)
- 선택자: `html[data-color-theme="..."]`
- 변경 허용: `--v2-bg`, `--v2-paper*`, `--v2-ink*`, accent/domain 색상, 색 기반 shadow/focus/overlay
- 변경 금지: DOM 구조, 컴포넌트, spacing, typography, radius, motion
- 초기 렌더 전에 로컬 캐시를 적용하고, 서버 설정 수신 후 canonical 값으로 동기화한다.
- `pnpm -C web test:a11y:contrast`가 10개 스키마의 필수 토큰과 주요 텍스트 대비를 검사한다.

### 1-3. CSS 토큰 매핑 (앱 실제 사용)

```css
/* 배경 계층 */
var(--color-surface-container-lowest)  /* 함몰 영역 */
var(--color-surface-container-low)     /* 카드 기본 ★ */
var(--color-surface-container)         /* 중첩 내부 카드 */
var(--color-surface-container-high)    /* 헤더 행, hover */
var(--color-surface-container-highest) /* 최상위 강조 칩, inactive 탭 */

/* 텍스트 */
var(--color-text)           /* on-surface */
var(--color-text-muted)     /* on-surface-variant */
var(--color-text-subtle)    /* outline */
var(--color-border)         /* outline-variant */

/* 액션 */
var(--color-primary)        /* primary-container (#58a6ff dark) */
var(--color-action)         /* = --color-primary */
var(--color-on-primary)     /* on-primary (버튼 위 텍스트) */
```

### 1-4. 카드 배경 계층 선택 기준

```
surface-container-lowest  → 카드 내부 세트 행 배경, 가장 함몰
surface-container-low     → 카드 기본 배경 ★ (가장 많이 사용)
surface-container         → 중첩 내부 카드
surface-container-high    → 헤더 행, shimmer 하이라이트, hover state
surface-container-highest → 최상위 강조 칩, inactive 탭
```

### 1-5. "No-Line" 규칙

1px solid 테두리로 섹션을 구분하는 것은 **금지**입니다. 경계는 배경 색상 전환으로만 표현합니다.

- `surface` 위의 섹션: `surface-container-low` 사용
- 운동 그룹 구분: `surface-container-lowest`로 함몰 효과

**Ghost Border 대안**: 유사 배경끼리 경계가 필요할 때는 `outline-variant` 15% 투명도만 허용. 100% 불투명 테두리 금지.

### 1-6. Glass & Gradient 규칙

- **Glassmorphism**: 하단 네비게이션, 활성 세션 오버레이 등 "떠 있는" 요소에만 적용.
  - `surface-container` + `backdrop-blur: 12px–20px` 반투명 조합.
- **Gradient CTA**: 주요 액션 버튼은 `primary → primary-container`, 135° 선형 그라디언트.

### 1-7. 시맨틱 색상 (도메인 전용)

```css
var(--text-exercise-name)    /* 종목명 */
var(--text-plan-name)        /* 플랜/프로그램명 */
var(--text-session-name)     /* 세션명 */
var(--text-session-context)  /* 세션 메타(주차, 날짜 등) */
var(--text-metric-weight)    /* 중량(kg) — 파란색 */
var(--text-metric-reps)      /* 횟수 — 청록색 */
var(--text-metric-volume)    /* 볼륨 — 주황색 */
var(--text-meta)             /* 보조 설명 = --color-text-muted */
```

### 1-8. PR / 특수 강조

- **PR 골드**: `color: var(--color-tertiary)` → `#fabc45` (dark) / `#B58900` (light)
- **성공/완료**: `color: var(--color-secondary)` → `#67df70` (dark)
- **오류/삭제**: `color: var(--color-error)` → `#ffb4ab` (dark) / `#DC322F` (light)

---

## 2. 폰트 시스템

### 2-1. 폰트 패밀리

| 역할 | 폰트 | CSS 변수 |
|------|------|----------|
| 헤드라인 / 본문 | **Inter** | `var(--font-headline-family)` |
| 레이블 / 숫자 / 메트릭 | **Space Grotesk** | `var(--font-label-family)` |

> **규칙**: Inter(UI/내러티브)와 Space Grotesk(수치 데이터)를 같은 단어 안에서 혼용 금지.

### 2-2. 폰트 토큰 shorthand

```css
var(--font-page-title)      /* 700 24px/1.2 Inter */
var(--font-section-title)   /* 600 20px/1.3 Inter */
var(--font-card-title)      /* 600 16px/1.4 Inter */
var(--font-body)            /* 400 16px/1.5 Inter */
var(--font-secondary)       /* 400 14px/1.5 Inter */
var(--font-numeric-metric)  /* 700 28px/1 Space Grotesk */
var(--font-label)           /* 500 12px/1 Space Grotesk */
```

### 2-3. 타이포그래피 스케일 (소스 기준)

| 용도 | 폰트 | 크기 | Weight | 기타 |
|------|------|------|--------|------|
| 페이지 H1 | Inter | 28px | 800 | `letter-spacing: -0.5px` |
| 페이지 대제목 | Inter | 36px | 800 | `tracking-tight` |
| 섹션 제목 (h2) | Inter | 13px | 700 | uppercase, `tracking-[0.06em]` |
| 카드 제목 | Inter | 18px | 700 | — |
| Eyebrow | Space Grotesk | 10px | 700 | uppercase, `tracking-[0.12em]` |
| 메트릭 큰 값 | Space Grotesk | 48px / 30px | 700 | `font-label` |
| 메트릭 단위 | Space Grotesk | 12px | — | uppercase, `tracking-widest` |
| 세트 번호 | Space Grotesk | 10px | 300 | `font-light` |
| 표 헤더 | Space Grotesk | 10px | — | uppercase, `tracking-widest` |
| 네비게이션 탭 | Inter | 10px | 500 | uppercase, `tracking-widest` |
| 본문 | Inter | 16px | 400 | — |
| 보조 텍스트 | Inter | 13px | 400 | `color-text-muted` |

### 2-4. 가변 텍스트 줄바꿈 정책

플랜명·세션명·종목명·메모처럼 길이를 통제할 수 없는 텍스트는 **자연 wrap을 허용**한다. 별도 처리 불필요 — [`v2-overrides.css`](../src/styles/v2-overrides.css) 가 다음을 전역 강제한다.

```css
body                          { word-break: keep-all; overflow-wrap: break-word; }
h1, h2, h3, .v2-h1, .v2-h2,
.v2-h3, .v2-display           { word-break: keep-all; text-wrap: balance; }
.t-body, .v2-body, p          { word-break: keep-all; overflow-wrap: break-word; text-wrap: pretty; }
```

→ 한글은 어절 단위 보존, 긴 영문 단어는 단어 경계에서 wrap, 헤드라인은 균형 wrap.

```tsx
// ❌ NG — 좁은 모바일에서 가변 텍스트가 잘려서 잘림 (혹은 ellipsis)
<button className="page-header__title" style={{
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
}}>
  {selectedPlan.name}
</button>

// ✅ OK — inline overflow 처리를 빼면 body 전역 룰이 자동 적용되어 2줄 wrap
<button className="page-header__title" style={{ display: "block", width: "100%" }}>
  {selectedPlan.name}
</button>
```

**예외 — 의도적 truncate가 필요한 경우** (리스트 행 우측에 메트릭/액션이 함께 표시되는 좁은 셀, 예: [`workout-exercise-card.tsx`](../src/widgets/workout-log-screen/workout-exercise-card.tsx) 의 종목명):
- 1줄 ellipsis 허용 (`white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis`)
- 단, 부모는 **반드시 `minWidth: 0` + `flex: 1`** 로 flex 컨테이너에서 shrink 가능해야 한다 (그러지 않으면 ellipsis가 발동하지 않고 옆 요소를 밀어 가로 overflow 발생)

> **inline `wordBreak`/`overflowWrap` 박지 말 것** — 전역 룰이 이미 `break-word` 인데 inline 으로 `anywhere` 를 박으면 영문 단어 중간이 깨져 가이드 정책과 어긋난다.

---

## 3. 간격 & 레이아웃 시스템

### 3-1. 간격 토큰

```css
var(--space-xs):    4px
var(--space-sm):    8px
var(--space-md):    16px   ← 기본 패딩/갭
var(--space-lg):    24px
var(--space-xl):    32px
var(--touch-target): 44px  ← 최소 터치 영역
```

> **4pt 그리드**: 모든 간격은 4의 배수(4, 8, 12, 16, 24, 32)를 사용합니다.
> **주요 섹션 간격**: `--v2-s-5` (20px)가 `.app-page` 직속 섹션 사이의 기본 간격입니다 (아래 3-2 "페이지 세로 리듬 — Single Source" 참고).

### 3-2. 레이아웃 시스템

```css
var(--layout-max)       /* 기본 최대 너비 */
var(--layout-max-wide)  /* 와이드 모드 */
```

- 모바일 퍼스트 safe-area 인식 쉘 + 하단 네비게이션
- 콘텐츠를 `surface-container` 계층 가장자리까지 블리드 허용 → 현대적인 wide-screen 모바일 느낌

#### 화면 좌우 패딩 — Single Source

화면 좌우 padding은 **`.container` (= `var(--v2-s-4)` = 16px) 단일 기준**. `AppShell` 이 모든 페이지를 `.container` 로 감싸므로, 페이지/feature 컴포넌트가 inner wrapper 로 horizontal padding 을 *추가* 하지 않는다. 이중 padding 으로 화면마다 좌우 여백이 32/36/40px 로 갈리는 드리프트의 원인.

```tsx
// ❌ NG — .container 안에서 또 horizontal padding
<div style={{ padding: "var(--v2-s-6) var(--v2-s-6) var(--v2-s-2)" }}>
  <h1 className="v2-h1">제목</h1>
</div>

// ✅ OK — vertical 만 두고 horizontal 은 .container 에 위임
<div style={{ padding: "var(--v2-s-6) 0px var(--v2-s-2)" }}>
  <h1 className="v2-h1">제목</h1>
</div>
```

**예외**:
- Auth/온보딩 화면(`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/onboarding`)은 `position: fixed; inset: 0` 으로 `.container` 를 우회한다. 이 경우에도 내부 horizontal padding 은 `var(--v2-s-4)` 로 동일하게 맞춘다.
- 풀블리드 효과(active set row 등)는 `margin-left/right: calc(-1 * var(--v2-s-4))` 로 명시적으로 `.container` 를 상쇄해서 표현.

#### 페이지 세로 리듬 — Single Source

화면 내 섹션 간 **세로 간격은 `.app-page` 의 `gap` (= `var(--v2-s-5)` = 20px) 단일 기준**. `AppPage` 가 메인 화면을 `.app-page` (flex column) 로 감싸므로, 페이지/섹션 컴포넌트가 루트에 `marginBottom` 으로 간격을 *추가* 하거나, 세로 간격만을 위한 inner wrapper(grid/flex + gap)를 *덧대지* 않는다. 화면마다 섹션 간격이 20 / 32 / 56px 로 갈리던 드리프트의 원인. (좌우 패딩의 `.container` 규칙과 동일한 정신.)

```tsx
// ❌ NG — 섹션 루트가 자체 marginBottom 을 가져 .app-page gap 과 합산(이중 간격)
<section style={{ marginBottom: "var(--v2-s-7)" }}>...</section>

// ❌ NG — AppPage 안에서 세로 간격용 wrapper 를 또 만들어 gap 을 재선언
<AppPage>
  <div style={{ display: "grid", gap: "var(--v2-s-6)" }}>…</div>
</AppPage>

// ✅ OK — 섹션을 .app-page 직속에 두고 간격은 .app-page gap 에 위임
<AppPage>
  <V2SectionHeader … />
  <SectionA />
  <SectionB />
</AppPage>

// ✅ OK — 하단여백용 grid wrapper 를 쓸 땐 minmax(0,1fr) 로 track 폭을 부모에 고정
//          (없으면 자식 min-content 가 부모를 밀어내 좁은 화면에서 가로 overflow)
<div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)",
              gap: "var(--v2-s-5)", paddingBottom: "var(--v2-s-8)" }}>…</div>
```

**예외**:
- 섹션 *내부* 간격(헤딩-콘텐츠, 카드 리스트 등)은 해당 컨테이너의 `gap`/`margin` 으로 제어한다. 이 규칙은 `.app-page` *직속* 섹션 사이 간격에만 적용된다.
- 페이지 헤더(`V2SectionHeader`)는 제목-본문 분리를 위해 자체 `marginBottom: var(--v2-s-4)` (16px) 을 유지한다(헤더 다음 간격만 36px). 그 외 섹션은 추가 margin 없이 위임.
- 하단 여백이 필요하면 마지막 섹션의 margin 대신 단일 wrapper(`paddingBottom: var(--v2-s-8)`)로 감싸도 된다. 단 그 wrapper 의 `gap` 도 `var(--v2-s-5)` 로 맞추고, **`display: grid` 면 `grid-template-columns: minmax(0, 1fr)` 를 반드시 함께 둔다** — 생략하면 grid item 의 `min-width: auto` 때문에 자식 min-content 가 부모 폭을 밀어내 좁은 화면에서 가로 overflow 가 난다 (현재 stats·exercise-detail·pr-history·calendar 화면 패턴).

### 3-3. Border Radius 기준

```
rounded-xl  (12px)  → 일반 카드, 리스트 행
rounded-2xl (16px)  → 주요 컨텐츠 카드, 그라디언트 CTA 버튼
rounded-3xl (24px)  → 헤더 배너, 하단 시트 상단 모서리
rounded-lg  (8px)   → 버튼, 입력 필드, 소형 뱃지
rounded-full        → 칩, pill 버튼, 프로그레스 바, 인텐시티 바
```

> **금지**: `0.5rem` (8px 이하) radius로 카드 사용. 항상 `12px` 이상 사용.

---

## 4. 컴포넌트 시스템

### 4-1. 에디토리얼 페이지 헤더

모든 최상위 페이지(`page.tsx`)는 동일한 에디토리얼 헤더 패턴을 사용합니다.

```tsx
<div style={{
  marginBottom: "var(--space-xl)",
  paddingBottom: "var(--space-md)",
  borderBottom: "1px solid var(--color-border)"
}}>
  {/* Eyebrow — Space Grotesk, 10px, tracking-[0.12em], uppercase, primary */}
  <div style={{
    fontFamily: "var(--font-label-family)",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--color-primary)",
    marginBottom: "4px"
  }}>
    Section Name
  </div>

  {/* H1 — Inter, 28px, 800 weight */}
  <h1 style={{
    fontFamily: "var(--font-headline-family)",
    fontSize: "28px",
    fontWeight: 800,
    letterSpacing: "-0.5px",
    color: "var(--color-text)",
    margin: "0 0 var(--space-sm)"
  }}>
    페이지 제목
  </h1>

  {/* 선택적 설명 */}
  <p style={{
    fontSize: "13px",
    color: "var(--color-text-muted)",
    margin: 0,
    lineHeight: 1.5
  }}>
    페이지 설명 문구
  </p>
</div>
```

### 4-2. 섹션 헤더 (h2)

페이지 내 각 섹션 구분에는 단일 `h2` 태그를 사용합니다.

```tsx
<h2 style={{
  fontFamily: "var(--font-headline-family)",
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  margin: "0 0 var(--space-sm)"
}}>
  섹션명
</h2>
```

#### V2SectionHeader (v2 primitive — 신규 화면은 이쪽 사용)

[`components/v2/primitives/section-header.tsx`](../src/components/v2/primitives/section-header.tsx) — `.page-header__*` / `<h1 style={...}>` 인라인 헤더 패턴을 대체. Hard Rule 1(Primitive-First) 준수.

```tsx
import { V2SectionHeader } from "@/components/v2/primitives";

<V2SectionHeader
  level="h1"                              // h1 | h2(default) | h3
  eyebrow="오늘의 운동 · C1W6D3"
  title={selectedPlan.name}
  description={lockedNote}                // (선택) title 아래 보조 텍스트
  onTitleClick={openPlanSheet}            // (선택) title을 button 으로 래핑 + trailing unfold_more
  titleDisabled={isEditingExistingLog}    // (선택) onTitleClick은 유지하되 잠금 (a11y tree 에서 disabled button)
  titleAriaLabel="플랜 선택 열기"
  titleAriaExpanded={planSheetOpen}
  titleAriaHasPopup="dialog"
  action={<V2IconBtn icon="more_horiz" label="옵션" />}  // (선택) title 우측 별도 영역
/>
```

| prop | 용도 |
|---|---|
| `eyebrow` · `title` · `description` | 상/중/하 텍스트. 가변 텍스트는 §2-4 전역 wrap 정책 위임 (별도 처리 불필요) |
| `onTitleClick` | 있으면 title 을 `<button>` 으로 래핑하고 trailing `unfold_more` 아이콘 자동 노출 (dialog/sheet trigger 패턴) |
| `titleDisabled` | `onTitleClick` 은 유지하되 잠금. 인디케이터 숨김, cursor: default, button disabled 로 a11y tree 보존 |
| `titleAria*` | aria-label / -expanded / -haspopup passthrough |
| `action` | title 우측 별도 인터랙티브 영역 (`V2IconBtn`, `V2Chip` 등). `onTitleClick` 과 독립 |

> **금지**: `fontSize: "9px"` eyebrow div를 섹션 레이블로 사용.
> 카드 내부 stat 레이블(세트/시간/볼륨 등)은 10px `font-label` 유지.

### 4-3. Card 컴포넌트

```tsx
import { Card } from "@/components/ui/card";

<Card padding="md">...</Card>

/* tone 옵션 */
<Card tone="default">   {/* --color-surface-container-low */}
<Card tone="subtle">    {/* 살짝 어두운 내부 카드 */}
<Card tone="inset">     {/* 중첩된 내부 섹션 */}
<Card tone="accent">    {/* 파란 강조 (primary 10%) */}
<Card tone="danger">    {/* 빨간 경고 */}
<Card tone="success">   {/* 초록 완료 */}

/* 인터랙티브 */
<Card as="button" interactive onClick={...}>
```

#### Exercise Card 구조

```
운동명 (Inter Title-LG) ← 좌측
주요 볼륨 메트릭 (Space Grotesk Headline-MD) ← 우측 비대칭 배치
섹션 구분: divider 대신 surface 계층 전환 사용
```

#### Bento Grid (메트릭 타일)

```tsx
<div style={{
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--space-md)"
}}>
  {/* wide tile (col-span-2) */}
  <div style={{
    gridColumn: "span 2",
    background: "var(--color-surface-container-low)",
    borderRadius: 12,
    padding: "var(--space-lg)"
  }}>
    <span style={{
      fontFamily: "var(--font-label-family)",
      fontSize: "10px", fontWeight: 400,
      textTransform: "uppercase", letterSpacing: "0.15em",
      color: "var(--color-text-subtle)"
    }}>Total Volume</span>
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{
        fontFamily: "var(--font-label-family)",
        fontSize: "48px", fontWeight: 700,
        color: "var(--color-primary)"
      }}>12,450</span>
      <span style={{
        fontFamily: "var(--font-label-family)",
        fontSize: "13px",
        color: "var(--color-text-subtle)"
      }}>kg</span>
    </div>
  </div>
</div>
```

### 4-4. 버튼 클래스

```html
<!-- 기본 버튼 -->
<button class="btn btn-primary">   <!-- 파란 주요 액션 -->
<button class="btn btn-secondary"> <!-- 회색 보조 -->
<button class="btn btn-danger">    <!-- 빨간 삭제 -->
<button class="btn btn-ghost">     <!-- 투명 텍스트 -->

<!-- 크기 -->
<button class="btn btn-lg">        <!-- 큰 버튼 -->
<button class="btn btn-full">      <!-- 전체 너비 -->

<!-- 아이콘 전용 (44×44 터치 타겟) -->
<button class="btn btn-icon">
<button class="btn btn-icon btn-icon-danger">

<!-- 인라인 액션 (pill 형태) -->
<button class="btn btn-inline-action">                            <!-- 중립 -->
<button class="btn btn-inline-action btn-inline-action-primary">  <!-- 파란 활성 -->
<button class="btn btn-inline-action btn-inline-action-danger">   <!-- 빨간 -->
```

> **모드 토글, 필터 탭 선택 상태**: `btn-inline-action` + `btn-inline-action-primary` 조합.

#### 그라디언트 CTA (운동 시작 등 주요 액션)

```tsx
<button style={{
  width: "100%",
  padding: "16px",
  background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-container))",
  color: "var(--color-on-primary)",
  fontWeight: 700,
  borderRadius: 16,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  border: "none", cursor: "pointer",
  fontSize: "13px", letterSpacing: "0.05em", textTransform: "uppercase"
}}>
  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
    play_arrow
  </span>
  Start Session
</button>
```

#### 입력 필드 (Weight/Reps)

- 미니멀리스트. 박스 테두리 없음.
- 포커스 시: `primary` 색상 밑줄(2px)만 사용.
- 타이포그래피: `Space Grotesk Display-SM` — 데이터 입력이 의미 있고 촉각적으로 느껴지도록.

### 4-5. 레이블 (Chip)

```html
<!-- 시맨틱 레이블 -->
<span class="label label-complete">완료</span>
<span class="label label-danger">삭제</span>
<span class="label label-warning">경고</span>
<span class="label label-primary">운동종목</span>
<span class="label label-program">프로그램</span>
<span class="label label-neutral">중립</span>

<!-- 태그 분류 (프로그램 태그용) -->
<span class="label label-tag-session label-sm">strength</span>
<span class="label label-tag-progression label-sm">linear</span>
<span class="label label-tag-amrap label-sm">amrap</span>
<span class="label label-tag-top-set label-sm">top-set</span>
<span class="label label-tag-beginner label-sm">beginner</span>
<span class="label label-tag-custom label-sm">custom</span>
<span class="label label-tag-manual label-sm">manual</span>

<!-- 크기 수정자 -->
<span class="label label-sm">소형</span>
```

소스 기준 인라인 태그 스타일:

```tsx
<span style={{
  fontFamily: "var(--font-label-family)",
  fontSize: "10px",
  padding: "2px 8px",
  borderRadius: 4,
  background: "color-mix(in srgb, var(--color-primary) 20%, transparent)",
  color: "var(--color-primary)",
  border: "1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)"
}}>
  Chest
</span>
```

### 4-6. NavRow 패턴 (네비게이션 목록)

설정/탐색 목록의 각 행은 NavRow 패턴을 사용합니다.

```tsx
<button type="button" style={{
  display: "flex", alignItems: "center",
  gap: "var(--space-md)", width: "100%",
  padding: "var(--space-md) 0",
  background: "none", border: "none", cursor: "pointer",
  borderBottom: "1px solid var(--color-border)"
}}>
  {/* 아이콘 */}
  <span className="material-symbols-outlined" style={{
    fontSize: 24, color: "var(--color-primary)",
    fontVariationSettings: "'wght' 400"
  }}>icon_name</span>

  {/* 텍스트 그룹 */}
  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
    {/* Eyebrow (선택) */}
    <div style={{
      fontFamily: "var(--font-label-family)", fontSize: "10px",
      fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      color: "var(--color-primary)", marginBottom: "2px"
    }}>CATEGORY</div>
    {/* 제목 */}
    <div style={{
      fontFamily: "var(--font-headline-family)", fontSize: "16px",
      fontWeight: 700, color: "var(--color-text)"
    }}>메뉴 제목</div>
    {/* 설명 (선택) */}
    <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "2px" }}>
      설명 문구
    </div>
  </div>

  {/* 우측 chevron */}
  <span className="material-symbols-outlined" style={{
    fontSize: 20, color: "var(--color-text-muted)",
    fontVariationSettings: "'wght' 400", flexShrink: 0
  }}>chevron_right</span>
</button>
```

#### SettingRow 변형 (현재 값 표시)

```tsx
{/* 우측 — 현재값 + chevron */}
<div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
  <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>현재값</span>
  <span className="material-symbols-outlined" style={{
    fontSize: 18, color: "var(--color-text-muted)",
    fontVariationSettings: "'wght' 400"
  }}>chevron_right</span>
</div>
```

### 4-7. 리스트 행 (Exercise / Catalog Item)

```tsx
<div style={{
  background: "var(--color-surface-container-low)",
  padding: "var(--space-md)",
  borderRadius: 12,
  display: "flex", alignItems: "center", justifyContent: "space-between",
  cursor: "pointer"
}}>
  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
    {/* 썸네일 or 아이콘 */}
    <div style={{
      width: 64, height: 64, borderRadius: 8,
      background: "var(--color-surface-container-lowest)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <span className="material-symbols-outlined" style={{ color: "var(--color-text-muted)" }}>
        fitness_center
      </span>
    </div>
    <div>
      <div style={{ fontFamily: "var(--font-headline-family)", fontSize: "18px", fontWeight: 700 }}>
        Barbell Bench Press
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <span className="label label-primary label-sm">Chest</span>
        <span className="label label-neutral label-sm">Barbell</span>
      </div>
    </div>
  </div>
  <span className="material-symbols-outlined" style={{ color: "var(--color-text-muted)", fontSize: 20 }}>
    chevron_right
  </span>
</div>
```

### 4-8. BottomSheet

```tsx
import { BottomSheet } from "@/components/ui/bottom-sheet";

<BottomSheet
  open={Boolean(target)}
  title="시트 제목"
  description="부제목 또는 컨텍스트"
  onClose={() => setTarget(null)}
  closeLabel="닫기"
  primaryAction={{
    ariaLabel: "저장",
    onPress: handleSave,
    disabled: saving,
  }}
  footer={
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      <PrimaryButton variant="primary" fullWidth>주요 액션</PrimaryButton>
      <PrimaryButton variant="secondary" fullWidth>보조 액션</PrimaryButton>
    </div>
  }
>
  {/* 콘텐츠 */}
</BottomSheet>
```

소스 기준 시트 구조:

```
rounded-t-[2rem]                          ← 상단 둥근 모서리
border-t border-outline-variant/15
grabber: w-12 h-1 bg-outline-variant/30 rounded-full (pt-4 pb-2)
header: px-8 py-4
content: px-8
```

#### Premium Bottom Sheet 스펙

- **Radius**: `xl` (1.5rem) 상단 모서리만.
- **Background**: `surface-container-low` + 하단 방향 `surface-container-high` 미묘한 그라디언트.
- **Grabber**: `outline-variant` 30% 불투명도, 32px × 4px, `rounded-full`.

### 4-9. 하단 네비게이션 바

```
position: fixed bottom-0, z-50
rounded-t-3xl
border-t border-slate-200/15 dark:border-slate-800/15
bg-slate-50/85 dark:bg-slate-950/85
backdrop-blur-xl

각 탭:
  - 활성: text-blue-500 + drop-shadow-[0_0_8px_rgba(88,166,255,0.3)] + FILL 1
  - 비활성: text-slate-400 dark:text-slate-600
  - 레이블: font-['Inter'] text-[10px] uppercase tracking-widest font-medium mt-1
```

아이콘: `home`, `add_box`, `calendar_today`, `insights`, `settings`

> 활성 탭: primary glow (ambient shadow), 무거운 배경 fill 사용 금지.
> **inline style 금지**: 토큰 기반 클래스만 사용.

### 4-10. 스켈레톤 로딩

```tsx
const skeletonStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, var(--color-surface-container) 0%, var(--color-surface-container-high) 50%, var(--color-surface-container) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease infinite",
  borderRadius: 8,
};

/* @keyframes skeleton-shimmer {
     0%   { background-position: 200% 0; }
     100% { background-position: -200% 0; }
   } */
```

### 4-11. 프로그램 스토어 카드 패턴

```
┌─────────────────────────────────────┐
│ [뱃지]                   [태그 1-2] │
│ 프로그램명 (20px 800)               │
│ 부제목 (13px text-muted)            │
├─────────────────────────────────────┤
│ 설명 (2줄 clamp)                    │
├─────────────────────────────────────┤
│ ╔════════════════════════════════╗  │
│ ║ 기간 · 빈도 · 난이도 메타 행  ║  │
│ ╚════════════════════════════════╝  │
├─────────────────────────────────────┤
│ 강도 바 ████░  [시작하기 버튼]      │
└─────────────────────────────────────┘
```

#### 강도 인디케이터 (5단계 세그먼트 바)

```tsx
const intensityMap = { "초급": 2, "중급": 3, "고급": 4, "일반": 3 };
const intensityFill = intensityMap[levelLabel] ?? 3;

<div style={{ display: "flex", gap: 3 }}>
  {[1,2,3,4,5].map(i => (
    <div key={i} style={{
      height: 6, flex: 1, borderRadius: 9999,
      background: i <= intensityFill ? "var(--color-primary)" : "var(--color-surface-container-highest)",
    }} />
  ))}
</div>
```

#### 카테고리 필터 칩 (가로 스크롤)

```tsx
// 활성 칩: background var(--color-primary-container), color var(--color-on-primary)
// 비활성 칩: background var(--color-surface-container-low), border var(--color-border)
// borderRadius: 9999 (pill), font-label, 11px, 700, uppercase
```

#### 뱃지 시맨틱 색상

| 상태 | 레이블 | 배경 | 텍스트 |
|------|--------|------|--------|
| MARKET 일반 | 공식 | primary 15% mix | `--color-primary` |
| MARKET + beginner | 입문 추천 | tertiary 15% mix | `--color-tertiary` |
| CUSTOM | 커스텀 | secondary 15% mix | `--color-secondary` |

---

## 5. 아이콘 시스템

**Material Symbols Outlined** 만 사용합니다. 커스텀 SVG UI 아이콘 신규 추가 금지.

```tsx
/* 기본 */
<span className="material-symbols-outlined">icon_name</span>

/* 굵기/채움 조절 */
<span
  className="material-symbols-outlined"
  style={{ fontSize: 24, fontVariationSettings: "'FILL' 0, 'wght' 400" }}
>
  icon_name
</span>
```

기본 CSS 초기값:
```css
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```

### fontVariationSettings 가이드

```
'FILL' 0    → 아웃라인 (기본)
'FILL' 1    → 채움 (선택 상태, 완료 체크, 활성 탭)
'wght' 300  → 얇게 (장식용 대형 배경 아이콘)
'wght' 400  → 기본
'wght' 500  → 닫기/삭제 등 중요 액션
'wght' 600  → 확인 체크 등 강조
```

### 주요 아이콘 레퍼런스

| 용도 | 아이콘 |
|------|--------|
| 탐색 chevron | `chevron_right` |
| 탐색 forward | `arrow_forward_ios` |
| 뒤로가기 | `arrow_back` |
| 닫기 | `close` |
| 확인/완료 | `check` |
| 완료 (원형) | `check_circle` |
| 추가 | `add` / `add_circle` |
| 삭제 | `delete` |
| 편집 | `edit` |
| 검색 | `search` |
| 정보 | `info` |
| 설정 | `settings` |
| 달력 | `calendar_today` |
| 이력 | `history` |
| 위/아래 | `expand_less` / `expand_more` |
| 정렬 토글 | `unfold_more` |
| 공유 (iOS) | `ios_share` |
| 운동 시작 | `play_arrow` |
| PR 별 | `star` / `workspace_premium` |
| 불꽃 (스트릭) | `local_fire_department` |
| 통계 | `insights` |
| 다운로드 | `download` |
| 경고 | `warning` |
| 하트 | `favorite` |
| 운동 | `fitness_center` |
| 홈 | `home` |
| 추가 박스 | `add_box` |

> **예외**: 차트/그래프 등 데이터 시각화용 SVG는 커스텀 허용.

---

## 6. 모션 시스템

### 6-1. 토큰

```css
var(--duration-fast)      /* 빠른 전환 */
var(--duration-normal)    /* 일반 전환 */
var(--duration-slow)      /* 느린 전환 */
var(--ease-standard)      /* 일반 이징 */
var(--ease-emphasized)    /* 강조 이징 */
```

### 6-2. 규칙

- 페이지/카드/리스트 전환은 공유 keyframe과 토큰으로 표준화
- `prefers-reduced-motion` 전역 지원 필수
- Bottom sheet: `.mobile-bottom-sheet*` + 토큰 기반 스프링 모션
- 역사적 클래스의 혼합 타이밍 사용 금지 — 토큰만 사용

---

## 7. 접근성 기준

- **최소 터치 타겟**: 44×44px (`var(--touch-target)`)
- **포커스 링**: `focus-visible` 통합 링 스타일
- **색상 대비**: 시맨틱 text/background 토큰으로 대비 유지
- **감소 모션**: 전역 `prefers-reduced-motion` 지원
- **스크린 리더**: 모든 인터랙티브 요소 `aria-label` 필수

---

## 8. 운동 데이터 정보 계층

운동 중 화면에서 즉각적인 스캔을 위한 시각 처리:

| 요소 | 처리 |
|------|------|
| 종목명 | semi-bold, primary text, 18px+ |
| 세트 번호 | Space Grotesk, secondary text, 원형 뱃지 |
| 주요 메트릭 (횟수/중량) | bold, large, 고대비 |
| RPE | 기울임 secondary 또는 색상 뱃지 (RPE 9+: amber) |
| 완료 상태 | 전체 행 배경 변경 + 체크 아이콘 |
| 휴식/타이머 | Space Grotesk, dimmed primary, 프로그레스 링 |
| PR/1RM | 골드 아이콘 + semi-bold weight |

---

## 9. 금지 패턴

| 금지 | 대체 |
|------|------|
| `var(--color-surface)` 컴포넌트 배경 직접 사용 | `var(--color-surface-container-low)` |
| `var(--color-cta)` 신규 액션 버튼 | `var(--color-action)` |
| 커스텀 SVG UI 아이콘 신규 추가 | Material Symbols Outlined |
| `DashboardScreen`, `DashboardActionSection` 컴포넌트 | NavRow 패턴 또는 Card |
| `fontSize: "9px"` div를 섹션 헤더로 사용 | `<h2>` Stitch 섹션 헤더 패턴 |
| `CardHeader` / `CardTitle` / `CardDescription` 섹션 헤더 | `<h2>` Stitch 패턴 또는 인라인 스타일 |
| `+` 텍스트 추가 버튼 | Material Symbol `add` |
| `--color-surface-2` (존재하지 않는 토큰) | `--color-surface-container-high` |
| `dashboard-surface-btn` (삭제된 CSS 클래스) | `btn` 또는 인라인 스타일 |
| 1px solid 테두리로 섹션 구분 | 배경 색상 전환 (No-Line 규칙) |
| 100% 불투명 테두리 | `outline-variant` 15% 투명도 (Ghost Border) |
| 세트 행 divider | `surface-container-lowest` 배경 전환 |
| 고채도 그림자 | ambient shadow (4–8% opacity, on-surface tint) |
| `0.5rem` 이하 radius 카드 | `12px` 이상 |
| Inter + Space Grotesk 같은 단어 혼용 | UI/수치 폰트 영역 분리 |
| 가변 텍스트(플랜/세션/종목/메모)에 inline `whiteSpace: nowrap` + `textOverflow: ellipsis` 로 1줄 잘림 | body 전역 `keep-all` + `break-word` 룰에 위임 (자연 wrap). 의도적 truncate는 §2-4 예외만 |
| inline `wordBreak: "anywhere"` / `overflowWrap: "anywhere"` 추가 | 전역 `break-word` 정책 유지. 영문 단어 중간 깨짐 방지 |
| 하단 네비게이션 inline style | 토큰 기반 클래스 |
| `--color-surface` (bottom nav 배경) | `surface-container-highest` 85% opacity + backdrop-blur |

---

## 10. UI 시스템 감사 (현재 상태)

### 스크린별 상태

| 라우트 | 구조 | 드리프트 |
|--------|------|----------|
| `/` | 정렬됨 | 타이포 스케일 비공유, 임의 소수 간격 |
| `/workout/today` | 완성도 높음 | 혼합 시맨틱/유틸리티 색상, 뱃지 스타일 불일치 |
| `/plans` | 모바일 흐름 양호 | 버튼/카드 상태 혼합, 시트 모션 토큰 미적용 |
| `/stats` | 기능적이나 시각 분리 | 전환 패턴 혼합, 섹션 리듬 불일치 |
| `/templates` | 기능 강함, 밀도 높음 | 다양한 로컬 버튼/카드 변형, 상호작용 일관성 부족 |
| `/calendar` | 의도 부합 | 셀 액션 44px 미만, 접근성 문제 |
| `/settings` | 정렬됨 | `ui-card`만 사용, 인터랙션 피드백 혼합 |
| `/offline`, `/workout/session/[logId]` | 기능적 | 통합 쉘 컨벤션 미사용, 타입/간격 불일치 |

### 통합 컴포넌트 맵

| 카테고리 | 컴포넌트 |
|----------|----------|
| Shell | `AppShell`, `BottomNav`, `SyncStatusTray`, `PwaRegister` |
| Surface | `Card` (`motion-card` / `ui-card`) |
| Action | `PrimaryButton`, `.workout-action-pill`, nav tabs |
| Input | shared field styles for `input/select/textarea` |
| Overlay | `.mobile-bottom-sheet`, PWA banners |
| Feedback | `.ui-badge-*`, sync tray states, error/success text |

### 드리프트 매트릭스

**구조적 드리프트**
- 다중 컨테이너 패턴(`mx-auto...`, `tab-screen`, `settings-screen`) 미통합
- 일부 유틸리티 페이지가 쉘 레이아웃 언어 우회

**시각적 드리프트**
- 시맨틱 토큰명 미정규화
- 혼합 뱃지 색상, 임의 유틸리티 팔레트
- 중첩 섹션 카드 깊이 레이어링 불일치

**인터랙션 드리프트**
- 캘린더 셀 액션 터치 타겟 44px 미만
- 햅틱 피드백 부분 적용
- 스크린별 버튼 상태 패턴 상이

**시스템 드리프트**
- 하단 네비게이션 inline style 사용
- 역사적 클래스에 혼합 모션 타이밍
- 중앙화 상수 대신 테마 값 중복

---

## 11. 화면 체크리스트 (43개)

1. Home (/)
2. Workout Log main
3. Today's workout
4. Calendar main
5. Stats main
6. Settings main
7. Workout overrides
8. Session detail
9. Legacy session detail
10. Add exercise modal
11. Exercise catalog modal
12. SearchSelectSheet (Workout)
13. NumberPickerSheet
14. FailureProtocolSheet
15. Calendar options
16. Calendar picker variant
17. Calendar select variant
18. MonthYearPickerSheet
19. Plan selection SearchSelectSheet
20. 1RM / stats filter sheet
21. Theme settings sheet
22. Minimum plate settings sheet
23. Bodyweight settings sheet
24. Exercise management sheet
25. Data export sheet
26. Data management sheet
27. About sheet
28. Save policy sheet
29. UX thresholds sheet
30. System stats sheet
31. Selection template sheet
32. Deep link settings
33. Plans manage
34. Plans history
35. Plans create guide
36. Plans context
37. Plans context picker
38. Plans context select
39. Program Store main
40. Program action bottom sheet
41. Templates manage
42. Global confirmation dialog
43. Global alert dialog

---

## 12. 파일 구조 참조

```
web/src/
├── styles/
│   ├── tokens.css          ← 모든 색상/폰트/간격 토큰
│   ├── base.css            ← 기본 타이포그래피
│   └── components/
│       ├── button.css      ← .btn-* 클래스
│       ├── card.css        ← .card 클래스
│       ├── dashboard.css   ← .hd-* Stitch 레이아웃
│       └── ...
├── components/
│   └── ui/
│       ├── bottom-sheet.tsx
│       ├── sheet-header.tsx
│       ├── form-controls.tsx   ← AppTextInput, AppSelect, AppPlusMinusIcon
│       ├── search-input.tsx
│       ├── card.tsx
│       └── primary-button.tsx
└── app/
    └── [page]/page.tsx         ← 에디토리얼 헤더 + 섹션 h2 패턴 적용

web/docs/
├── design-guide.md             ← 이 파일 (통합 디자인 가이드)
├── ui-system-audit.md          ← 감사 원본
└── stitch-design-guide.md      ← Stitch 구현 가이드 원본

stitch/
├── darkCode.txt                ← 다크 테마 14개 화면 HTML 목업 (소스)
├── lightCode.txt               ← 라이트 테마 14개 화면 HTML 목업 (소스)
└── product_requirements_document_master.md  ← IronGraph 2026 PRD
```

---

## 13. PR 실행 로드맵

| PR | 내용 |
|----|------|
| PR1 | 시맨틱 토큰 기반 및 테마 소스 객체 |
| PR2 | 공유 클래스 전반 타이포그래피 및 간격 정규화 |
| PR3 | 버튼/카드/입력 상태 통합 |
| PR4 | 네비게이션 및 쉘 일관성 (inline style 제거) |
| PR5 | 스크린 레벨 정리 (`offline/session/error/templates/calendar`) |
| PR6 | 모션 및 제스처 타이밍 표준화 |
| PR7 | 접근성 패스 (타겟 크기, 포커스, 대비 검증) |
| PR8 | 다크/라이트 미세 조정 및 시각적 패리티 패스 |

### 리스크 평가

**낮은 리스크**: 토큰 추가 및 클래스 레벨 스타일 리팩터, 쉘 래퍼 정규화 (로직 변경 없음)

**중간 리스크**: 극단적 콘텐츠 길이에서 dense template/workout 화면의 간격 회귀 가능성, 캘린더 셀 리사이징으로 수직 스크롤 증가 가능

**완화 전략**: 각 화면 프로덕션 빌드 검증, 라우트/API 계약 불변, 인터랙션 변경은 UI 클래스 및 컴포넌트 props에 격리
