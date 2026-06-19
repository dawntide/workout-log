"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useLocale } from "@/components/locale-provider";
import {
  TermLog,
  TermProgress,
  useRegisterTermFooter,
  type TermFooterRegistration,
  type TermLogEntry,
} from "@/components/v2/terminal";
import { SetRowFocusChainProvider } from "@/features/workout-log/model/use-set-row-focus-chain";
import { useRestTimer } from "@/features/workout-log/model/use-rest-timer";
import {
  completedSetsCountAtom,
  programEntryStateAtom,
  totalSetsCountAtom,
  visibleExercisesAtom,
  workflowStateAtom,
} from "@/features/workout-log/store/workout-log-atoms";
import type { ExerciseRowAction } from "@/features/workout-log/model/editor-actions";
import { TermTable } from "@/features/workout-log/ui/term-table";

// terminal(ironlog) 운동 로그 본문 뷰 — paper WorkoutLogStackedList의 terminal
// 대응(Step 1c). 동일 SetRowFocusChainProvider 안에서 TermTable을 mount해 focus
// chain을 공유한다(R-3). Step 2: 세션 SETS 진행바 + 세트 완료(✓) 시 자동 시작되는
// 휴식바(TermProgress + useRestTimer). 헤더·DateNav·로그·mode·저장(⏎)·3-way
// 게이트는 후속(Step 4~6). 이 뷰는 TermShell ViewPane 안에서 렌더되므로 외곽 패딩은 없음.
type Props = {
  onExerciseAction: (exerciseId: string, action: ExerciseRowAction) => void;
  onOpenAddExerciseSheet?: () => void;
  /** 셸 푸터 [⏎]log 키힌트가 호출할 저장(=paper requestSave). */
  onSave?: () => void;
};

// 세트 완료 시 시작하는 기본 휴식(초). 설정값이 생기면 그때 주입(현재 스키마 없음).
const DEFAULT_REST_SEC = 120;

export function WorkoutLogTuiView({
  onExerciseAction,
  onOpenAddExerciseSheet,
  onSave,
}: Props) {
  return (
    <SetRowFocusChainProvider>
      <TuiViewContent
        onExerciseAction={onExerciseAction}
        onOpenAddExerciseSheet={onOpenAddExerciseSheet}
        onSave={onSave}
      />
    </SetRowFocusChainProvider>
  );
}

function TuiViewContent({
  onExerciseAction,
  onOpenAddExerciseSheet,
  onSave,
}: Props) {
  const { locale } = useLocale();
  const visibleExercises = useAtomValue(visibleExercisesAtom);
  const completedSets = useAtomValue(completedSetsCountAtom);
  const totalSets = useAtomValue(totalSetsCountAtom);
  const exercises = useMemo(
    () => visibleExercises.filter((ex) => !ex.deleted),
    [visibleExercises],
  );

  const {
    running: restRunning,
    remainingSec,
    totalSec,
    start: startRest,
    adjust: adjustRest,
    stop: stopRest,
  } = useRestTimer();

  // 세트 완료(✓) = 세션 완료 세트 수 증가 → 휴식 자동 시작(client-only).
  const prevCompleted = useRef(completedSets);
  useEffect(() => {
    if (completedSets > prevCompleted.current) startRest(DEFAULT_REST_SEC);
    prevCompleted.current = completedSets;
  }, [completedSets, startRest]);

  const setsComplete = totalSets > 0 && completedSets >= totalSets;

  // ── combat log(ephemeral): 세트 완료(reps>0 신규) 감지 → ‹time› 운동명 wt×reps ✓ ──
  const programEntryState = useAtomValue(programEntryStateAtom);
  const [logEntries, setLogEntries] = useState<TermLogEntry[]>([]);
  const seenSetsRef = useRef<Set<string> | null>(null);
  const logSeqRef = useRef(0);
  useEffect(() => {
    // 입력 정착 후 캡처(디바운스) — reps를 한 글자씩 칠 때 중간값(×1)이 박히지 않도록.
    const captureId = window.setTimeout(() => {
      const current = new Map<
        string,
        { name: string; wt: number; reps: number }
      >();
      for (const ex of exercises) {
        const repsArr = ex.set.repsPerSet;
        for (let i = 0; i < repsArr.length; i++) {
          const reps =
            ex.source === "PROGRAM"
              ? Number(
                  (programEntryState[ex.id]?.repsInputs?.[i] ?? "").trim() || 0,
                )
              : (repsArr[i] ?? 0);
          if (Number.isFinite(reps) && reps > 0) {
            current.set(`${ex.id}:${i}`, {
              name: ex.exerciseName,
              wt: ex.set.weightKgPerSet?.[i] ?? 0,
              reps,
            });
          }
        }
      }
      // mount 시 기존 완료분은 seed만(스팸 방지), 로그 생성 안 함.
      if (seenSetsRef.current === null) {
        seenSetsRef.current = new Set(current.keys());
        return;
      }
      const seen = seenSetsRef.current;
      const additions: TermLogEntry[] = [];
      for (const [key, v] of current) {
        if (seen.has(key)) continue;
        seen.add(key);
        const d = new Date();
        const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        logSeqRef.current += 1;
        additions.push({
          id: `${key}#${logSeqRef.current}`,
          time,
          segments: [
            { text: v.name, tone: "fg" },
            // 맨몸(무게 0)은 무게 토큰 생략 → `×5`, 가중은 `100×5`.
            { text: v.wt > 0 ? `${v.wt}×${v.reps}` : `×${v.reps}`, tone: "info" },
            { text: "✓", tone: "success" },
          ],
        });
      }
      // 완료 해제(reps→0)된 키는 seen에서 제거 → 재완료 시 다시 로그.
      for (const key of Array.from(seen)) {
        if (!current.has(key)) seen.delete(key);
      }
      if (additions.length > 0) {
        setLogEntries((prev) => [...prev, ...additions].slice(-6));
      }
    }, 1200);
    return () => window.clearTimeout(captureId);
  }, [exercises, programEntryState]);

  // ── 셸 푸터 등록: mode-accent + keyHints([⏎]log=저장, [r]rest) + statusRight(vol) ──
  const workflowState = useAtomValue(workflowStateAtom);
  const volumeKg = useMemo(() => {
    let v = 0;
    for (const ex of exercises) {
      const repsArr = ex.set.repsPerSet;
      for (let i = 0; i < repsArr.length; i++) {
        const reps =
          ex.source === "PROGRAM"
            ? Number(
                (programEntryState[ex.id]?.repsInputs?.[i] ?? "").trim() || 0,
              )
            : (repsArr[i] ?? 0);
        const wt = ex.set.weightKgPerSet?.[i] ?? 0;
        if (reps > 0 && wt > 0) v += wt * reps;
      }
    }
    return v;
  }, [exercises, programEntryState]);

  const footer = useMemo<TermFooterRegistration>(() => {
    const m =
      workflowState === "saving"
        ? { text: "-- SAVING --", tone: "saving" as const }
        : restRunning
          ? { text: "-- REST --", tone: "rest" as const }
          : completedSets > 0
            ? { text: "-- LOGGING --", tone: "logging" as const }
            : { text: "-- NORMAL --", tone: "normal" as const };
    return {
      id: "workout-log",
      mode: m.text,
      modeTone: m.tone,
      statusRight: `${completedSets}/${totalSets} · vol ${(volumeKg / 1000).toFixed(1)}t`,
      keyHints: [
        { key: "⏎", label: "log", onPress: onSave },
        { key: "r", label: "rest", onPress: () => startRest(DEFAULT_REST_SEC) },
      ],
    };
  }, [
    workflowState,
    restRunning,
    completedSets,
    totalSets,
    volumeKg,
    onSave,
    startRest,
  ]);
  useRegisterTermFooter(footer);

  return (
    <section
      aria-label={locale === "ko" ? "운동 목록" : "Exercise list"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-3)",
      }}
    >
      {exercises.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--v2-s-3)",
            padding: "var(--v2-s-7) var(--v2-s-4)",
            textAlign: "center",
          }}
        >
          <p className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
            {locale === "ko" ? "기록할 운동이 없습니다." : "No exercises to log."}
          </p>
          {onOpenAddExerciseSheet ? (
            <AddExerciseAction onClick={onOpenAddExerciseSheet} locale={locale} />
          ) : null}
        </div>
      ) : (
        <>
          {exercises.map((ex) => (
            <TermTable
              key={ex.id}
              exerciseId={ex.id}
              onExerciseAction={onExerciseAction}
            />
          ))}
          {onOpenAddExerciseSheet ? (
            <AddExerciseAction onClick={onOpenAddExerciseSheet} locale={locale} />
          ) : null}
        </>
      )}

      {/* 세션 진행: SETS 완료 바(신규 데이터 0, 기존 atom 재사용) */}
      {totalSets > 0 ? (
        <TermProgress
          label="SETS"
          value={`${completedSets}/${totalSets}`}
          ratio={completedSets / totalSets}
          tone={setsComplete ? "success" : "accent"}
        />
      ) : null}

      {/* 휴식: ✓ 시 자동 시작, [−15]/[+15]/[skip] */}
      {restRunning ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-1)",
          }}
        >
          <TermProgress
            glyph="⏳"
            label="REST"
            value={`${fmtClock(remainingSec)} / ${fmtClock(totalSec)}`}
            ratio={totalSec > 0 ? remainingSec / totalSec : 0}
            tone="meter"
          />
          <div style={{ display: "flex", gap: "var(--v2-s-1)" }}>
            <RestButton label="−15" onClick={() => adjustRest(-15)} />
            <RestButton label="+15" onClick={() => adjustRest(15)} />
            <RestButton
              label={locale === "ko" ? "건너뛰기" : "skip"}
              onClick={stopRest}
            />
          </div>
        </div>
      ) : null}

      {/* combat log — 세션 한정 ephemeral, 최근 3줄 */}
      <TermLog entries={logEntries} max={3} />
    </section>
  );
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// 휴식 조정 = 44px 터치 버튼, 리터럴 bracket(터미널 keyhint 스타일).
function RestButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="v2-mono-label"
      style={{
        minHeight: "var(--v2-touch)",
        padding: "0 var(--v2-s-2)",
        background: "transparent",
        border: "none",
        color: "var(--term-cyan)",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      [{label}]
    </button>
  );
}

// 운동 추가 = 전폭 keyhint 버튼(box 프레임=boxShadow inset, border 금지, radius0).
function AddExerciseAction({
  onClick,
  locale,
}: {
  onClick: () => void;
  locale: "ko" | "en";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="v2-mono-label"
      style={{
        width: "100%",
        minHeight: "var(--v2-touch)",
        padding: "var(--v2-s-2) var(--v2-s-3)",
        background: "transparent",
        border: "none",
        boxShadow: "inset 0 0 0 1px var(--term-line-box)",
        color: "var(--term-cyan)",
        cursor: "pointer",
      }}
    >
      [+ {locale === "ko" ? "운동 추가" : "add exercise"}]
    </button>
  );
}
