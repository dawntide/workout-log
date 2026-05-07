# IronGraph — 구현 변경 이력 (통합본)

> PR2 ~ PR41 병합 정리. 각 PR의 핵심 결정/규칙/구현 내용을 테마별로 통합했습니다.
> 원본 문서: `web/docs/pr*.md`

---

## 목차

1. [IA / 라우팅 구조](#1-ia--라우팅-구조)
2. [디자인 시스템 — 타이포 · 간격 · 표면](#2-디자인-시스템--타이포--간격--표면)
3. [UI 절제 · 시각 감사 · 카피 정리](#3-ui-절제--시각-감사--카피-정리)
4. [모션 · 화면 전환](#4-모션--화면-전환)
5. [컴포넌트 — 상태 · 선택 · 저장 정책 · 행 스타일](#5-컴포넌트--상태--선택--저장-정책--행-스타일)
6. [설정 검색 · 딥링크](#6-설정-검색--딥링크)
7. [접근성 · 품질 게이트 · 릴리즈](#7-접근성--품질-게이트--릴리즈)
8. [운동 기록 플로우](#8-운동-기록-플로우)
9. [UX 이벤트 · 퍼널 분석](#9-ux-이벤트--퍼널-분석)
10. [비동기 UX 연속성](#10-비동기-ux-연속성)
11. [DevOps — 마이그레이션 · 운영 텔레메트리](#11-devops--마이그레이션--운영-텔레메트리)
12. [검증 명령어 모음](#12-검증-명령어-모음)
13. [인프라 — Vercel & Supabase 이전](#13-인프라--vercel--supabase-이전)

---

## 1. IA / 라우팅 구조

### 핵심 원칙 (PR2)

iOS Settings 패턴 기반 3단계 계층 적용:

```
Root(카테고리 인덱스) → Category(설정 Row 리스트) → Detail(단일 책임)
```

1. 루트는 카테고리 인덱스만 제공
2. 카테고리는 설정 Row 리스트만 제공
3. 상세 화면은 단일 책임만 담당
4. 복합 편집/고급 옵션은 Push로 분해
5. Bottom Sheet는 보조 액션만 허용 — 핵심 기능 진입점으로 사용 금지

### Row 타입 표준

| Row 타입 | 구조 | 용도 |
|----------|------|------|
| Navigation Row | `Label + Chevron(>)` | 하위 상세 화면 이동 |
| Value Row | `Label + Value + Chevron(>)` | 현재 상태 확인 후 상세 변경 |
| Toggle Row | `Label + Switch` | 화면 이탈 없이 on/off |
| Action Row | `Label (accent)` | 즉시 실행 |
| Status Row | `Label + Status Badge` | 동기화/오프라인/생성 상태 표시 |

### 목표 라우팅 트리 (PR31 기준 확정)

> **실제 구현 경로 참고**: PR31 설계 당시 `/workout-record`, `/stats-1rm`으로 계획되었으나,
> 실제 구현에서는 각각 `/workout/log` (`src/app/workout/log/page.tsx`),
> `/stats` with `Stats1RMDetailed` 컴포넌트 (`src/app/stats/`)로 통합됨.

```
A. 전역 컴포넌트
├─ Header (Back / Title / Settings)
└─ Floating Tab (Home / Workout Record / Program Store / 1RM Stats)

B. 메인
├─ Home                               /
├─ Workout Record                     /workout/log          ← 설계: /workout-record
│  ├─ + 운동 추가                     (인라인 모달)
│  └─ Exercise CRUD                   (인라인 모달)
├─ Program Store                      /program-store
│  ├─ Program Detail Modal            /program-store/detail?program={id}
│  ├─ Customization Modal             /program-store/customize?program={id}
│  └─ Create/Customize Modal          /program-store/create
└─ 1RM Stats / Graph                  /stats               ← 설계: /stats-1rm (Stats1RMDetailed 컴포넌트로 통합)

C. 설정
├─ Settings root                      /settings
├─ Theme                              /settings/theme
├─ Minimum Plate / Increment          /settings/minimum-plate
├─ Bodyweight                         /settings/bodyweight
├─ Data Export                        /settings/data-export
├─ Offline Help                       /settings/offline-help
└─ App Info / About                   /settings/about
```

### 이전 → 이후 화면 매핑 (PR2, PR5)

| 이전 화면 | 문제 | 이후 |
|-----------|------|------|
| `/workout/today` | 기능 과집중 (생성+기록+오버라이드+비교+JSON) | `/workout/log` (구현) — 설계명 `/workout-record` |
| `/plans` | 생성/선택/미리보기 혼재 | `/program-store` + Create/Context 분리 |
| `/templates` | 라이브러리/편집/버전관리 혼재 | Program Store 내 Detail/Customize/Create 분리 |
| `/stats` | KPI/필터/다중 테이블 동시 노출 | `/stats` with `Stats1RMDetailed` (구현) — 설계명 `/stats-1rm` |
| `/settings/data`, `/offline` | 시스템 기능 분산 | `/settings/data-export`, `/settings/offline-help` |

### 모달 → Push 전환 목록 (PR5)

| 이전 모달 | 위치 | Push 경로 |
|----------|------|-----------|
| Create Plan BottomSheet | `/plans` | `/program-store/create` |
| Stats Filters BottomSheet | `/stats` | `/stats` 내 필터 영역 (인라인, `Stats1RMDetailed` 컴포넌트) |
| Session Overrides BottomSheet | `/workout/today` | 하위 화면으로 분리 |
| Calendar 옵션 (인라인) | `/calendar` | 별도 라우트 |
| Plan 고급 컨텍스트 (인라인) | `/plans` | Customize 라우트 |

### 핵심 플로우 브릿지 (PR17)

- `BottomNav` → 액션 우선 라우트 진입:
  - Today → `/workout/log`
  - Plans → `/program-store`
- Home은 카테고리 인덱스 대신 플로우 우선 빠른 액션 제공
- Plans/Program Store에서 워크아웃 기록으로 직접 딥링크 지원
  - `?create=1&type=SINGLE|COMPOSITE|MANUAL` 쿼리로 생성 시트 바로 오픈

### 구현 가드레일

- Back 버튼: `router.back()` 우선, 히스토리 없으면 `/` fallback
- Settings 버튼: Header 우측 고정, 항상 `/settings` push
- 터치 영역: Header/Tab 주요 타깃 `--touch-target(>=44px)` 준수

---

## 2. 디자인 시스템 — 타이포 · 간격 · 표면

### 타이포그래피 토큰 (PR6)

```css
--type-scale-title-size:        clamp(1.38rem, 1.6vw + 1rem, 1.76rem)
--type-scale-title-line-height: 1.18
--type-scale-body-size:         clamp(0.95rem, 0.42vw + 0.86rem, 1.03rem)
--type-scale-body-line-height:  1.46
--type-scale-footnote-size:     clamp(0.78rem, 0.28vw + 0.72rem, 0.86rem)
--type-scale-footnote-line-height: 1.34
```

유틸리티 클래스: `.type-title`, `.type-body`, `.type-footnote`, `.type-caption`, `.ui-card-label*`

### 간격 토큰 (PR6)

```css
--space-screen-section-gap:   0.88rem  (mobile: 0.72rem)  /* 화면 섹션 간격 */
--space-section-top-offset:   0.16rem                      /* header + section 상단 여백 */
--settings-row-min-height:    2.9em                        /* Row 최소 높이 */
--settings-row-padding-inline: 1rem    (mobile: 0.9rem)   /* Row 좌우 패딩 */
--settings-row-padding-block:  0.72em  (mobile: 0.66em)   /* Row 상하 패딩 */
--settings-row-content-gap:   0.72rem                     /* Row 내부 콘텐츠 간격 */
```

### 표면 토큰 통합 (PR33)

글로벌 레이어에서 정의하는 공유 토큰:

```css
/* 표면 계층 */
--token-card-surface         /* 카드 기본 배경 */
--token-muted-surface        /* 흐린 배경 */
--token-border               /* 구분선 */
--token-sheet-panel          /* 바텀시트 패널 */
--token-sheet-backdrop       /* 바텀시트 뒷 배경 */

/* 상태 배경 */
--token-status-neutral
--token-status-success
--token-status-warning
--token-status-danger
```

**규칙**: `bg-white` 유틸리티 직접 사용 금지 → `Card` 컴포넌트의 공유 표면 토큰 사용

### PR6 이전 → 이후 비교

| Before | After |
|--------|-------|
| 페이지/컴포넌트별 타이포 스케일 혼재 | Title/Body/Footnote 3단계 전역 토큰으로 고정 |
| 섹션 간격/Row 패딩 화면마다 상이 | 토큰 기반 일관화 |
| 단순 `bg/text/accent` 토큰 | iOS semantic color (`label/fill/separator/tint/status`) |
| 고정 px 단위 | Dynamic Type 친화적 `clamp`, `em` 단위 |

---

## 3. UI 절제 · 시각 감사 · 카피 정리

### UI 절제 (PR7)

#### 제거된 요소

**그림자**
- `--shadow-soft`, `--shadow-float`, `--elevation-1`, `--elevation-2` → `none`
- `.ui-card`, `.motion-card`, `.workout-set-card` box-shadow 제거
- `.mobile-bottom-sheet-panel` shadow 제거

**장식성 배경 카드**
- `.home-hero`, `.home-primary`, `.home-tools`, `.settings-menu-card`, `.settings-export-card`, `.workout-action-panel`, `.workout-empty-state` 제거
- body 배경: gradient 제거, `--color-fill-base` 단일 톤

**강조색 과다 사용**
- `.ui-primary-button`, `.workout-action-pill.is-primary`: 강한 tint → 중립 surface 기반
- `.app-bottom-nav-tab.is-active`: 중립 톤 중심으로 조정

**애니메이션**
- `.native-page-enter`, `.ui-card`, `.motion-card`, `.ui-list-item` 진입 애니메이션 해제
- 전역 모션 duration 단축: fast/normal/slow → **110/130/180ms**
- `.ui-primary-button:hover`, `.workout-action-pill:hover`, `.haptic-tap:hover` transform hover 제거

#### 일관성 결과

| 항목 | 상태 |
|------|------|
| Surface 일관성 | 개선 — 카드 표면이 동일 평면 톤으로 수렴 |
| 강조색 절제 | 개선 — 액션 컬러가 중립톤으로 정리 |
| Motion 절제 | 개선 — 진입/hover 모션 과다 제거 |
| 정보 위계 | 유지 — 색/그림자 대신 구조(Section/Row)로 위계 전달 |

### 전 화면 시각 감사 (PR34)

대상 커버리지:
- 코어 페이지 (`/`, plans, calendar, stats, templates, workout, program-store, offline)
- Selection/picker 페이지 (`/plans/context/*`, `/stats/filters/*`, `/calendar/options/*`)
- Settings 모달 페이지 (`/settings/*`)
- Deep-link 라우트

자동 점검 규칙:
- `body/main` 배경이 transparent가 아닐 것
- `.ui-card`와 `.bg-white` 동시 존재 시 배경색이 사실상 동일할 것
- 바텀시트 panel/backdrop이 존재하고 표면색이 유효할 것
- 실행 결과: **light 56 passed / dark 56 passed** (2026-03-04 기준)

커맨드:
```bash
pnpm --dir web run test:design:harmonization:light
pnpm --dir web run test:design:harmonization:dark
```

엄격 모드: `DESIGN_HARMONIZATION_VISUAL_STRICT=1`

### 카피 정리 (PR35)

#### 글로벌 Minimal Copy 모드

- Section description / footnote / row subtitle / row description **기본 비노출**
- BottomSheet / Accordion 보조 설명 기본 비노출
- 상태 메시지는 label 중심 유지 (에러/상태 문구는 label로 승격해 보존)

적용 컴포넌트:
- `settings-list.tsx`, `settings-state.tsx`, `accordion-section.tsx`, `bottom-sheet.tsx`

주요 대형 화면 수동 정리:
- `error.tsx`, `program-store`, `workout/log`, `workout/today/log`, `plans/manage`, `calendar/manage`, `stats/dashboard`, `stats`

### 마이크로카피 규칙 (PR13)

**문장 톤**
- 한 문장에 한 행동만 담기
- 명령형/안내형을 짧게, 주어 생략, 동사 중심
- 상태 문구는 현재형

**길이 규칙**
- Row `label`: 2~12자
- Row `description`: 1문장, 28자 내외
- `SectionFootnote`: 1문장 권장, 최대 2문장
- 화면 상단 caption: 맥락 1문장만, 절차 설명 금지

**금지**
- 장문 절차 나열을 상단 안내로 배치
- 강한 경고 박스/과장 어조 (`반드시`, `치명적`, `즉시 조치`)
- 모호한 표현 (`적절히`, `필요시 알아서`)
- 영문/약어 혼합 기본 문구

**배치 규칙**
- 섹션 설명: `SectionHeader` 아닌 `SectionFootnote`로 섹션 하단에
- 경고/주의: 박스 대신 "섹션 하단 footnote + 재시도 Row" 조합

---

## 4. 모션 · 화면 전환

### 하단 탭 캡슐 모션 (PR36)

- 활성 탭 인디케이터: 언더라인 → iOS 스타일 **capsule track**
- 캡슐 색: 무채색 계열, 기존보다 한 단계 연하게
  - Light: `#ececef`
  - Dark: `#343437`
- CSS 변수로 현재 활성 인덱스/탭 수 관리:
  - `--bottom-nav-active-index`
  - `--bottom-nav-tabs-count`
- 탭 전환 시: `translate` 기반 위치 이동 애니메이션

### 전 화면 전환 (PR36)

```css
@keyframes ui-screen-route-in { ... }
.native-page-enter { /* 적용 */ }
.settings-child-modal-content .native-page-enter { /* 설정 자식 모달용 오버라이드 */ }
```

**접근성**: `prefers-reduced-motion: reduce` 환경에서 캡슐/route-enter 애니메이션 비활성화

---

## 5. 컴포넌트 — 상태 · 선택 · 저장 정책 · 행 스타일

### 상태 UI 표준화 (PR9)

| 컴포넌트 | 동작 |
|----------|------|
| `LoadingStateRows` | 지연 노출 (`delayMs=420` 기본). skeleton-first 금지 |
| `EmptyStateRows` | InfoRow 스타일 그룹형 행. 기본 레이블: `설정 값 없음` |
| `ErrorStateRows` | 빨간 경고 박스 금지. 인라인 경고 info + 재시도 Row |
| `DisabledStateRows` | gray InfoRow, 탭 불가 |
| `NoticeStateRows` | 중립/success/warning 그룹형 행 |

`useDelayedVisibility(active, delayMs)` 훅으로 지연 노출 처리.

적용 화면: plans/manage, templates/manage, calendar/manage, stats/dashboard, workout/session/[logId], workout/today/log, app/error

샘플 라우트: `/settings/state-samples`

### Selection Input UX (PR10)

iOS Settings 스타일: `ValueRow` 탭 → 자식 화면 → Back 즉시 반영

핵심 컴포넌트:
- `SingleSelectionScreen` (라디오/checkmark)
- `MultiSelectionScreen` (iOS checkmark)
- `PickerSelectionScreen` (날짜/시간/숫자)

**URL 상태 규칙**:
- `returnTo` = 부모 경로 + 현재 query
- 자식에서 confirm 시 `withPatchedQuery(returnTo, patch)`로 이동
- `returnTo`는 `/`로 시작하는 안전한 상대 경로만 허용
- Multi 값: 정규화된 CSV로 저장
- Number picker: 양의 정수(`>= 1`)로 정규화

유틸리티:
- `src/lib/selection-navigation.ts`: `normalizeReturnTo`, `withPatchedQuery`, `parseCsvParam`, `toCsvParam`
- `src/lib/selection-options.ts`: 공유 옵션 목록 (timezone, exercise, stats scope, metrics)

### 저장 정책 표준 (PR11)

#### 우선순위

```
1. Optimistic UI (즉시 반영)
2. Local cache write (같은 tick)
3. Server persist (권위 있는 동기화)
4. Canonical response reconcile
```

#### 실패 정책

- 서버 실패 시: UI + 로컬 캐시 즉시 롤백
- 인라인 오류 메시지 + 롤백 안내
- 전역 로딩 오버레이 사용 금지
- 현재 저장 중인 Row만 잠금

#### 중복 입력 방지

- 동일 Row: `pending=true` 동안 새 commit 무시 (더블탭 race 방지)

핵심 서비스:
```
src/lib/settings/update-setting.ts
  - updateSetting()
  - createBrowserSettingStore()
  - createMemorySettingStore()
  - resolveSettingInitialValue()
  - createSettingUpdateGate()

src/lib/settings/use-setting-row-mutation.ts
  - useSettingRowMutation() → { value, pending, error, notice, commit }
```

테스트: `pnpm --dir web run test:settings:policy`

### Row 상세 스타일 가이드 (PR12)

#### 아이콘 규칙

| Do | Don't |
|----|-------|
| `RowIcon` 컴포넌트만 사용 | 화면별 임의 아이콘 컨테이너 |
| 섹션별 절제된 tone (Primary: blue/green/tint, System: neutral, 예외: orange) | 모든 Row에 강한 accent 색상 |
| 1~2자 짧은 아이콘 심볼 | 임의 크기/radius 혼용 |

#### 서브타이틀 Row

- 라우팅 컨텍스트를 추가할 때만 사용 (`Primary`, `Flow`, `Input` 등)
- 모든 Row에 기본 추가 금지
- subtitle과 description을 같은 의미로 중복 금지

#### 뱃지

- 희귀 강조(`NEW`, `!`)에만 우측 소형 캡슐
- `badgeTone="accent"` 또는 `"warning"` 절제하여 사용
- 지속적 상태 표시 대체 용도 금지

---

## 6. 설정 검색 · 딥링크

### 설정 검색 (PR14)

검색 인덱스: `src/lib/settings/settings-search-index.ts`

인덱스 항목 구조:
- `key`: 고유 검색 키
- `title`: 검색 결과 Row 제목
- `path`: 딥링크 경로
- `section`: 결과 그룹 (훈련/프로그램/분석/시스템)
- `keywords`: 검색 키워드
- `description`: 보조 설명

검색 로직: `src/lib/settings/settings-search.ts`
- 토큰 분리 + title/keywords/path 기반 스코어 정렬
- 결과: `NavigationRow`로 렌더링
- 하이라이트: query 토큰을 `<mark>`로 강조
- No result: `InfoRow`로 안내

테스트: `src/lib/settings/settings-search.test.ts`

### 딥링크 표준 (PR15)

```
GET /settings/link/{key}
GET /settings/link/{key}?row={rowKey}&source={search|external}
```

Resolution 흐름:
1. `key` 유효성 검사
2. 인덱스에서 target path 조회
3. `row` 있으면 `?row={row}` + `#row-{normalizedRow}` 부여
4. 최종 target으로 redirect

Row anchor id 규칙: `row-{normalizedRowKey}` (소문자, `[a-z0-9_-]` 외 → `-`)

잘못된 딥링크: 404 대신 인라인 안내 + 복구 Row 제공
- `InfoRow`: 오류 유형 안내
- `ValueRow`: 요청 key/row 표시
- `NavigationRow`: `/` 또는 `/settings`로 복구

---

## 7. 접근성 · 품질 게이트 · 릴리즈

### 접근성 기준 (PR8)

| 항목 | 결과 | 방법 |
|------|------|------|
| Dynamic Type 대응 | PASS | rem/clamp 토큰, `text-size-adjust: 100%` |
| 다크모드 완전 대응 | PASS | `color-scheme: light dark`, semantic 토큰 |
| 터치 영역 최소 44pt | PASS | `--touch-target-min: 44px`, `min-height: var(--touch-target)` |
| 명도 대비 | PASS | 전체 `>= 4.5:1` 확인 |

#### 다크 테마 대비 결과

| 색상 | 대비 |
|------|------|
| Primary `#edf3fb` | 15.20:1 |
| Secondary `#a8bbd2` | 8.65:1 |
| Tint `#0a84ff` | 4.65:1 |
| Success `#30d158` | 8.39:1 |
| Danger `#ff453a` | 4.98:1 |

#### 라이트 테마 대비 결과

| 색상 | 대비 |
|------|------|
| Primary `#111111` | 18.88:1 |
| Secondary `#6b7280` | 4.83:1 |
| Tint `#0067d8` | 5.34:1 |
| Success `#1e7a34` | 5.40:1 |
| Danger `#b3261e` | 6.54:1 |

### iOS Settings 준수 점검 (PR16)

#### 자동 점검 기준

| 항목 | 기준 |
|------|------|
| Section 간 간격 | 최소 8px |
| Row 좌우 패딩 | 최소 12px (목표 16px) |
| 본문 기본 크기 | 최소 14px |
| Touch target | `[data-settings-touch-target]` 높이 최소 44px |
| 배경색 | transparent 금지 |
| `--accent-primary` 토큰 | 존재 필수 |

#### 화면별 체크리스트 (일부)

| 화면 | Spacing | Typography | Color | Touch | A11y |
|------|---------|------------|-------|-------|------|
| 루트 `/` | A | A | A | A | A |
| `/settings` | A | A | A | A | A |
| `/settings/save-policy` | A | A | A | A(S) | A |
| `/settings/state-samples` | A | A | A | A(S) | A |

A=자동, S=반자동(상호작용 포함)

#### 릴리즈 게이트

```bash
pnpm --dir web run build
pnpm --dir web run test:a11y:contrast
```

구성:
- `test:a11y:contrast` — 색상 대비 토큰 점검
- iOS Settings 전용 compliance E2E는 v2 디자인 시스템 전환 후 제거됨

#### 반자동 확인 항목

- Dynamic Type 환경에서 줄바꿈/잘림 점검
- Light/Dark 모드 주요 플로우 수동 탐색
- Search → Deep Link → Target Row 이동 체감 확인
- 저장 실패 롤백 문구 행동 유도 문장 확인

---

## 8. 운동 기록 플로우

### 운동 추가 플로우 (PR18)

추가된 `+ 운동 추가` 진입점:
- 빠른 액션 패널
- 고급 액션 패널
- Empty state 패널

운동 추가 바텀시트:
- 검색 입력
- 추천/등록 운동 원탭 선택
- 검색 텍스트 존재 시 수동 텍스트 추가

세트 번호 자동 증가 (동일 운동명 기준).

상단 플로우 카피 순서: `생성/적용 → 추가/기록 → 저장`

### 초보자/고급 모드 (PR19)

```
기본 모드 (기본값): 핵심 플로우 집중
고급 모드:          고급 컨트롤 + 스냅샷/비교
```

한 단계 승급 버튼:
- `고급 제어 열기`
- `세션 상세 비교 열기(고급 모드)`

**비회귀 보장**: 고급 생성 컨트롤, 세션 오버라이드, 스냅샷/비교, 행 단위 컨트롤 유지

### 워크아웃 레코드 상태 전이 (PR32)

```
Idle ─(수정/추가/삭제)─► Editing
       ◄─────────────────
Editing ─(완료 + 검증 통과)─► Saving
Editing ─(완료 + 검증 실패)─► Editing (오류 메시지)
Saving ─(저장 성공)─► Done ─► Home(/) 이동
Saving ─(저장 실패)─► Editing
```

---

## 9. UX 이벤트 · 퍼널 분석

### 클라이언트 이벤트 트래킹 (PR19)

유틸리티: `src/lib/workout-ux-events.ts`
- localStorage(`workoutlog:ux-events`)에 최근 이벤트 저장
- `workoutlog:ux-event` browser event emit (디버그용)

계측 이벤트:
- `workout_log_opened`, `workout_focus_mode_changed`, `workout_plan_changed`
- `workout_generate_apply_clicked/succeeded/failed`
- `workout_add_exercise_sheet_opened/closed/added/failed`
- `workout_repeat_last_clicked/succeeded/failed`
- `workout_save_clicked/succeeded/failed`
- `workout_override_sheet_opened`

### 서버 UX 이벤트 동기화 (PR21)

```
POST /api/ux-events
  - 배치 최대 200개, event id 기준 중복 제거
  - 멱등 insert (userId + clientEventId conflict ignore)

GET /api/stats/ux-events-summary
  - 기간 (days 또는 from/to, 기본 14일)
  - 이벤트 총계 + 가이드 힌트 요약 카운터
  - stats_cache (metric: ux_events_summary)
```

DB 테이블: `ux_event_log`

동기화 트리거:
- 초기 마운트
- 온라인 복구
- 미동기화 버퍼 임계 초과 자동 동기화
- 헤더 뱃지 수동 동기화 버튼

### UX 퍼널 분석 (PR20)

```
GET /api/stats/ux-funnel
  - 기간 (days 또는 from/to), planId, comparePrev=1
  - format=json|csv
```

데이터 소스:
- `generated_session`, `workout_log`, `workout_set`

대시보드 카드:
- 세션 생성 → 로그 저장 → 추가 운동 포함 저장 단계 수
- 전환율 + 트렌드 델타
- 최대 이탈 단계 강조
- CSV 다운로드

로컬 가이드 힌트:
- `workoutlog:ux-events` 기반 다음 액션 추론
- 단일 주요 안내 카드 + 액션 버튼

### UX 스냅샷 API (PR24)

```
GET /api/stats/ux-snapshot
  - 기간, planId, comparePrev=1, windows=1,7,14, format=json|csv
  - 반환: 퍼널 요약, 1/7/14일 창 요약+트렌드, 임계치 어노테이션
  - stats_cache (metric: ux_snapshot)
```

대시보드 임계치 카드:
- `세션 생성→저장 전환율`
- `7일 저장 클릭→성공율`
- `14일 시트 오픈→운동 추가율`

### UX 비교 모드 + 커스텀 임계치 (PR25)

대시보드 `비교 모드` 토글: 현재 vs 이전 구간 비교 테이블

설정 키:
```
prefs.uxThreshold.saveFromGenerate
prefs.uxThreshold.saveSuccessFromClicks7d
prefs.uxThreshold.addAfterSheetOpen14d
```

설정 화면: `/settings/ux-thresholds` — 임계치 조정 + optimistic update + rollback + 초기화

### DB 설정 영속화 + 플랜별 임계치 (PR26)

DB 테이블: `user_setting` (`user_id`, `key`, `value`, timestamps), unique `(user_id, key)`

마이그레이션: `0009_sturdy_meridian.sql`

플랜별 오버라이드 키:
```
prefs.uxThreshold.plan.{planId}.saveFromGenerate
prefs.uxThreshold.plan.{planId}.saveSuccessFromClicks7d
prefs.uxThreshold.plan.{planId}.addAfterSheetOpen14d
```

임계치 해결 순서: 플랜 오버라이드 → 글로벌 설정

### UX 이벤트 보존 정리 (PR22)

```bash
pnpm --dir web run db:cleanup:ux-events
```

환경 변수:
- `UX_EVENTS_RETENTION_DAYS` (기본: 120)
- `UX_EVENTS_CLEANUP_DRY_RUN=1` (dry-run)

스크립트: `src/server/db/cleanupUxEventLog.ts`

### UX 대시보드 요약 창 (PR22)

API 응답 추가 필드:
- `saveSuccessFromClicks`, `generateSuccessFromClicks`, `addAfterSheetOpen`, `repeatSuccessFromClicks`, `saveSuccessFromOpens`
- `comparePrev=1`: 이전 구간 동일 길이 비교
- `trend` 델타 (카운트 + 주요 전환율)

대시보드 카드: `UX 행동 요약 (오늘/7일/14일)` — 1/7/14일 창별 핵심 카운트 + 전환 안정성 트렌드

### UX 프리셋 + 스냅샷 내보내기 (PR23)

대시보드 UX 프리셋:
- `오늘 / 7일 / 14일` 버튼
- 현재 범위 일치 시 활성 강조

스냅샷 내보내기:
- `스냅샷 JSON`, `스냅샷 CSV` 버튼
- 페이로드: 선택 필터 + UX 퍼널 요약 + 1/7/14일 창 요약 + 트렌드

---

## 10. 비동기 UX 연속성

### SWR 캐시 레이어 (PR37)

선택 근거: 기존 `apiGet` 호출 화면 전체에 즉시 적용 가능, 마이그레이션 비용 최소

`src/lib/api.ts` 변경:
- `apiGet`: SWR 스타일 캐시 + in-flight 중복 제거 기본 적용
- bounded in-memory LRU 캐시
- `apiInvalidateCache()` 헬퍼
- `subscribeApiNetworkInflight()` → UI gating
- `apiPost/apiPut/apiPatch/apiDelete`: 성공 후 캐시 자동 무효화

공유 UI 훅:
- `src/lib/ui/use-api-network-busy.ts`
- `src/lib/ui/use-query-settled.ts`

`EmptyStateRows` 개선: API 요청 in-flight 중 렌더링 지연 (bounded defer)

기대 효과:
- 재진입 시 warm 데이터 즉시 재사용 → 로딩 플래시 감소
- 빠른 반복 탐색 시 중복 네트워크 요청 방지
- 배경 revalidation으로 데이터 신선도 유지

### 비동기 UX 하드닝 (PR38)

`EmptyStateRows`: `revealDelayMs` 기반 안정화 지연 추가
- 네트워크 busy defer + reveal delay 2단계 게이트

화면별 settled gating 확장:
- `plans/manage`: templates/plans 로드 키 분리
- `templates/manage`: templates/versions 로드 키 분리
- `stats/dashboard`: core/details/migration 쿼리별 settled 키
- `workout/today/log`: 초기 플랜 로드 완료 전 경고 노출 방지
- `workout/session/[logId]`: 초기 loading 타이밍 보정

### 비동기 UX 회귀 게이트 (PR39, PR40, PR41)

Playwright 회귀 스펙:
- `e2e/async-ux-continuity.spec.ts` — plans/templates/stats (PR39, PR40)
- `e2e/stats-1rm-async-continuity.spec.ts` — `/stats` 페이지 비동기 UX (PR41, 설계명 stats-1rm)

안정성 장치:
- `serviceWorkers: "block"`
- `context.route("**/api/**")` 중앙 API 라우터
- 미모킹 API 즉시 실패 처리
- endpoint hit assertion

`/stats` (`Stats1RMDetailed`) 통합 (PR40):
- 수동 settled 키 관리 제거 → `useQuerySettled` 기반 통일
- `fetchSettingsSnapshot` 강제 `network-only` 제거 → `apiGet` SWR 기본 경로 사용

수동 점검 체크리스트: `docs/async-ux-continuity-checklist.md`

---

## 11. DevOps — 마이그레이션 · 운영 텔레메트리

### 배포 안전 마이그레이션 잠금 (PR27)

`web/scripts/migrate.mjs` 강화:
- DB Advisory Lock (직렬화)
- `DB_MIGRATE_ENABLED=0` 스킵 모드

주요 환경 변수:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DB_MIGRATE_ENABLED` | `1` | 마이그레이션 활성화 |
| `DB_MIGRATE_USE_ADVISORY_LOCK` | `1` | Advisory Lock 사용 |
| `DB_MIGRATE_LOCK_ID` | `872341` | Lock ID |
| `DB_MIGRATE_LOCK_MAX_WAIT_MS` | `180000` | 최대 대기 시간 |
| `DB_MIGRATE_LOCK_POLL_MS` | `1500` | 폴링 간격 |
| `DB_MIGRATE_MAX_ATTEMPTS` | `30` | 최대 시도 횟수 |
| `DB_MIGRATE_RETRY_DELAY_MS` | `2000` | 재시도 지연 |

배포 파이프라인: web 컨테이너 교체 전 one-shot 마이그레이션 실행 → 실패 시 배포 중단

### 전용 마이그레이션 Job (PR28)

멀티 레플리카 배포를 위한 마이그레이션/웹 컨테이너 분리:
- `migrate` 서비스: `node scripts/migrate.mjs` 실행
- `web`: `WEB_DB_MIGRATE_ENABLED=0` 기본 (startup race 방지)

마이그레이션 텔레메트리:
- DB 테이블: `migration_run_log` (`0010_solid_watchtower.sql`)
- 상태 기록: `RUNNING / SUCCESS / LOCK_TIMEOUT / FAILED / SKIPPED`
- Lock 대기 시간, 오류 코드/메시지 포함

운영 엔드포인트:
```
GET /api/ops/migrations   (OPS_MIGRATION_TOKEN으로 보호)
  - 대기 중인 마이그레이션, 텔레메트리, 최근 실행, 알림 요약
  - pending/최근 실패/timeout 존재 시 HTTP 503
```

CI 알림: `DEPLOY_OPS_TOKEN` + `DEPLOY_MIGRATION_ALERT_STRICT=1` 엄격 모드

### 마이그레이션 텔레메트리 대시보드 (PR29, PR30)

API: `GET /api/stats/migration-telemetry`
- 마이그레이션 drift (local/applied/pending)
- 최근 실행 로그, 알림 요약
- 상태: `ok | warn | critical`

대시보드 섹션: "운영 마이그레이션 상태"
- 상태 뱃지, drift 수, 알림 카운터, lock wait 메트릭, 최근 실행 테이블
- 핵심 통계 로딩과 독립 (텔레메트리 실패해도 대시보드 유지)

필터 컨트롤 (PR30):
- lookback 프리셋: `2h / 12h / 24h / 3일`
- 상태 전용 토글: `문제 상태만 ON/OFF`
- `runStatus` 필터: `ALL / ISSUE / SUCCESS / RUNNING / LOCK_TIMEOUT / FAILED / SKIPPED`
- `format=csv` 내보내기

---

## 12. 검증 명령어 모음

```bash
# 타입 체크
pnpm --dir web exec tsc --noEmit

# 빌드
pnpm --dir web build

# 린트
pnpm --dir web lint

# 접근성 대비 점검
pnpm --dir web run test:a11y:contrast

# 저장 정책 테스트
pnpm --dir web run test:settings:policy

# 디자인 하모나이제이션 감사
pnpm --dir web run test:design:harmonization:light
pnpm --dir web run test:design:harmonization:dark
DESIGN_HARMONIZATION_VISUAL_STRICT=1 pnpm --dir web run test:design:harmonization:strict

# 비동기 UX 연속성 회귀
pnpm --dir web run test:async-ux:continuity
pnpm --dir web run test:async-ux:stats-1rm

# UX 이벤트 정리 (dry-run)
UX_EVENTS_CLEANUP_DRY_RUN=1 pnpm --dir web run db:cleanup:ux-events

# 마이그레이션 스킵 테스트
DB_MIGRATE_ENABLED=0 DATABASE_URL=postgres://... node web/scripts/migrate.mjs
```

---

## 13. 인프라 — Vercel & Supabase 이전

### 인프라 전환 배경
- 기존: GCP Compute Engine 내 단일 Docker Compose 환경에서 앱, DB, Github Actions 배포 쉘 스크립트를 관리.
- 변경: 유지보수 부담을 줄이고 앱 성능(Edge 네트워크) 및 배포 파이프라인(Vercel CI)을 극대화하기 위해 Vercel(웹앱) + Supabase(Postgres DB) 조합으로 완전 이전.

### 변경 사항 관리
1. **GitHub Actions 제거**:
   - `deploy.yml` (GCP 서버로 `rsync` 및 `docker pull` 전송하던 레거시 CI/CD 파이프라인) 폐기. Vercel이 Git push 즉시 자체 Edge 배포를 대행.
2. **풀러(Connection Pooler) 분리**:
   - Supabase의 서버리스 커넥션 환경을 지원하기 위해 `.env` 환경 변수가 두 개로 세분화됨.
   - `DATABASE_URL` (포트 6543): 앱의 런타임 쿼리를 처리하는 Transaction 모드 연결 주소 (서버리스 환경 풀러).
   - `DIRECT_URL` (포트 5432): DB 마이그레이션을 처리하는 Session 모드 직접 연결 주소.
3. **빌드 및 배포 파이프라인**:
   - `package.json`의 배포 스크립트에 `pnpm db:migrate && next build --turbopack`을 적용하여, Vercel 빌드 타임에 Drizzle 마이그레이션이 자동 수행되도록 파이프라인 일원화.
   - `vercel.json`에 `icn1` 한국 리전을 등록하여 Supabase 서울서버와의 핑(latency)을 최소화.
