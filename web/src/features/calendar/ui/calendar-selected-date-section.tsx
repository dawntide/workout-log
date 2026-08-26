"use client";

import { memo, useCallback, useRef } from "react";
import {
  V2Card,
  V2Chip,
  V2EmptyState,
  V2Hairline,
  V2PrimaryBtn,
  V2SecondaryBtn,
} from "@/components/v2/primitives";
import { formatCalendarDay, formatVolume } from "@/features/calendar/lib/format";
import type {
  CalendarExercisePreviewItem,
  CalendarRecentGeneratedSession,
  CalendarWorkoutLogForDate,
} from "@/features/calendar/model/types";

type CalendarMainCopy = {
  noPlanSelected: string;
  completed: string;
  sets: string;
  volume: string;
  editLog: string;
  blockedTitle: string;
  blockedDescription: string;
  blockedHasLaterLogs: string;
  beforeStart: string;
  startLogging: string;
  noSession: string;
  canLogImmediately: string;
  plannedDescription: string;
  immediateDescription: string;
  moveDate: string;
  deleteLog: string;
  deleteLogConfirm: string;
  moveDateBlockedTitle: string;
  moveDateBlockedDescription: string;
};

type LoggedSummary = {
  exercises: CalendarExercisePreviewItem[];
  totalSets: number;
  totalVolume: number;
};

type CalendarSelectedDateSectionProps = {
  locale: "ko" | "en";
  copy: CalendarMainCopy;
  selectedDate: string;
  today: string;
  selectedPlanName: string | null;
  error: string | null;
  isLoading: boolean;
  currentSelectedLog: CalendarWorkoutLogForDate | null;
  loggedSummary: LoggedSummary;
  workoutHref: string;
  selectedSession: CalendarRecentGeneratedSession | null;
  selectedSessionWDLabel: string | null;
  /** REF5 decision identity (mode · SQ prescription · focus) — REF5 has no W/D label. */
  ref5SessionLabel: string | null;
  plannedExercises: CalendarExercisePreviewItem[];
  isPastDateCreationBlocked: boolean;
  selectedCtx: { planned: boolean } | null;
  nextSessionLabel: string | null;
  loggedDayLabel: string | null;
  onMoveDateCommit: (newDate: string) => void;
  onDeleteLog: () => void;
};

export const CalendarSelectedDateSection = memo(
  function CalendarSelectedDateSection({
    locale,
    copy,
    selectedDate,
    today,
    selectedPlanName,
    error,
    isLoading,
    currentSelectedLog,
    loggedSummary,
    workoutHref,
    selectedSession,
    selectedSessionWDLabel,
    ref5SessionLabel,
    plannedExercises,
    isPastDateCreationBlocked,
    selectedCtx,
    nextSessionLabel,
    loggedDayLabel,
    onMoveDateCommit,
    onDeleteLog,
  }: CalendarSelectedDateSectionProps) {
    const moveDatePendingValueRef = useRef(selectedDate);

    const handleMoveDateFocus = useCallback(() => {
      moveDatePendingValueRef.current = selectedDate;
    }, [selectedDate]);

    const handleMoveDateChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        moveDatePendingValueRef.current = event.currentTarget.value;
      },
      [],
    );

    const handleMoveDateBlur = useCallback(
      (event: React.FocusEvent<HTMLInputElement>) => {
        const nextDate =
          moveDatePendingValueRef.current || event.currentTarget.value;
        // 비교 기준은 **선택된 날짜**다. 예전에는 "포커스 시점의 입력 값"을 기준으로
        // 삼았는데, 값이 프로그램으로 바뀌면 브라우저가 date 입력의 focus를 한 번 더
        // 발화해 기준이 **새 값으로 덮이고**, 그러면 nextDate === previousDate가 되어
        // 이동이 조용히 취소됐다(E2E 계측으로 확인). 자동 완성·보조기술도 같은
        // 경로다. `selectedDate`는 언제나 진실이므로 기준으로 삼기에 맞다.
        moveDatePendingValueRef.current = selectedDate;
        if (!nextDate || nextDate === selectedDate) return;
        onMoveDateCommit(nextDate);
      },
      [onMoveDateCommit, selectedDate],
    );

    const isToday = selectedDate === today;
    const headerLabel = isToday
      ? locale === "ko"
        ? "오늘"
        : "Today"
      : formatCalendarDay(selectedDate, locale);

    return (
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--v2-s-3)",
          }}
        >
          <h2 className="v2-h3">{headerLabel}</h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--v2-s-2)",
            }}
          >
            {isToday ? (
              <V2Chip tone="accent">
                {locale === "ko" ? "오늘" : "Today"}
              </V2Chip>
            ) : null}
          </div>
        </div>

        {error ? (
          <p
            className="v2-small"
            style={{
              color: "var(--v2-c-danger)",
              marginBottom: "var(--v2-s-2)",
            }}
          >
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <div
            style={{
              display: "flex",
              gap: "var(--v2-s-1)",
              justifyContent: "center",
              padding: "var(--v2-s-7)",
            }}
          >
            <Dot />
            <Dot />
            <Dot />
          </div>
        ) : !selectedPlanName ? (
          <V2EmptyState icon="calendar_month" title={copy.noPlanSelected} />
        ) : currentSelectedLog ? (
          <V2Card tone="paper" padding="var(--v2-s-6)" radius="var(--v2-r-4)">
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: "var(--v2-s-4)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--v2-s-3)",
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background:
                      "color-mix(in srgb, var(--v2-c-success) 14%, var(--v2-paper))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "var(--v2-t-20)",
                      color: "var(--v2-c-success)",
                      fontVariationSettings: "'FILL' 1",
                    }}
                    aria-hidden
                  >
                    check_circle
                  </span>
                </span>
                <div>
                  <p
                    className="v2-h3"
                    style={{ fontSize: "var(--v2-t-body)", fontWeight: 700 }}
                  >
                    {loggedDayLabel ?? ref5SessionLabel ?? copy.completed}
                  </p>
                  <p className="v2-eyebrow" style={{ marginTop: 2 }}>
                    {copy.completed}
                  </p>
                </div>
              </div>
            </div>

            {loggedSummary.exercises.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--v2-s-2)",
                  marginBottom: "var(--v2-s-4)",
                }}
              >
                {loggedSummary.exercises.map((exercise) => (
                  <div
                    key={exercise.name}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      className="v2-body"
                      style={{ fontSize: "var(--v2-t-14)", fontWeight: 700 }}
                    >
                      {exercise.name}
                    </span>
                    <span
                      className="v2-small"
                      style={{
                        color: "var(--v2-ink-3)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {exercise.summary}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <V2Hairline />
            <div
              style={{
                display: "flex",
                gap: "var(--v2-s-7)",
                paddingTop: "var(--v2-s-4)",
                marginBottom: "var(--v2-s-4)",
              }}
            >
              <Metric label={copy.sets} value={String(loggedSummary.totalSets)} />
              <Metric
                label={copy.volume}
                value={formatVolume(loggedSummary.totalVolume)}
              />
            </div>

            <V2PrimaryBtn
              as="a"
              href={workoutHref}
              icon="chevron_right"
              full
              style={{ marginBottom: "var(--v2-s-2)" }}
            >
              {copy.editLog}
            </V2PrimaryBtn>

            <div
              style={{
                display: "flex",
                gap: "var(--v2-s-2)",
              }}
            >
              <label
                className="v2-pressable v2-font-display"
                style={{
                  flex: 1,
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--v2-s-2)",
                  padding: "var(--v2-s-3) var(--v2-s-4)",
                  borderRadius: "var(--v2-r-2)",
                  background: "var(--v2-paper-2)",
                  color: "var(--v2-ink)",
                  cursor: "pointer",
                  fontSize: "var(--v2-t-small)",
                  fontWeight: 700,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "var(--v2-t-16)" }}
                  aria-hidden
                >
                  calendar_clock
                </span>
                {copy.moveDate}
                <input
                  key={selectedDate}
                  type="date"
                  defaultValue={selectedDate}
                  onFocus={handleMoveDateFocus}
                  onChange={handleMoveDateChange}
                  onBlur={handleMoveDateBlur}
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: 0,
                    width: "100%",
                    height: "100%",
                    cursor: "pointer",
                  }}
                />
              </label>
              <V2SecondaryBtn
                tone="danger"
                icon="delete"
                onClick={onDeleteLog}
                full
                style={{ flex: 1 }}
              >
                {copy.deleteLog}
              </V2SecondaryBtn>
            </div>
          </V2Card>
        ) : selectedSession ? (
          isPastDateCreationBlocked ? (
            <V2EmptyState
              icon="block"
              title={copy.blockedTitle}
              description={copy.blockedHasLaterLogs}
            />
          ) : (
            <V2Card tone="paper" padding="var(--v2-s-6)" radius="var(--v2-r-4)">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom:
                    plannedExercises.length > 0 ? "var(--v2-s-4)" : 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--v2-s-3)",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "var(--v2-accent-weak)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: "var(--v2-t-20)",
                        color: "var(--v2-accent)",
                      }}
                      aria-hidden
                    >
                      fitness_center
                    </span>
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p
                      className="v2-h3"
                      style={{
                        fontSize: "var(--v2-t-body)",
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {selectedSessionWDLabel ?? ref5SessionLabel ?? copy.beforeStart}
                    </p>
                    <p className="v2-eyebrow" style={{ marginTop: 2 }}>
                      {copy.beforeStart}
                    </p>
                  </div>
                </div>
                <V2PrimaryBtn
                  as="a"
                  href={workoutHref}
                  style={{
                    marginLeft: "var(--v2-s-3)",
                    padding: "var(--v2-s-3) var(--v2-s-5)",
                    minHeight: "var(--v2-s-8)",
                    fontSize: "var(--v2-t-14)",
                  }}
                >
                  {copy.startLogging}
                </V2PrimaryBtn>
              </div>

              {plannedExercises.length > 0 ? (
                <>
                  <V2Hairline />
                  <div
                    style={{
                      paddingTop: "var(--v2-s-4)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--v2-s-2)",
                    }}
                  >
                    {plannedExercises
                      .filter((exercise) => exercise.role === "MAIN")
                      .map((exercise) => (
                        <ExerciseLine key={exercise.name} exercise={exercise} />
                      ))}
                    {plannedExercises.some((ex) => ex.role !== "MAIN") ? (
                      <>
                        <V2Hairline />
                        <div
                          style={{
                            paddingTop: "var(--v2-s-2)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "var(--v2-s-1)",
                          }}
                        >
                          {plannedExercises
                            .filter((exercise) => exercise.role !== "MAIN")
                            .map((exercise) => (
                              <ExerciseLine
                                key={exercise.name}
                                exercise={exercise}
                                muted
                              />
                            ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
            </V2Card>
          )
        ) : isPastDateCreationBlocked ? (
          <V2EmptyState
            icon="block"
            title={copy.blockedTitle}
            description={copy.blockedHasLaterLogs}
          />
        ) : (
          <V2EmptyState
            icon="fitness_center"
            title={
              selectedCtx?.planned
                ? (nextSessionLabel ?? copy.noSession)
                : copy.canLogImmediately
            }
            description={
              selectedCtx?.planned
                ? copy.plannedDescription
                : copy.immediateDescription
            }
            action={
              <V2PrimaryBtn
                as="a"
                href={workoutHref}
                icon="add"
                style={{
                  minHeight: "var(--v2-s-8)",
                  padding: "var(--v2-s-3) var(--v2-s-5)",
                  borderRadius: "var(--v2-r-2)",
                  fontSize: "var(--v2-t-small)",
                }}
              >
                {copy.startLogging}
              </V2PrimaryBtn>
            }
          />
        )}
      </section>
    );
  },
);

function Dot() {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "var(--v2-paper-4)",
        display: "inline-block",
      }}
    />
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
      <span className="v2-eyebrow">{label}</span>
      <span className="v2-num-sm" style={{ color: "var(--v2-ink)" }}>
        {value}
      </span>
    </div>
  );
}

function ExerciseLine({
  exercise,
  muted = false,
}: {
  exercise: CalendarExercisePreviewItem;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span
        className={muted ? "v2-small" : "v2-body"}
        style={{
          fontSize: muted ? 13 : 14,
          fontWeight: muted ? 400 : 700,
          color: muted ? "var(--v2-ink-2)" : "var(--v2-ink)",
        }}
      >
        {exercise.name}
      </span>
      <span
        className="v2-small"
        style={{
          color: muted ? "var(--v2-ink-3)" : "var(--v2-ink-3)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {exercise.summary}
      </span>
    </div>
  );
}
