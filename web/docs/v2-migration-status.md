# V2 Migration Status

화면별 V2 디자인 시스템 마이그레이션 진행 상황. PR 머지 시마다 갱신.

**기호**
- ✅ 완료 — primitive로 조립, 인라인 typography/색상/spacing 제거됨.
- ⚠️ 부분 — V2 토큰/primitive 일부 사용, 잔존 인라인 있음.
- ❌ 미진행 — legacy `--color-*`, 인라인 typography, 옛 ui 컴포넌트 사용.

---

## Phase D — Foundation

| PR | 내용 | 상태 |
|----|------|------|
| D-1 | Primitive 모듈화 + 신규 primitive + 카탈로그 + 문서 | ✅ |
| D-2 | Legacy `components/ui/{card,primary-button,button}` 폐기 + 토큰 매핑 문서 | ✅ |

### D-2 상세
- `components/ui/{card,primary-button,button}.tsx`: JSDoc `@deprecated` + dev `console.warn` 추가.
- `eslint.config.mjs`: `no-restricted-imports` 규칙 추가 — 새 코드의 legacy ui import 차단.
- 13개 기존 caller는 `LEGACY_UI_IMPORT_EXEMPT` 글로브로 면제 (Phase S에서 점진 제거).
- `styles/v2-overrides.css`: 상단에 Legacy → V2 토큰 매핑 매트릭스 주석.

---

## Phase S — 화면 재조립

### S-1 — Workout flow ✅
| 화면 / 파일 | 상태 |
|---|---|
| `app/page.tsx` (홈) | ✅ |
| `app/workout/log/page.tsx` | ✅ |
| `app/workout/log/add-exercise/page.tsx` | ✅ |
| `app/workout/log/overrides/page.tsx` | ✅ (V2PrimaryBtn 도입, 4-pt 정렬) |
| `app/workout/log/loading.tsx` | ✅ (skeleton 토큰 v2 매핑) |
| `app/workout/[sessionId]/page.tsx` | ✅ |
| `app/workout/session/[logId]/page.tsx` | ✅ |
| `widgets/workout-log-screen/workout-log-screen.tsx` | ✅ (legacy `--text-hint`, `--space-xl` 제거) |
| `features/workout-log/ui/workout-log-keypad-panel.tsx` | ✅ (이미 V2) |
| `features/workout-log/ui/add-exercise-sheet.tsx` | ✅ (V2Card 톤 정렬, .v2-eyebrow/.v2-body 도입, 15 legacy color 제거) |
| `features/workout-log/ui/restore-draft-sheet.tsx` | ✅ (V2PrimaryBtn/V2SecondaryBtn 도입, legacy ui/primary-button 제거) |
| `features/workout-log/ui/workout-log-summary-sheet.tsx` | ✅ (V2Chip/V2IconBtn 도입) |
| `features/workout-log/ui/set-editor-controls.tsx` | ✅ (10 legacy color → v2-c-* 매핑) |
| `features/workout-log/ui/workout-log-overlay-sheets.tsx` | ✅ |
| `features/workout-log/ui/plan-selector-sheet.tsx` | ✅ |
| `components/v2/v2-home-dashboard.tsx` | ✅ (이미 V2) |

**S-1 측정 결과 (after):**
- 모든 workout-flow 파일에서 `var(--color-*)` 직접 참조: **0건**
- 모든 workout-flow 파일에서 legacy `@/components/ui/{card,primary-button,button}` import: **0건**
- 신규 V2 primitive 도입: `V2PrimaryBtn`, `V2SecondaryBtn`, `V2IconBtn`, `V2Chip` (as="a" / href 폴리모픽 활용 포함).

### S-2 — Calendar ✅
| 화면 / 파일 | 상태 |
|---|---|
| `app/calendar/page.tsx` | ✅ |
| `app/calendar/loading.tsx` | ✅ (skeleton 토큰 v2 매핑) |
| `app/calendar/options/page.tsx` | ✅ (V2NavRow / V2PrimaryBtn 도입, custom SettingRow 제거) |
| `app/calendar/options/picker/[field]/page.tsx` | ✅ |
| `app/calendar/options/select/[field]/page.tsx` | ✅ |
| `widgets/calendar-screen/calendar-screen.tsx` | ✅ |
| `features/calendar/ui/calendar-selected-date-section.tsx` | ✅ (전면 재조립: V2Card / V2Chip / V2EmptyState / V2PrimaryBtn / V2SecondaryBtn(danger) / V2Hairline) |
| `features/calendar/ui/calendar-month-card.tsx` | ✅ (v2 토큰 매핑) |
| `features/calendar/ui/calendar-recent-logs-section.tsx` | ✅ (V2Chip 도입) |
| `features/calendar/ui/calendar-filter-bar.tsx` | ✅ |
| `features/calendar/ui/calendar-overlay-sheets.tsx` | ✅ (delete 시트 V2PrimaryBtn/V2SecondaryBtn) |
| `components/ui/calendar-range-picker.tsx` | ✅ (V2IconBtn 도입, 22 legacy color 제거) |

**S-2 측정 결과 (after):**
- 모든 calendar 파일에서 `var(--color-*)` 직접 참조: **0건** (이전 합계 152건)
- 모든 calendar 파일에서 legacy `@/components/ui/{card,primary-button,button}` import: **0건**
- 주요 변경: 가장 더러웠던 `calendar-selected-date-section.tsx`는 V2 primitive 5종(Card/Chip/EmptyState/PrimaryBtn/SecondaryBtn/Hairline) 조립으로 전면 재작성, LOC 감소.

### S-3 — Stats / PR history ✅
| 화면 / 파일 | 상태 |
|---|---|
| `app/stats/prs/page.tsx` | ✅ |
| `app/stats/prs/loading.tsx` | ✅ |
| `widgets/stats-screen/stats-screen.tsx` | ✅ |
| `widgets/stats-screen/stats-container.tsx` | ✅ |
| `widgets/stats-screen/weekly-volume-section.tsx` | ✅ |
| `widgets/pr-history-screen/pr-history-screen.tsx` | ✅ |
| `features/stats/ui/stats-overview-sections.tsx` | ✅ (PrRow V2 토큰 매핑, .v2-num-sm/.v2-eyebrow 도입) |
| `features/stats/ui/strength-summary-grid.tsx` | ✅ (StrengthCard V2 토큰 + V2Chip(PR/e1RM) 도입) |
| `features/stats/ui/e1rm-interactive-chart.tsx` | ✅ (`--metric-1rm-color` → `--v2-c-onerm`, hairline/ink V2 매핑) |
| `features/stats/ui/stats-1rm-chart-section.tsx` | ✅ |
| `features/stats/ui/stats-1rm-controls.tsx` | ✅ |
| `features/stats/ui/stats-1rm-detailed-panel.tsx` | ✅ |
| `features/stats/ui/stats-1rm-detailed.tsx` | ✅ |
| `features/stats/ui/stats-1rm-overlay-sheets.tsx` | ✅ |

**S-3 측정 결과 (after):** 모든 stats 파일에서 `var(--color-*)`, `var(--metric-*)`, `var(--space-*)` 직접 참조: **0건**.

### S-4 — Program Store + Exercise catalog/detail ✅
| 화면 / 파일 | 상태 |
|---|---|
| `app/program-store/page.tsx` | ✅ |
| `app/program-store/detail/page.tsx` | ✅ |
| `app/program-store/customize/page.tsx` | ✅ |
| `app/program-store/create/page.tsx` | ✅ |
| `app/program-store/loading.tsx` | ✅ |
| `app/exercises/page.tsx` | ✅ |
| `app/exercises/[exerciseId]/page.tsx` | ✅ |
| `app/exercises/[exerciseId]/loading.tsx` | ✅ |
| `app/exercises/[exerciseId]/not-found.tsx` | ✅ |
| `widgets/program-store-screen/program-store-screen.tsx` | ✅ |
| `widgets/exercise-detail-screen/exercise-detail-screen.tsx` | ✅ |
| `features/program-store/ui/program-list-card.tsx` | ✅ (V2PrimaryBtn / V2SecondaryBtn 도입, 25 legacy color 제거) |
| `features/program-store/ui/program-detail-sheet.tsx` | ✅ (V2PrimaryBtn/V2SecondaryBtn(danger) 도입, legacy PrimaryButton 제거, 34 legacy color 제거, .v2-eyebrow/.v2-num-sm/.v2-body 도입) |
| `features/program-store/ui/customize-program-sheet.tsx` | ✅ (Card → V2Card, drag handler div, legacy ui 제거) |
| `features/program-store/ui/create-program-sheet.tsx` | ✅ (Card → V2Card, legacy ui 제거) |
| `features/program-store/ui/start-program-sheet.tsx` | ✅ (Card → V2Card, legacy ui 제거) |
| `features/program-store/ui/program-store-browse-content.tsx` | ✅ (Button → V2PrimaryBtn/V2SecondaryBtn) |
| `features/program-store/ui/program-exercise-editor-row.tsx` | ✅ (16 legacy color 일괄 매핑) |
| `components/exercise-catalog/exercise-catalog-content.tsx` | ✅ (Card → V2Card, 22 legacy color/14 inline type 일괄 매핑) |

**S-4 측정 결과 (after):** 모든 program-store + exercise 파일에서 `var(--color-*)`, legacy ui import: **0건**. legacy ui import 5개 → 0개.

### S-5 — Plans ✅
| 화면 / 파일 | 상태 |
|---|---|
| `app/plans/page.tsx` | ✅ (Button → V2SecondaryBtn(as="a")) |
| `app/plans/create/page.tsx` | ✅ |
| `app/plans/history/page.tsx` | ✅ |
| `app/plans/history/loading.tsx` | ✅ (skeleton 토큰 v2) |
| `app/plans/manage/page.tsx` | ✅ |
| `app/plans/manage/loading.tsx` | ✅ |
| `app/plans/manage/plans-manage-content.tsx` | ✅ (766 LOC, PrimaryButton → V2PrimaryBtn/V2SecondaryBtn(danger,icon=delete), legacy color 일괄 매핑) |
| `app/plans/context/page.tsx` | ✅ (Button → V2SecondaryBtn) |
| `app/plans/context/picker/[field]/page.tsx` | ✅ |
| `app/plans/context/select/[field]/page.tsx` | ✅ |
| `components/ui/plan-selector-button.tsx` | ✅ |

**S-5 측정 결과 (after):** Plans 그룹 모든 파일에서 `var(--color-*)` 0건, legacy ui import 0건. legacy ui import 3 → 0.

### S-6-A — Settings IA compaction ✅ (16 → 8 routes)

**IA 변경 7개 채택 결과:**
- ✅ inline-expand 행 도입 (V2NavRow `expandable` prop 추가) — theme/language/bodyweight를 페이지 이동 없이 더보기 화면에서 즉시 조작.
- ✅ `/settings/exercise-management` redirect 페이지 제거 — V2MorePage에서 직접 `/exercises`로 link.
- ✅ `/settings/about` 제거 — App info(이름/버전/플랫폼) + onboarding replay를 V2MorePage footer로 흡수.
- ✅ `/settings/system-stats` + `/settings/ux-thresholds` + `/settings/save-policy` + `/settings/selection-template` → `/settings/debug` 단일 페이지로 통합 (4 section block).
- ✅ V2MorePage "Progress" 섹션 제거 — Stats는 메인 nav에 이미 존재.
- ✅ Onboarding replay 항목 → footer 작은 텍스트 링크.
- ✅ `Advanced` 섹션 신설 — `/settings/debug` 1개 항목.

**Routes (16 → 8):**
| 유지 | 제거 / 통합 |
|------|-------------|
| `/settings` (hub) | ~~`/settings/about`~~ → footer |
| `/settings/account` | ~~`/settings/theme`~~ → inline-expand |
| `/settings/data` | ~~`/settings/language`~~ → inline-expand |
| `/settings/data-export` | ~~`/settings/bodyweight`~~ → inline-expand |
| `/settings/minimum-plate` | ~~`/settings/exercise-management`~~ → 직접 `/exercises` link |
| `/settings/debug` (신규) | ~~`/settings/system-stats`~~ → `/settings/debug` |
| `/settings/link` + `/settings/link/[key]` (내부) | ~~`/settings/ux-thresholds`~~ → `/settings/debug` |
|  | ~~`/settings/save-policy`~~ → `/settings/debug` |
|  | ~~`/settings/selection-template`~~ → `/settings/debug` |

**핵심 산출물:**
- `V2NavRow` `expandable / expanded / onExpandedChange / expandedContent` prop (primitive 보강)
- `v2-more-page.tsx`: 인라인 `ThemeRow` / `LanguageRow` / `BodyweightRow` + `OptionList` + `AppInfoFooter` 컴포넌트로 재구성
- `/settings/debug/page.tsx` + `/settings/debug/debug-content.tsx` + `/settings/debug/_sections/{system-stats,ux-thresholds,save-policy,selection-template}-section.tsx`
- `settings-search-index.ts`, `app-routes.ts`, `top-back-button.tsx`, `settings/layout.tsx` deeplink/타이틀 매트릭스 갱신
- 카탈로그 페이지에 expandable row 데모 추가

**경로 변경에 따른 동시 갱신:**
- search index의 save-policy/selection-template/ux-thresholds 항목 `path` → `/settings/debug`
- search index의 exercise-management `path` → `/exercises`
- `APP_ROUTES.systemStats` → `/settings/debug`
- `top-back-button` 라벨 매핑에서 삭제된 sub-route 제거 + 디버그 타이틀 추가
- `settings/layout` modal title resolver에서 삭제된 sub-route 정리

**LOC 감소:** 제거된 4개 단순 페이지(theme, language, bodyweight + content, about) 합계 ~470 LOC. /settings/debug는 기존 콘텐츠 재사용이라 신규 LOC는 ~100.

### S-6-B — Settings 잔존 dirt 정리 ✅

S-6-A IA 압축 후 남은 V2 토큰 정리. 작업 대상:

| 파일 | 변경 |
|------|------|
| `app/settings/account/page.tsx` (854 LOC) | 12 legacy color + 3 font-family → V2 토큰 |
| `app/settings/data-export/page.tsx` (419 LOC) | 2 legacy color + 1 font-family → V2 토큰 |
| `app/settings/minimum-plate/minimum-plate-page-content.tsx` (513 LOC) | 14 legacy color + 4 font/font-family → V2 토큰; `--color-selected-weak` → `color-mix(in srgb, var(--v2-accent) 14%, var(--v2-paper))` |
| `app/settings/debug/_sections/system-stats-section.tsx` (342 LOC) | 18 legacy color + 4 font-family → V2 토큰 |
| `app/settings/debug/_sections/ux-thresholds-section.tsx` (351 LOC) | 2 legacy color + 1 font-family → V2 토큰 |
| `components/ui/settings-list.tsx` (496 LOC, **shared core**) | 12 legacy color (`--color-selected-weak`, `--color-action-strong` 포함) → V2 |
| `components/ui/settings-list.tokens.ts` (33 LOC, **shared core**) | 11 legacy color + `--color-focus-ring` → V2 |

**S-6-B 측정 결과 (after):**
- Settings 영역 모든 파일에서 `var(--color-*)`: **0건** (이전 78건 → 0)
- `var(--font-*)`: **0건** (font-family 인라인 → `var(--v2-f-display)` / `var(--v2-f-text)`)
- legacy ui import: **0건**

핵심 변경: `settings-list.tsx`와 `settings-list.tokens.ts`는 공유 코어 — 이번 정리로 모든 settings 페이지(account/data/data-export/minimum-plate/debug)가 자동으로 V2 톤 적용됨.
| 화면 / 파일 | 상태 |
|---|---|
| `app/settings/page.tsx` | ❌ |
| `app/settings/about/page.tsx` | ❌ |
| `app/settings/account/page.tsx` | ❌ |
| `app/settings/bodyweight/page.tsx` | ❌ |
| `app/settings/data/page.tsx` | ❌ |
| `app/settings/data-export/page.tsx` | ❌ |
| `app/settings/exercise-management/page.tsx` | ❌ |
| `app/settings/language/page.tsx` | ❌ |
| `app/settings/link/page.tsx` | ❌ |
| `app/settings/link/[key]/page.tsx` | ❌ |
| `app/settings/minimum-plate/page.tsx` + `minimum-plate-page-content.tsx` | ❌ |
| `app/settings/save-policy/page.tsx` | ❌ |
| `app/settings/selection-template/page.tsx` | ❌ |
| `app/settings/system-stats/page.tsx` | ❌ |
| `app/settings/theme/page.tsx` | ❌ |
| `app/settings/ux-thresholds/page.tsx` | ❌ |
| `components/settings/*` | ❌ |
| `components/ui/settings-list.tsx` | ❌ |

### S-7 — Auth + Onboarding + 공통 chrome + Shared UI cleanup ✅
| 화면 / 파일 | 상태 |
|---|---|
| Auth / Onboarding 본체 (`/app/login/signup/forgot-password/reset-password/onboarding`) | ✅ (S-1~S-6 단계에서 0 dirt 유지) |
| `components/v2/v2-auth-form.tsx`, `components/v2/auth/*` | ✅ |
| `components/v2/v2-onboarding.tsx` | ✅ |
| `components/v2/v2-bottom-nav.tsx`, `v2-bottom-dock-context.tsx`, `v2-plan-sheet.tsx`, `v2-password-sheet.tsx`, `v2-session-summary.tsx` | ✅ |
| `app/error.tsx` | ✅ (legacy `Card` → `V2Card` + `V2PrimaryBtn`, V2 typography 클래스로 재조립) |
| `app/layout.tsx` | ✅ (V2 frame 기존 유지) |
| `app/loading.tsx`, `components/app-launch-splash.tsx`, `app/test-safari/page.tsx` | ✅ (skeleton + splash V2 토큰 매핑) |
| `components/ui/form-controls.tsx` (282 LOC) | ✅ (5 legacy color) |
| `components/ui/month-year-picker-sheet.tsx` (88 LOC) | ✅ (2 legacy color) |
| `components/ui/number-picker-sheet.tsx` (218 LOC) | ✅ (13 legacy color) |
| `components/ui/search-input.tsx` (168 LOC) | ✅ (Card→V2Card, 5 legacy color) |
| `components/ui/search-select-sheet.tsx` (160 LOC) | ✅ (6 legacy color) |
| `components/ui/session-card.tsx` (242 LOC) | ✅ |
| `components/ui/settings-list.example.tsx` (97 LOC) | ✅ |
| `components/ui/toast.tsx` (71 LOC) | ✅ (#ffffff → `var(--v2-ink-on-accent)`) |
| `components/ui/wheel-picker.tsx` (452 LOC) | ✅ (2 legacy color) |
| `components/ui/app-dialog-provider.tsx` (262 LOC) | ✅ (Card/CardContent → V2Card) |

**S-7 측정 결과 (after):** 모든 S-7 파일에서 `var(--color-*)` 0건, legacy ui import 0건.

---

## Phase F — Final cleanup
| PR | 내용 | 상태 |
|----|------|------|
| F-1 | Legacy `components/ui/{card,primary-button,button}` 삭제 + `primitives.tsx` shim 제거 + ESLint exempt 리스트 제거 + tokens.css deprecate 헤더 + 3개 잔존 caller(session-card/session-summary-card/failure-protocol-sheet) migration | ✅ |

### F-1 상세

**삭제된 파일 (4개):**
- `components/ui/card.tsx`
- `components/ui/primary-button.tsx`
- `components/ui/button.tsx`
- `components/v2/primitives.tsx` (shim — 디렉터리 `primitives/index.ts`로 자동 resolve)

**잔존 relative-import caller migration (3개):**
- `components/ui/failure-protocol-sheet.tsx` → `V2Card` (legacy Card/CardContent 제거)
- `components/ui/session-card.tsx` → `V2Card` + `V2PrimaryBtn`. `Card as={Link}` 폴리모픽 → `<Link><V2Card>` 래핑 패턴으로 변환. 비-인터랙티브 CTA(`as="div" interactive={false}`) → V2 스타일링한 `<div>` (parent Link가 클릭 surface).
- `components/ui/session-summary-card.tsx` → 동일 `<Link><V2Card>` 패턴.

**ESLint 정리:**
- `LEGACY_UI_IMPORT_EXEMPT` 블록 제거. 13개 exempt 파일 모두 V2로 마이그레이션 완료되어 더 이상 면제 불필요.
- `no-restricted-imports` 규칙은 유지 (향후 동일 모듈명을 재생성하는 것을 방지하는 가드).

**tokens.css 정리:**
- 파일 상단에 명시적 `@deprecated` 헤더 추가. `--v2-*` 직접 사용 안내 + `v2-overrides.css` 매핑 매트릭스 참조 안내.
- 토큰 정의 자체는 삭제하지 않음(이유: `styles/components/*.css`가 legacy `--color-*` 토큰을 여전히 참조하며, `v2-overrides.css`가 V2로 alias하므로 기능 무중단).

**검증:**
- `pnpm --dir web run typecheck`: clean
- `pnpm --dir web run lint`: 0 errors (39 pre-existing warnings, 3개 감소 = 삭제된 파일의 unused vars)
- `pnpm --dir web run build`: ✓ Compiled successfully in 23.4s
- 코드베이스 전체 `var(--color-*)` 직접 참조 (TS): **0**
- 코드베이스 전체 legacy ui import: **0**

---

## 🎉 Phase D + S + F — 전체 완료

| Phase | PRs | 기간 효과 |
|-------|-----|-----------|
| D (Foundation) | D-1, D-2 | V2 primitive 모듈화, 카탈로그, ESLint 가드, 토큰 매핑 문서 |
| S (Screen reassembly) | S-1~S-7 (sub: S-6-A, S-6-B) | 모든 화면 V2 primitive로 재조립, 350+ legacy color → 0, Settings IA 16→8 |
| F (Cleanup) | F-1 | Legacy stub 파일 삭제, shim 제거, exempt 리스트 제거, tokens.css deprecate |

총 **10개 PR**으로 IronGraph V2 디자인 시스템 통합 완료. 작업 시작 시점 합산 dirt:
- `var(--color-*)` 직접 참조: **350+ → 0**
- Legacy `@/components/ui/{card,primary-button,button}` import: **13 → 0**
- Settings 페이지 수: **16 → 8 (-50%)**
- V2 primitive 가용: **10 → 17**
- 카탈로그 페이지: **0 → 1** (`/design-system`)
- 문서: 0 → README + migration-status + tokens.css deprecate header

---

## 코드베이스 전체 측정 (Phase S 완료 시점)

| 신호 | Phase D 시작 전 | Phase S 완료 후 |
|------|---:|---:|
| `var(--color-*)` 직접 참조 (전체 web/src) | 약 350+ | **0** |
| Legacy `@/components/ui/{card,primary-button,button}` import | 13 | **0** |
| Settings 페이지 수 | 16 | 8 (-50%) |
| V2 primitive 가용 | 10 | 17 |

Phase S의 6개 PR (S-1 ~ S-7)로 전체 화면 재조립 완료. 이제 F-1만 남음.

---

## 측정 — Dirt rank (S 시작 시점 reference)

| Rank | File | hex | `var(--color-*)` | inline type | LOC |
|------|------|----:|----:|----:|----:|
| 1 | `features/calendar/ui/calendar-selected-date-section.tsx` | 0 | 59 | 48 | 536 |
| 2 | `features/program-store/ui/program-detail-sheet.tsx` | 0 | 34 | 12 | 703 |
| 3 | `features/program-store/ui/program-list-card.tsx` | 1 | 25 | 11 | 387 |
| 4 | `features/workout-log/ui/add-exercise-sheet.tsx` | 0 | 15 | 19 | 515 |
| 5 | `components/ui/calendar-range-picker.tsx` | 0 | 22 | 11 | — |
| 6 | `components/exercise-catalog/exercise-catalog-content.tsx` | 0 | 22 | 11 | — |
| 7 | `app/settings/system-stats/page.tsx` | 0 | 18 | 13 | — |
| 8 | `app/calendar/options/page.tsx` | 0 | 13 | 14 | 243 |
