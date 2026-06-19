# P1 Build Plan — 운동 로그 화면 TUI (ironlog)

> `/workout/log`을 `data-theme="terminal"`에서 풀 TUI로. **paper 무회귀가 prime 수용기준.** make-or-break = `TermTable` 세트 그리드.
> 출처: p1-workout-log-tui-plan 워크플로(실코드 매핑 4 + 종합). 북극성=[redesign-target.md](redesign-target.md).

## 1. 통합 전략 — "view는 분기, model은 공유"

**`useThemeSkin()` 반응형 훅 + 화면레벨 조건 렌더.** (DOM attribute 직접 읽기는 비반응적·SSR-blank이라 ✗)

- **스킨 소스**: 모듈 스토어(`lib/settings/theme-skin-store.ts`, pure) + `useSyncExternalStore` 훅. `applyThemeSkinToDocument`(workout-preferences.ts)가 DOM attribute set과 함께 store도 갱신 → **단일 write 경로**(boot·서버sync·설정토글 모두 lockstep). SSR=paper, 클라 mount 후 flip(구조 flash는 cold load만, 색은 boot가 선반영이라 색 flash 없음).
- **2개 분기 지점**:
  - **Chrome seam — `AppShell`** (app-shell.tsx:80–99): `skin==="terminal" && !hideNav` → `<TermShell ...>{children}</TermShell>` 반환(풀하이트 프레임이라 `V2BottomNav`·banner·wrapper 생략). else = 기존 paper 트리 **그대로**.
  - **Body seam — `WorkoutLogScreenContent`** (workout-log-screen.tsx:337): 컨트롤러·atom·핸들러는 분기 **위**에서 공유, `skin==="terminal" ? <WorkoutLogTuiView {...shared}/> : <기존 트리(무수정)>`. `JotaiProvider` 안쪽에서 분기(atom 접근).
- **paper 무회귀**: 기존 JSX를 **추출만**(rewrite 금지). 컨트롤러/atom 전부 presentation-agnostic이라 그대로 공유. **시트 5종 + Toast는 포크 안 함** — `[data-theme="terminal"] .mobile-bottom-sheet-*` CSS만 추가(bottom-sheet.tsx TS 무수정).
- **신규 파일**: `theme-skin-store.ts` · `use-theme-skin.ts` · `cell-input.tsx`(공유 추출) · `term-{table,progress,sparkline,badge,log}.tsx` · `term-keyhint-context.tsx` · `workout-log-tui-view.tsx`. **paper 측 수정**: `app-shell.tsx` + `workout-log-screen.tsx`에 분기만, 그 외 0.

## 2. Term* 컴포넌트 스펙

공통: 색 `--term-*`만, 치수 `var(--v2-*)`만, **`1px solid` 금지**(프레임=box-drawing 글리프 + `boxShadow: inset`), R1 글리프 OK, R7 한글은 full-width 헤더행만.

- **`TermTable`+`TermSetRow`** (make-or-break): box 프레임은 **CSS 그리드 뒤의 장식 텍스트**(글리프 안에 input 넣지 않음). 패널 타이틀행(한글 운동명+배지, 탭→PlanSheet 복제) → 컬럼헤더 `SET WT REPS RPE ✓`(단위는 헤더 1회) → N×row(기존 `ROW_GRID` 재사용, 셀=**공유 `CellInput` 재사용**=iOS draft/snap/blur 보존, focus ring amber). 상태 글리프 set-row:76–82 그대로(`✗/✓/▮/·`). **focus chain 재사용**(동일 `registerCell` 키, 같은 `SetRowFocusChainProvider` 안에서 mount). 44px 유지(글리프 밀집해도 hit=44px). 카드액션=44px keyhint 버튼.
  - P1 갭: warmup `W`는 스키마 없음→**P1 생략**(전부 working). PREV vs RPE→**RPE in-grid, PREV는 박스 위 dim 라인**. reps 소스 이원(`programEntryState` 스레드).
- **`TermProgress`**: btop식 그라디언트 바(green→amber→red), 텍스트 바 위 오버레이. P1: **sets/COMPLETE 바 완전배선**(신규데이터 0) + **rest 바 + 소형 `useRestTimer`**(start on ✓, ±15s, client-only).
- **`TermSparkline`**: block-eighths 인라인 미니(gold `★` PR). P1=미니만, **braille 40-col 차트는 P2**(stats 배선 회피).
- **`TermBadge`**: `[PR]`gold(예약)·`[e1RM]`cyan·`[+5kg]`green·`[FAIL]`red·tag amber. 리터럴 bracket, 박스/보더 없음. 한글배지→`[AUTO]` 등 Latin.
- **`TermLog`**: 2–3줄 combat log(`‹time› ‹ex› ‹wt×reps› ‹badge›`), 완료/저장 이벤트 파생, ephemeral. 한글 허용(박스 아님).
- **TermShell 확장**: `clock`(client tick) · `mode` accent(`workflowState`+완료+rest에서 파생: SAVING/LOGGING amber/REST cyan/PR! gold/NORMAL) · `TermKeyHintProvider`(`V2BottomDockProvider` 패턴 미러, `[⏎]log`=저장) · `statusRight`(rolling stat + 세션 path).

## 3. TUI 레이아웃 (~36col)

```
┌──────────────────────────────────────┐
│ ● ● ●  ~/workout/log · ironlog  14:32 │  TitleBar(clock tick)
│ 1:home 2:log* 3:stats 4:cal 5:set     │  TabStrip(tabForPath)
│ ‹ 06-19 ›            C2W1D3  [summary]│  DateNav + summary
│ ╭─ Push A ──────────── 1RM ~102.5 ─╮ │  plan-name(탭→PlanSheet, 한글 OK)
│ │ Bench Press           [AUTO][T1]  │ │
│ │ Rx 3×5 @ 100   prev 100×5 100×5   │ │  Prescription(@) + History(×)
│ │ SET   WT    REPS   RPE   ✓        │ │  헤더(단위 strip)
│ │  1    100    5      8    ✓         │ │  cyan 숫자·green ✓
│ │  3     97.5  ▮      -    ·         │ │  ▮ amber 커서·· ghost
│ │ [+set] [-set] [target] [memo]     │ │  44px 버튼
│ ╰───────────────────────────────────╯ │
│ ⏳ REST ███████░░░ 1:12/2:00 [−][+]    │  TermProgress(✓시 자동)
│ ‹14:30› bench 100×5 [done]            │  TermLog
│ -- LOGGING -- ~/log/bench  vol 4.2t   │  StatusBar(mode)
│ [⏎]log [r]rest [+]set [?]help          │  KeyHint(44px, [⏎]=저장)
└──────────────────────────────────────┘
```
3-way 게이트(screen:364): loaded→풀테이블 / blocked→헤더+notice박스(에디터 없음) / error·loading→터미널 notice·skeleton. BW배너→full-width amber notice행(한글 별행, R7). StickyActionBar 제거(저장=`[⏎]log`).

## 4. 구현 순서 (각 단계 paper 무회귀 + terminal preview 검증)

- **Step 0 (순차, 게이트)**: `theme-skin-store`+`useThemeSkin`, `applyThemeSkinToDocument`에 store 갱신 추가 / `TermKeyHintProvider` / **`AppShell` chrome 분기**(terminal=TermShell이 기존 body 감쌈). → paper 무수정 확인.
- **Step 1 (순차, make-or-break)**: 공유 `CellInput` 추출(paper byte-identical 확인) → `TermTable`+`TermSetRow`(atom/dispatch/focus-chain 공유) → `WorkoutLogTuiView`(테이블만) → `WorkoutLogScreenContent` 분기. **실기기 iOS 세트입력(draft/snap/blur·Enter-advance·44px) 검증.** 여기가 전부의 게이트.
- **Steps 2–5 (Step1 후 병렬 가능)**: TermProgress(sets→rest+timer) · TermBadge · TermLog · TermSparkline(미니).
- **Step 6 (순차)**: mode-accent·statusRight·clock·keyHints 배선 + 3-way 게이트 + BW notice + 시트 terminal CSS.
- **Step 7 (게이트)**: E2E + lint:design + typecheck(dev OFF) + paper 무회귀 사인오프.

## 5. 리스크

| # | 리스크 | 완화 |
|---|---|---|
| R-1 | 박스그리드 입력 인체공학(make-or-break) | 공유 `CellInput` **verbatim 재사용**, 프레임=글리프 레이어 뒤 실 CSS 그리드, Step1 실기기 검증 |
| R-3 | focus chain 깨짐 | 동일 `SetRowFocusChainProvider` 안 mount, 동일 키 |
| R-4 | 시트 터미널 렌더(포크=유지보수 폭증) | 포크 금지, `[data-theme="terminal"] .mobile-bottom-sheet-*` CSS만 |
| R-5 | Material→Unicode 아이콘 | **R1 예외 이미 승인**(CLAUDE.md). 네비는 *교체*라 remap 불요, terminal은 R3검증 글리프로 신규작성 |
| R-6 | 하이드레이션 flash | SSR=paper=첫 클라렌더(불일치 0), mount 후 flip. 색은 boot 선반영(색 flash 0), 구조 flash만 cold load |
| R-7 | 이중 바텀바 | terminal은 StickyActionBar 제거, 저장=`[⏎]log` 1개 footer |

**해소된 결정**: R1 ✓승인됨 · rest-timer=소형 hook 탑재 · sparkline=P1 미니/braille는 P2 · RPE in-grid · warmup 생략(P1).
