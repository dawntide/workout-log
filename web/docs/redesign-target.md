# Redesign Target — Terminal 테마 ("ironlog")

> workout-log를 **"터미널 안에서 구동하는"** 디자인으로 확장하는 북극성 스펙.
> 기존 `paper`(Quiet Premium) 테마는 **그대로 유지**, 선택 가능한 `terminal` 테마를 신규 추가한다.
>
> 표기: **[LOCKED]** = 확정 · **[GROUNDED]** = Lazyweb+웹 리서치(2026-06-19, 5스트림 워크플로우)로 검증·확정.

---

## 0. 한 줄 요약

`paper` 테마는 손대지 않고, **모노스페이스 풀-TUI** 경험의 `terminal` 테마를 2계층 테마 모델(Theme ⟂ Appearance) 위에 추가한다. 셸 chrome·프롬프트·TUI 패널·명령 팔레트까지 전 화면에 적용한다.

## 1. 확정 결정 [LOCKED]

| 항목 | 결정 |
|---|---|
| 작업 접근 | **Lean** (show_widget 목업 주도 → 직접 구현 → preview 검증, Claude Design 비의존) |
| 구현 범위 | **풀 Tier2 (전 화면 몰입)** — 셸 chrome·프롬프트·TUI 테이블·명령 팔레트 |
| 팔레트 | **Modern ANSI** (green/amber/cyan on green-near-black) |
| 밝기 범위 | **terminal = dark-only**. paper는 light/dark/system 유지 |
| 모바일 정책 | **외형 몰입 우선, 인체공학 후보정**(별도 패스, §7) |

## 2. 테마 아키텍처 — 2계층 [LOCKED]

```html
<html data-theme="paper|terminal" data-mode="light|dark">
```
- **Theme(1계층)**: `paper` · `terminal`. 명시적 선택, 지원 모드를 선언. `terminal`은 `{dark}`만.
- **Appearance(2계층)**: `light` · `dark` · `system`(런타임 resolve). terminal 선택 시 컨트롤 "dark 고정"으로 적응.
- 토큰 DRY: `[data-theme="terminal"]`=형태(mono·radius0·flat), `[...][data-mode="dark"]`=색.

## 3. 팔레트 [GROUNDED]

4개 실배포 터미널 테마(Tokyo Night·Gruvbox·**Everforest**·Catppuccin) + btop 미터 스키마 + 글래스콕핏 항공규약으로 교차검증. 대비는 **WCAG 2.1 실측**(가장 밝은 표면 기준 worst-case). 프로비저널 대비 3곳 변경(▲), 그 외 검증됨.

```css
/* ── ironlog · Modern ANSI on green-near-black (dark-only) ── */
/* Surfaces — 단조 상승 ramp (No-Line: "가까울수록 밝게") */
--term-bg:    #0b0e0b;  /* 앱 캔버스 / 터미널 void */
--term-panel: #11150f;  /* 카드 / 박스 패널 (+1) */
--term-inset: #171c15;  /* inset 행·chrome 밴드·status bar (+2) */
--term-sel:   #1e241b;  /* active/선택 행 fill (+3) */
/* Text */
--term-fg:    #c9d8c4;  /* 본문 11.83:1 AAA */
--term-dim:   #82997b;  /* 보조/라벨 5.70:1 AA  ▲(was #6f8a68 → 4.57 FAIL) */
--term-ghost: #3a5237;  /* 직전세션·미입력 세트 dot (recessive) */
/* Semantic accents (dim 제외 전부 ≥7:1 AAA) */
--term-green: #6ee787;  /* done/ok/success 11.28:1 (= GitHub Primer done) */
--term-amber: #e3b341;  /* active/logging/warn 9.05:1 (= 커서색) */
--term-cyan:  #7fd1c4;  /* 숫자/load/metric 9.92:1  ▲(was #6fd0d0, sage로 nudge) */
--term-red:   #ff7b72;  /* fail/danger 6.99:1 */
--term-gold:  #ffcf5c;  /* PR/신기록/highlight 12.02:1 (희소성=축하, 남용금지) */
--term-blue:  #79c0ff;  /* links/refs 9.06:1  ▲ADDED */
/* Meter gradient (btop triad — 값-색상 바) */
--term-meter-lo:  #6ee787;  --term-meter-mid: #e3b341;  --term-meter-hi: #ff7b72;
--term-track:     #1e241c;  /* 빈 바 채널 (░ 슬롯) ▲ADDED */
/* Structure */
--term-cursor:   #e3b341;
--term-line:     rgba(110,231,135,0.22);  /* 패널 내 hairline  ▲(was .18 = 1.45:1 invisible) */
--term-line-box: rgba(110,231,135,0.30);  /* box-drawing 프레임 */
--term-scrim:    rgba(11,14,11,0.72);      /* ^P 팔레트 뒤 dim ▲ADDED */
```

**의미 매핑(고정)**: done→green · active/logging/포커스행/커서→amber · **모든 숫자(weight·reps·%1RM·타이머)→cyan** · fail/파괴적→red · **PR/올타임기록→gold(다른 데 쓰지 말 것)** · links→blue.
**규칙**: 상태는 **색 + 글리프** 이중 인코딩(`✓/✗/▶/★/W/·`), 색만으로 구분 금지. **dimming에 `opacity` 금지**(near-black에서 AA 미달) — 반드시 토큰 교체. active/포커스 = **+1 표면 단계, border 금지**.

## 4. 타이포그래피 [GROUNDED]

**키스톤: 한글이 2:1 모노 그리드에 머물러야** `│` 컬럼이 안 깨진다. Latin-only mono를 첫 패밀리로 두면 한글에서 프로포셔널 폰트로 대체→그리드 붕괴. → **첫 패밀리는 반드시 CJK mono.**

```css
font-family:
  "Sarasa Mono K",          /* base: Latin+한글 2:1 융합 (OFL 1.1, self-host) */
  "D2Coding",               /* 한글 mono 세이프티넷 (OFL 1.1) */
  "JetBrains Mono",         /* Latin fallback: 0/O·1/l/I 구분 최상 (OFL 1.1) */
  "Symbols Nerd Font Mono", /* 아이콘 글리프 (PUA, 단일셀) */
  ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
font-variant-numeric: tabular-nums;
font-feature-settings: "tnum" 1, "zero" 1;
font-variant-ligatures: none;
```
- **라이선스**: 전부 OFL/MIT → self-host(woff2) 가능. Sarasa는 **`K` 리전 슬라이스만** 번들(용량↓). 블록/브레일/박스 글리프가 시스템폰트에 의존하면 iOS/안드로이드 webview에서 tofu → self-host 필수.
- **사이즈(380px)**: 본문/세트행 숫자 **15px**, 보조 13px, status 12–13px. **숫자·구조 텍스트 13px 하한**. line-height 1.4, 터치 44px는 **행 padding**으로(폰트 크기와 분리).
- **char budget**: ~36칼럼 그리드 설계. 세트 컬럼은 `ch` 단위(`width:4ch`). 한글=2셀(`휴식 02:30`=10셀) → 최장 한글 라벨을 최협 패널에서 검증.

## 5. 아이콘 [GROUNDED] — ⚠️ 차단 결정 R1

- Material Symbols → **Nerd Font 글리프 + Unicode**(box `┌┐└┘─│`, block `▁▂▃▄▅▆▇█`, shade `░▒▓`, braille `⠀-⣿`, `✓▶✗★·W`). Nerd 글리프는 PUA라 텍스트폰트와 충돌 없음 → 한 스택이 텍스트+아이콘.
- **braille는 block fallback 필수**(btop도 커버리지 경고). 미세 1RM 라인은 **inline SVG**로(브레일 글리프 불신).
- 🚫 **R1 충돌**: CLAUDE.md 하드룰 "Material Symbols Outlined만, custom UI 아이콘 금지"와 정면 충돌. 터미널 미학 전체가 Unicode 글리프에 의존 → **ironlog 테마 한정 스코프 예외**를 CLAUDE.md에 명문화해야 함. **사용자 사인오프 필요(빌드 전 차단)**.

## 6. 구조 — 풀 Tier2 [GROUNDED]

`data-theme="terminal"`일 때 앱을 **persistent 셸로 감싼다**(k9s 모델: 1 chrome + 5 view를 탭/`^P`로 스왑). paper는 기존 V2 그대로.

| Primitive | 소스 | 스펙 |
|---|---|---|
| **TermShell** | k9s · tui-design | 절대 unmount 안 되는 chrome: TitleBar(traffic dots·`~/path`·시계) / TabStrip / 스왑 ViewPane / StatusBar / KeybindHint. 5화면=view. 이 테마에서만 bottom-nav 대체 |
| **TermTable** | Hevy · 뮤직트래커 | `ch`-grid 세트 매트릭스 `SET·PREV·WEIGHT·REPS·✓`, 숫자 우정렬+tabular. 상태는 SET 거터 글리프(`W`amber·`✓`green·`✗`red·`·`ghost). 현재행=sel bg+amber 좌바+블록커서. 트래커식 banding으로 warmup/working 구분 |
| **TermSparkline** | btop | 행 내부 block-eighths 트렌드(6–10자). 미세 1RM은 braille ~40col+gold `★` PR마커, **block fallback 동반** |
| **TermProgress** | btop·로그라이크 | 값-그라디언트 바(green→amber→red)+`--term-track`. rest: `REST ███████░░░ 1:12/2:00`, **텍스트를 바 위에 오버레이**, ✓시 자동시작 ±15s |
| **TermKeyHint** | lazygit · tui-design | view/mode별 재작성되는 3–5 힌트(`[⏎]log [r]rest [?]help`), 전체 레전드는 `?` 뒤. **터치 시 각 힌트=44px 탭버튼** |
| **TermBadge** | Bloomberg · Strong | 단일 bracket 토큰, 색=의미: `[PR]`gold `[e1RM 122]`cyan `[+5kg]`green `[FAIL]`red. bracket+text만(고정폭) |
| **TermLog** | 로그라이크 | 2–3줄 스크롤 이벤트로그(최신 하단), `‹time› ‹exercise› ‹wt×reps› ‹badge›` 색상코딩 = 라이브세션 "combat log" |
| **TermPrompt** | k9s · Textual | `^P`(+status bar `:` 어포던스)→scrim→**fuzzy-subsequence** 랭킹(`bp`→Bench Press). 전 화면·전 액션 도달 |
| **TermCursor** | VT · tui-design | amber `█`, ~500ms blink, active 입력/행에만. 선택 이동 0ms. `prefers-reduced-motion` gate |

**Mode-accent (lualine 트릭)**: status 좌측존+커서가 상태로 recolor — idle `-- NORMAL --`dim · logging amber · rest cyan · PR `-- PR! --`gold · fail red. 120ms 크로스페이드.

## 6.5 화면별 레이아웃 [GROUNDED] (~380px, ~36col)

```
┌──────────────────────────────────────┐
│ ● ● ●  ~/workout/log · ironlog  14:32 │ TitleBar
├──────────────────────────────────────┤
│ 1:home 2:log* 3:stats 4:cal 5:set     │ TabStrip (* = active)
├──────────────────────────────────────┤
│  ╭─ TODAY · Push A ── 1RM ~102.5 ─╮   │ ViewPane (box 패널, 탭별 스왑)
│  │ Bench Press                    │   │
│  │  1  100×5    ✓   2  100×5  ✓   │   │ 숫자 cyan·✓ green·★ gold
│  │  3   97.5  × ▮                 │   │ ▮ amber 커서(active 셀)
│  │  W   60     × 8  ·             │   │ W amber warmup·· ghost
│  ╰────────────────────────────────╯   │
│  ⏳ REST ███████░░░ 1:12/2:00 [−][+]   │ TermProgress(인라인, ✓시 자동)
├──────────────────────────────────────┤
│ -- LOGGING -- ~/log/bench  vol 4.2t   │ StatusBar(mode·path·rolling stat)
│ [j/k]move [⏎]log [r]rest [?]help       │ TermKeyHint(44px 탭버튼)
└──────────────────────────────────────┘
```

| 화면 | 탭 | 패턴 | 밀도 |
|---|---|---|---|
| home | `1:home` | Badge 타일+Sparkline | streak(gold)·주간목표 `▓▓▓░░`·resume·next |
| **workout log**(히어로) | `2:log` | TermTable+Progress+Log+mode | 운동=box패널, 세트행 7–8 visible(2운동 above fold), PREV는 dim, rest는 status mode슬롯, PR시 mode→gold. 슈퍼셋=좌 bracket 거터 |
| stats/1RM | `3:stats` | Sparkline(braille+block fb) | `[7D][1M][3M][6M][1Y][All]`(active=sel+cyan), braille 1RM ~40×6+dashed goal+gold `★` PR, key/value readout |
| calendar/history | `4:cal` | 날짜그룹 Table | 월그리드(done `█`green·rest `·`dim)+역시간 세션리스트 |
| settings | `5:set` | tree+reverse-video | `├──Theme ├──Units └──Account`, j/k, 선택=sel bg+amber 좌바 |

## 7. 인체공학 정책 [LOCKED] + 그라운딩 보강

- 1차 외형 우선 → 후처리 패스(출시 전 필수): TUI 외형 유지·**네이티브 input**·**effective 터치 ≥44px**·대비/포커스 a11y.
- **R4 짐 조명 가독성**: 다크는 어두운 방에서만 라이트보다 유리, 짐은 밝음. 헥스는 전부 AAA이나 — **load/rep 숫자를 dim에 넣지 말 것**(fg/cyan/gold), **CRT scanline/glow OFF 기본**(토글, 값에만 `text-shadow:0 0 2px`, flicker 금지), high-contrast 서브모드 제공, `opacity` dimming 금지.
- **R6 터치 vs 키보드 관용구**: `[j/k]`는 키보드 없으면 무의미 → **힌트=44px 탭버튼**, status bar `:`/`^P` 상시 어포던스, **탭 간 스와이프=j/k 대체**. footer에 `env(safe-area-inset-bottom)`(#415). 탭은 상단(authentic) 유지하되 active view를 status bar에 미러(#413/#417 바텀 머슬메모리 존중).

## 8. 배선 변경 대상 [LOCKED]

- 단일→이중 속성: `data-theme-preference` → `data-theme`+`data-mode`. CSS 3파일: [v2-tokens.css](../src/styles/v2-tokens.css)·`v2-overrides.css`·`tokens.css`
- pref 마이그레이션: 기존 `light/dark/system`→`modePref`, `themePref` 기본 `paper`(무손실)
- 배선: [workout-preferences.ts](../src/lib/settings/workout-preferences.ts)·`theme-preference-sync.tsx`·`layout.tsx` 부팅
- 설정 UI 2단(Theme+Appearance) · anti-FOUC [lib/theme.ts](../src/lib/theme.ts) theme×mode 매트릭스
- `lint:design`: paper 현행 유지, terminal 별도 룰(line 허용·`Term*` 강제·**R1 아이콘 예외**)

## 9. 단계별 롤아웃 [GROUNDED]

| Phase | 내용 | 검증 |
|---|---|---|
| **P0 Foundation** | 이중속성 리팩터 + `--term-*` 토큰 + Sarasa/Nerd self-host + `TermShell` 골격 + 설정 2단 + **실기기 글리프 프로토타입(R3)** | paper 무회귀 + terminal 토큰 + **실기기 박스/브레일 렌더 확인** |
| **P1 운동 로그**(히어로) | TermTable/Sparkline/Progress/KeyHint/Log + mode-accent | preview 스샷 |
| P2 stats/1RM | braille 차트(+block fb, 미세선 SVG) | |
| P3 calendar/history · P4 settings(섬 정리 동시) · P5 auth/onboarding(부팅 연출) | | |
| **PX 인체공학 패스** | 44px·네이티브 input·a11y·high-contrast 서브모드 | 모바일 사용성 회복 |

## 10. 그라운딩 리스크 [GROUNDED]

- **R1 아이콘룰 예외 (차단)** — §5. CLAUDE.md 하드룰과 충돌, 빌드 전 사인오프 필요.
- **R3 모바일 글리프 커버리지 (최고 기술 불확실성)** — braille(U+2800+)·일부 block이 iOS Safari/안드 webview에서 tofu/오정렬. self-host+tiered fallback(braille→block→ASCII), 미세선 SVG, **실기기 검증을 P0에서**(CSS 커밋 전).
- **R5 gold↔amber 근접** — 둘 다 warm-yellow. 휘도차(12 vs 9:1)로 구분되나 PR은 **mode flip+`★`/`[PR]`+bold**로 색 외 신호 동반.
- **R7 mono 밀도 손실(~30%)+5열 오버플로** — 셀에서 `kg` 제거(헤더 1회), ` x ` 대신 `×`, 고정 `ch` 폭, 운동 타이틀은 전폭 단독행. [[workout-notation]] 규칙: 히스토리 `Weight × Reps` vs 처방 `Sets × Reps @ Weight` — `×`/`@` 구분 유지.

**Non-goals**: paper 시각 변경 없음(전 Phase 수용기준) · terminal-light 보류 · Claude Design 비의존.

---
_상태: [GROUNDED] 2026-06-19 (5스트림 grounding 워크플로우). 메이크오어브레이크 = `TermTable` 세트행. 차단 결정 = R1(아이콘 예외). 최고 불확실성 = R3(실기기 글리프, P0 프로토타입). 다음 = R1 사인오프 → P0._
