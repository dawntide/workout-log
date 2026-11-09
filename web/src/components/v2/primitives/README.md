# V2 Primitives

IronGraph V2 ("Quiet Premium") 디자인 시스템의 React 빌딩 블록. 화면은 **반드시** 이 primitive로 조립한다 — 인라인 layout/style은 동적 값(차트 등)에만 허용.

- **토큰**: `web/src/styles/v2-tokens.css` (변경 금지)
- **상태 CSS**: `web/src/styles/components/v2-primitives.css` (hover/active/focus-visible/disabled)
- **카탈로그**: http://localhost:3000/design-system (시각 확인용 — 메인 nav에는 노출되지 않음)

## 사용 규칙

1. **import 한 경로만**: `@/components/v2/primitives`
2. **새 코드는 인라인 typography 금지** — `.v2-h1 / .v2-h2 / .v2-h3 / .v2-body / .v2-small / .v2-label / .v2-eyebrow / .v2-num-{xl,lg,md,sm} / .v2-mono-label` 클래스 사용.
3. **spacing은 4-pt 그리드만** — `var(--v2-s-1..9)` (4 / 8 / 12 / 16 / 20 / 24 / 32 / 44 / 64).
4. **색상은 `--v2-*` 토큰**. 레거시 `--color-*`는 `v2-overrides.css`에서 alias되지만 새 코드에 직접 쓰지 말 것.
5. **아이콘은 Material Symbols Outlined만**. `<span className="material-symbols-outlined">icon_name</span>`.
6. **No-Line 규칙**: 섹션 구분은 `V2Hairline` 또는 paper 톤 전환. `border: 1px solid ...` 금지.
7. **터치 영역 ≥ 44×44px** — interactive primitive는 모두 충족.
8. **표면을 그리는 primitive는 `tone`(전경·의미)과 `surface`(배경 사다리)를 나눈다.** 표면색을 안에서 잠그면 다른 카드 안에 넣을 수 없다 — paper 카드 안의 paper 타일은 ΔE=0이고 No-Line이라 통째로 안 보인다(`V2MetricCard`가 그래서 `surface` prop을 갖는다). 카드 안에 처음 넣을 때는 배경이 실제로 다른지 확인하고, 보통 한 칸 내린다(paper → inset). `BottomSheet` 패널이 `--v2-paper`라 시트 안 카드도 기본 톤 대신 `inset`을 쓴다.
9. **`V2Switch`는 반드시 `<label>` 안에 둔다.** 실제 checkbox는 투명하게 깔리고 그 위에 트랙이 그려져 탭은 트랙이 받는다. `<label>`이 감싸야 탭이 input에 전달된다. `<div>` 안에 두면 렌더는 되는데 눌러도 토글되지 않는다.

---

## Primitive 목록

| Component | Tone / 변형 | When to use |
|---|---|---|
| `V2Card` | paper · inset · strong · accent · danger · success | 거의 모든 카드 표면. 직접 `<div style={{ background, padding, radius }}>` 금지. |
| `V2Chip` | neutral · accent · weight · reps · volume · onerm · pr · success · warning · danger · info | 짧은 라벨/배지 (pill). 메트릭 의미 색은 표준화. |
| `V2Hairline` | — | 섹션 디바이더. 1px solid 대체. |
| `V2IconBtn` | neutral · accent · ghost | 아이콘만 있는 버튼. `as="button" \| "a"`. |
| `V2PrimaryBtn` | (단일) | 주요 CTA. `as="button" \| "a"`, `full`, `icon`, `disabled`. |
| `V2SecondaryBtn` | neutral · danger | 보조 액션. `as="button" \| "a"`, `tone`, `full`, `icon`. |
| `V2Anchor` | accent · ink · danger | 텍스트 링크. |
| `V2ActionDock` | — | 하단 네비게이션 dock. items 배열로 구성. |
| `V2CountUp` | — | 숫자 카운트업 애니메이션. |
| `V2FieldRow` | — | 키패드 패널 내부 weight/reps/note 행. |
| `V2SectionHeader` | level=h1\|h2\|h3 | 페이지/섹션 헤더 (eyebrow + 제목 + 우측 액션). |
| `V2MetricCard` | tone=neutral\|weight\|reps\|volume\|onerm\|pr\|success | 라벨 + 큰 숫자 + (단위/sub/trend). |
| `V2EmptyState` | paper · inset | 아이콘 + 제목 + 설명 + 액션. |
| `V2NavRow` | — | settings list 행 (`as="button" \| "a" \| "div"`). |
| `V2Stack` / `V2Inline` | — | 4-pt gap 강제 flex. `gap` prop은 1~9 또는 토큰 문자열. |
| `V2DotsLoader` | — | 로딩 dots. |

---

## API 빠른 참조

### V2Card
```tsx
<V2Card tone="paper" padding="var(--v2-s-5)" radius="var(--v2-r-3)" onClick={...}>
  {children}
</V2Card>
```
- 기본값: `tone="paper"`, `padding="var(--v2-s-5)"`, `radius="var(--v2-r-3)"`.
- `onClick`이 있으면 `cursor: pointer` 자동 적용.

### V2Chip
```tsx
<V2Chip tone="pr" icon="workspace_premium" solid={false}>PR</V2Chip>
```
- `solid=true`이면 색을 배경으로 inversion.

### V2PrimaryBtn / V2SecondaryBtn / V2IconBtn
```tsx
<V2PrimaryBtn icon="play_arrow" full onClick={start}>세션 시작</V2PrimaryBtn>
<V2PrimaryBtn as="a" href="/workout/log" icon="add">새 세션</V2PrimaryBtn>
<V2SecondaryBtn icon="delete" tone="danger" onClick={remove}>삭제</V2SecondaryBtn>
<V2IconBtn icon="close" label="닫기" onClick={onClose} />
<V2IconBtn as="a" href="/back" icon="arrow_back" label="뒤로" />
```

### V2SectionHeader
```tsx
<V2SectionHeader eyebrow="TODAY'S SESSION" title="가슴 + 삼두" level="h2"
  action={<V2IconBtn icon="more_horiz" label="옵션" />} />
```

### V2MetricCard
```tsx
<V2MetricCard label="WEEKLY VOLUME" value="12,480" unit="kg"
  tone="volume" trend={{ direction: "up", text: "+8% vs last" }} />
```

### V2EmptyState
```tsx
<V2EmptyState
  icon="calendar_month"
  title="아직 기록된 세션이 없습니다"
  description="플랜을 시작하거나 즉시 기록할 수 있어요"
  action={<V2PrimaryBtn icon="add" as="a" href="/workout/log">세션 시작</V2PrimaryBtn>}
/>
```

### V2NavRow
```tsx
<V2NavRow as="a" href="/settings/account" icon="person" label="계정"
  value="me@example.com" />
```

### V2Stack / V2Inline
```tsx
<V2Stack gap={4}>{/* 16px column */}</V2Stack>
<V2Inline gap={2} align="center" justify="space-between">{/* 8px row */}</V2Inline>
```

---

## 안티패턴 (하지 말 것)

전체 Hard Rules는 [`web/docs/design-guide.md` §0.5](../../../../docs/design-guide.md#05-hard-rules--디자인-통일-5계명) 참조.

- ❌ [**Rule 1**] `<div style={{ background: "var(--color-surface-container)", borderRadius: 16, padding: 20 }}>` — `V2Card` 사용.
- ❌ [**Rule 1**] `<a style={{ background: "var(--color-primary)", color: "white", padding: "12px 20px", borderRadius: 12 }}>` — `V2PrimaryBtn as="a" href={...}`.
- ❌ [**Rule 1**] `<button>+ 추가</button>` — `<V2PrimaryBtn icon="add">추가</V2PrimaryBtn>`.
- ❌ [**Rule 2**] `border: "1px solid var(--color-outline-variant)"` — `<V2Hairline />` 또는 paper 톤 전환.
- ❌ [**Rule 2**] `borderTop/Bottom/Left/Right: "1px ..."` — `<V2Hairline />` 또는 paper 톤 전환. 선택 상태는 `boxShadow` inset.
- ❌ [**Rule 3**] hex 색상 하드코딩 (`#5b4cdb` 등) — `var(--v2-accent)`.
- ❌ [**Rule 3**] 4-pt 그리드 위반 (`padding: 14px`, `gap: 7px`, `borderRadius: 16` 등) — `var(--v2-s-N)` / `var(--v2-r-N)`.
- ❌ [**Rule 4**] `<span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>` — `.v2-eyebrow` 또는 `.v2-label`.
- ❌ [**Rule 4**] `<h1 className="v2-display" style={{ fontSize: 44 }}>` — 클래스만 사용, inline override 금지.
- ❌ custom SVG UI 아이콘 — Material Symbols Outlined (`<span className="material-symbols-outlined">`).

---

## 마이그레이션 트래커

화면별 진행 상태: [`web/docs/v2-migration-status.md`](../../../../docs/v2-migration-status.md).
