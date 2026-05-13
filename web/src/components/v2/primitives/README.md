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
| `V2Sheet` | — | 바텀시트. ESC dismiss 내장. |
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

- ❌ `<div style={{ background: "var(--color-surface-container)", borderRadius: 16, padding: 20 }}>` — `V2Card` 사용.
- ❌ `<span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>` — `.v2-eyebrow` 또는 `.v2-label`.
- ❌ `<a style={{ background: "var(--color-primary)", color: "white", padding: "12px 20px", borderRadius: 12 }}>` — `V2PrimaryBtn as="a" href={...}`.
- ❌ `border: "1px solid var(--color-outline-variant)"` — `<V2Hairline />` 또는 paper 톤 전환.
- ❌ `<button>+ 추가</button>` — `<V2PrimaryBtn icon="add">추가</V2PrimaryBtn>`.
- ❌ custom SVG UI 아이콘 — Material Symbols Outlined.
- ❌ hex 색상 하드코딩 (`#5b4cdb` 등) — `var(--v2-accent)`.
- ❌ 4-pt 그리드 위반 (`padding: 14px`, `gap: 7px` 등) — `var(--v2-s-N)`.

---

## 마이그레이션 트래커

화면별 진행 상태: [`web/docs/v2-migration-status.md`](../../../../docs/v2-migration-status.md).
