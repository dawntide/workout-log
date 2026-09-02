"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  V2Card,
  V2Chip,
  V2Hairline,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2Switch,
  V2TextField,
} from "@/components/v2/primitives";
import { errorMessage } from "@/lib/error-message";
import { apiPost, isAbortError } from "@/shared/api";
import type { GeneratedSessionLike } from "@/entities/workout-record";
import { REF5_PROTOCOL_VERSION } from "@workout/core/program-engine/ref5-protocol-version";

export type Ref5SessionStartValues = {
  protocolVersion: typeof REF5_PROTOCOL_VERSION;
  actualStartAt: string;
  bodyweightKg: number;
  manualMicro: boolean;
  /** §7.6 — OAP 슬롯을 v1.3 PULL 볼륨으로 되돌린다. BP 집중 세션에서만 의미가 있다. */
  oapSlotReverted: boolean;
  startEventId: string;
};

export type Ref5GeneratePayload = {
  preview: boolean;
  ref5: Ref5SessionStartValues;
};

type Ref5SessionStartPanelProps = {
  planId: string;
  planName: string;
  dateKey: string;
  locale: "ko" | "en";
  defaultBodyweightKg: number | null;
  onStarted: (session: GeneratedSessionLike, options?: { resumed?: boolean }) => void;
};

type PreviewExercise = {
  name: string;
  prescription: string;
};

/** §9 하드 SQ 게이트의 서버 판정과 그 근거(직전 하드 시작·168시간 창). */
export type PreviewHardGate = {
  allowed: boolean;
  lastStartAt: string | null;
  startsIn168Hours: number | null;
};

type PreviewSummary = {
  mode: string;
  squat: string | null;
  focus: string | null;
  reasons: string[];
  exercises: PreviewExercise[];
  setCount: number;
  hard: PreviewHardGate | null;
  actualStartAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
): string | null {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function firstBoolean(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
): boolean | null {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      if (typeof source[key] === "boolean") return source[key] as boolean;
    }
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      const record = asRecord(entry);
      return firstString([record], ["label", "reason", "code"]) ?? "";
    })
    .filter(Boolean);
}

function numberValue(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function formatWeight(value: number | null) {
  return value === null ? null : `${Number(value.toFixed(2))} kg`;
}

function readHardGate(
  sources: Array<Record<string, unknown> | null>,
): PreviewHardGate | null {
  for (const source of sources) {
    const hard = asRecord(source?.hard);
    if (!hard || typeof hard.allowed !== "boolean") continue;
    return {
      allowed: hard.allowed,
      lastStartAt: firstString([hard], ["lastStartAt"]),
      startsIn168Hours: numberValue(hard, ["startsIn168Hours"]),
    };
  }
  return null;
}

function exercisePrescription(exercise: Record<string, unknown>): {
  text: string;
  setCount: number;
} {
  const sets = Array.isArray(exercise.sets)
    ? exercise.sets.map(asRecord).filter((set): set is Record<string, unknown> => Boolean(set))
    : [];
  if (sets.length === 0) return { text: "—", setCount: 0 };

  const reps = sets.map((set) => numberValue(set, ["plannedReps", "reps", "targetReps"]));
  const weights = sets.map((set) =>
    numberValue(set, ["externalLoadKg", "targetWeightKg", "weightKg", "plannedWeightKg"]),
  );
  const totalLoads = sets.map((set) => numberValue(set, ["totalLoadKg"]));
  const sameReps = reps.every((value) => value === reps[0]);
  const sameWeight = weights.every((value) => value === weights[0]);
  const sameTotalLoad = totalLoads.every((value) => value === totalLoads[0]);
  const totalLoadSuffix =
    sameTotalLoad &&
    totalLoads[0] !== null &&
    totalLoads[0] !== weights[0]
      ? ` (${formatWeight(totalLoads[0])} total)`
      : "";
  if (sameReps && sameWeight && sameTotalLoad) {
    return {
      text: [
        `${sets.length} × ${reps[0] ?? "—"}`,
        weights[0] === null
          ? null
          : `${formatWeight(weights[0])}${totalLoadSuffix}`,
      ]
        .filter(Boolean)
        .join(" · "),
      setCount: sets.length,
    };
  }

  return {
    text: sets
      .map((set, index) => {
        const rep = numberValue(set, ["plannedReps", "reps", "targetReps"]);
        const weight = numberValue(set, ["externalLoadKg", "targetWeightKg", "weightKg", "plannedWeightKg"]);
        const totalLoad = numberValue(set, ["totalLoadKg"]);
        const total = totalLoad !== null && totalLoad !== weight
          ? ` (${formatWeight(totalLoad)} total)`
          : "";
        return `S${index + 1} ${rep ?? "—"} reps${weight === null ? "" : ` @ ${formatWeight(weight)}${total}`}`;
      })
      .join(" · "),
    setCount: sets.length,
  };
}

export function summarizeRef5Preview(session: GeneratedSessionLike): PreviewSummary {
  const snapshot = asRecord(session.snapshot) ?? {};
  const ref5 = asRecord(snapshot.ref5);
  const decision = asRecord(ref5?.decision) ?? asRecord(snapshot.decision);
  const sources = [decision, ref5, snapshot];
  const isMicro = firstBoolean(sources, ["isMicro", "micro"]);
  const mode =
    firstString(sources, ["sessionMode", "mode", "sessionType", "kind"]) ??
    (isMicro ? "MICRO" : "NORMAL");
  const squat = firstString(sources, ["squatVariant", "squatDay", "squatPrescription"]);
  const focus = firstString(sources, ["focus", "focusLift", "queueFocus"]);

  const reasons = [
    ...stringArray(decision?.reasons),
    ...stringArray(decision?.microReasons),
    ...stringArray(ref5?.reasons),
    ...stringArray(ref5?.microReasons),
    ...stringArray(snapshot.microReasons),
  ].filter((value, index, values) => values.indexOf(value) === index);

  const exerciseRows = Array.isArray(snapshot.exercises) ? snapshot.exercises : [];
  let setCount = 0;
  const exercises = exerciseRows
    .map(asRecord)
    .filter((exercise): exercise is Record<string, unknown> => Boolean(exercise))
    .map((exercise) => {
      const prescription = exercisePrescription(exercise);
      setCount += prescription.setCount;
      return {
        name:
          firstString([exercise], ["exerciseName", "name", "lift", "exerciseId"]) ??
          "Exercise",
        prescription: prescription.text,
      };
    });
  // 엔진이 이미 계산한 총 작업세트가 정본이다(§7.3). 운동 행을 합산하면 OAP 좌/우가
  // 두 번 세어져 페어 회계와 어긋난다 — 화면이 10세트를 12로 보이게 만든다.
  const frozenTotal = Number(snapshot.totalWorkingSets);
  return {
    mode,
    squat,
    focus,
    reasons,
    exercises,
    setCount: Number.isFinite(frozenTotal) && frozenTotal > 0 ? frozenTotal : setCount,
    hard: readHardGate([decision, ref5, snapshot]),
    actualStartAt: firstString([ref5, snapshot, decision], ["actualStartAt"]),
  };
}

const HOUR_MS = 60 * 60 * 1000;
const HARD_ELAPSED_HOURS = 48;
const HARD_WINDOW_HOURS = 168;
const HARD_WINDOW_LIMIT = 2;

/**
 * 게이트 판정은 언제나 서버 값(`allowed`)이다. 여기서 파생하는 경과·잔여 시간은
 * §9가 UI에 허용한 "친절한 표시"일 뿐이며 엔진 경계(48h/168h)를 재정의하지 않는다.
 */
export type Ref5HardGateView = {
  allowed: boolean;
  micro: boolean;
  lastStartAt: string | null;
  elapsedMs: number | null;
  /** 48시간까지 남은 시간. 이미 충족했거나 계산할 수 없으면 null. */
  remainingMs: number | null;
  /** 48시간 경과 조건. 계산 근거가 없으면 null(미상). */
  elapsedMet: boolean | null;
  startsIn168Hours: number | null;
  /** 168시간 창 밀도 조건. 서버 카운트가 없으면 null(미상). */
  densityMet: boolean | null;
};

export function describeRef5HardGate(summary: {
  mode: string;
  hard: PreviewHardGate | null;
  actualStartAt: string | null;
}): Ref5HardGateView | null {
  const hard = summary.hard;
  if (!hard) return null;

  const startedAt = summary.actualStartAt ? Date.parse(summary.actualStartAt) : NaN;
  const lastAt = hard.lastStartAt ? Date.parse(hard.lastStartAt) : NaN;
  const elapsedMs =
    Number.isFinite(startedAt) && Number.isFinite(lastAt) ? startedAt - lastAt : null;
  const elapsedMet =
    hard.lastStartAt === null
      ? true // 직전 하드가 없으면 시간 조건은 자동 충족이고 최초 하드는 H3다.
      : elapsedMs === null
        ? null
        : elapsedMs >= HARD_ELAPSED_HOURS * HOUR_MS;

  return {
    allowed: hard.allowed,
    micro: summary.mode.toUpperCase().includes("MICRO"),
    lastStartAt: hard.lastStartAt,
    elapsedMs,
    remainingMs:
      elapsedMs !== null && elapsedMs < HARD_ELAPSED_HOURS * HOUR_MS
        ? HARD_ELAPSED_HOURS * HOUR_MS - elapsedMs
        : null,
    elapsedMet,
    startsIn168Hours: hard.startsIn168Hours,
    densityMet:
      hard.startsIn168Hours === null ? null : hard.startsIn168Hours < HARD_WINDOW_LIMIT,
  };
}

export function formatRef5Duration(ms: number, locale: "ko" | "en") {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return locale === "ko" ? `${minutes}분` : `${minutes}m`;
  // 딱 떨어지는 간격에서 "0분"은 군더더기라 폭만 잡아먹는다.
  if (minutes === 0) return locale === "ko" ? `${hours}시간` : `${hours}h`;
  return locale === "ko" ? `${hours}시간 ${minutes}분` : `${hours}h ${minutes}m`;
}

function formatStartClock(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function buildRef5GeneratePayload(
  preview: boolean,
  values: Ref5SessionStartValues,
): Ref5GeneratePayload {
  return { preview, ref5: values };
}

function localDateTimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function stableEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ref5-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toStartValues(input: {
  localStartAt: string;
  bodyweightText: string;
  manualMicro: boolean;
  oapSlotReverted: boolean;
  startEventId: string;
}): Ref5SessionStartValues | null {
  const start = new Date(input.localStartAt);
  const bodyweightKg = Number(input.bodyweightText);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(bodyweightKg) || bodyweightKg <= 0) {
    return null;
  }
  return {
    protocolVersion: REF5_PROTOCOL_VERSION,
    actualStartAt: start.toISOString(),
    bodyweightKg,
    manualMicro: input.manualMicro,
    oapSlotReverted: input.oapSlotReverted,
    startEventId: input.startEventId,
  };
}

function GateRow({ label, value }: { label: string; value: string }) {
  return (
    // 좁은 폭에서는 값이 라벨 옆에서 쪼개지는 대신 통째로 아랫줄로 내려간다.
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0 var(--v2-s-3)" }}>
      <span className="v2-small" style={{ color: "var(--v2-ink-3)", flexShrink: 0 }}>
        {label}
      </span>
      <span
        className="v2-small"
        style={{ color: "var(--v2-ink-2)", marginLeft: "auto", textAlign: "right" }}
      >
        {value}
      </span>
    </div>
  );
}

function GateCondition({
  rule,
  detail,
  met,
  locale,
}: {
  rule: string;
  detail: string | null;
  met: boolean | null;
  locale: "ko" | "en";
}) {
  const tone = met === null ? "neutral" : met ? "success" : "warning";
  const label =
    met === null
      ? locale === "ko" ? "미상" : "Unknown"
      : met
        ? locale === "ko" ? "충족" : "Met"
        : locale === "ko" ? "미충족" : "Not met";
  return (
    <div style={{ display: "grid", gap: "var(--v2-s-1)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--v2-s-2)",
        }}
      >
        <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
          {rule}
        </span>
        {/* 좁은 폭에서 긴 규칙 문구가 칩을 눌러 찌그러뜨리지 않게 고정한다. */}
        <span style={{ flexShrink: 0 }}>
          <V2Chip tone={tone}>{label}</V2Chip>
        </span>
      </div>
      {detail ? (
        <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
          {detail}
        </span>
      ) : null}
    </div>
  );
}

/**
 * §9 하드 SQ 게이트를 근거와 함께 보여준다. 판정 자체는 서버가 내린 것을 그대로
 * 표시하고, 경과·잔여 시간만 UI에서 계산해 덧붙인다(§9의 UI 허용 범위).
 */
function Ref5HardGateBlock({
  gate,
  locale,
}: {
  gate: Ref5HardGateView;
  locale: "ko" | "en";
}) {
  const ko = locale === "ko";
  const clock = gate.lastStartAt ? formatStartClock(gate.lastStartAt) : null;
  const elapsed = gate.elapsedMs === null ? null : formatRef5Duration(gate.elapsedMs, locale);
  const remaining =
    gate.remainingMs === null ? null : formatRef5Duration(gate.remainingMs, locale);

  const lastStartValue =
    gate.lastStartAt === null
      ? ko
        ? "기록 없음 · 최초 하드는 H3"
        : "None yet · the first hard is H3"
      : [clock ?? gate.lastStartAt, elapsed ? (ko ? `${elapsed} 전` : `${elapsed} ago`) : null]
          .filter(Boolean)
          .join(" · ");

  const elapsedDetail =
    gate.lastStartAt === null
      ? ko
        ? "직전 하드 SQ 기록이 없어 자동 충족"
        : "No prior hard SQ start, so this is met automatically"
      : elapsed === null
        ? null
        : remaining
          ? ko
            ? `${elapsed} 경과 · ${remaining} 남음`
            : `${elapsed} elapsed · ${remaining} to go`
          : ko
            ? `${elapsed} 경과`
            : `${elapsed} elapsed`;

  const densityDetail =
    gate.startsIn168Hours === null
      ? null
      : ko
        ? `현재 ${gate.startsIn168Hours}회`
        : `${gate.startsIn168Hours} so far`;

  return (
    <div style={{ display: "grid", gap: "var(--v2-s-3)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--v2-s-2)",
        }}
      >
        <p className="v2-label" style={{ margin: 0 }}>
          {ko ? "SQ 하드 판정" : "SQ hard gate"}
        </p>
        <span style={{ flexShrink: 0 }}>
          <V2Chip tone={gate.allowed ? "success" : "neutral"}>
            {gate.allowed ? (ko ? "하드 허용" : "Hard allowed") : ko ? "볼륨 V" : "Volume V"}
          </V2Chip>
        </span>
      </div>

      <GateRow label={ko ? "직전 하드 SQ 시작" : "Last hard SQ start"} value={lastStartValue} />
      <GateRow
        label={ko ? `${HARD_WINDOW_HOURS}시간 창 하드 시작` : `Hard starts in the ${HARD_WINDOW_HOURS} h window`}
        value={
          gate.startsIn168Hours === null
            ? "—"
            : ko
              ? `${gate.startsIn168Hours}회 · 기준 ${HARD_WINDOW_LIMIT}회 미만`
              : `${gate.startsIn168Hours} · limit is fewer than ${HARD_WINDOW_LIMIT}`
        }
      />

      <V2Hairline />

      <p className="v2-label" style={{ margin: 0 }}>
        {ko ? "판정 기준" : "Gate rules"}
      </p>
      <GateCondition
        locale={locale}
        met={gate.elapsedMet}
        rule={
          ko
            ? `① 마지막 하드 SQ 시작 후 ${HARD_ELAPSED_HOURS}시간 이상 경과`
            : `1. At least ${HARD_ELAPSED_HOURS} h since the last hard SQ start`
        }
        detail={elapsedDetail}
      />
      <GateCondition
        locale={locale}
        met={gate.densityMet}
        rule={
          ko
            ? `② 직전 ${HARD_WINDOW_HOURS}시간(7일) 안 하드 시작 ${HARD_WINDOW_LIMIT}회 미만`
            : `2. Fewer than ${HARD_WINDOW_LIMIT} hard starts in the open ${HARD_WINDOW_HOURS} h window`
        }
        detail={densityDetail}
      />
      <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
        {gate.micro
          ? ko
            ? "마이크로 세션은 두 조건과 무관하게 항상 V 2×5입니다."
            : "Micro sessions are always V 2×5 regardless of both rules."
          : ko
            ? "두 조건을 모두 만족하면 H3 ↔ H2 차례를 쓰고, 아니면 V 3×5입니다."
            : "Both rules met uses the H3 ↔ H2 turn; otherwise it is V 3×5."}
      </p>
    </div>
  );
}

export function Ref5SessionStartPanel({
  planId,
  planName,
  dateKey,
  locale,
  defaultBodyweightKg,
  onStarted,
}: Ref5SessionStartPanelProps) {
  const [localStartAt, setLocalStartAt] = useState(localDateTimeValue);
  const [bodyweightText, setBodyweightText] = useState(() =>
    defaultBodyweightKg && defaultBodyweightKg > 0 ? String(defaultBodyweightKg) : "",
  );
  const [manualMicro, setManualMicro] = useState(false);
  const [oapSlotReverted, setOapSlotReverted] = useState(false);
  const [startEventId] = useState(stableEventId);
  const [previewSession, setPreviewSession] = useState<GeneratedSessionLike | null>(null);
  const [previewSignature, setPreviewSignature] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"preview" | "start" | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => requestAbortRef.current?.abort();
  }, []);

  const values = useMemo(
    () =>
      toStartValues({
        localStartAt,
        bodyweightText,
        manualMicro,
        oapSlotReverted,
        startEventId,
      }),
    [bodyweightText, localStartAt, manualMicro, oapSlotReverted, startEventId],
  );
  const valuesSignature = values ? JSON.stringify(values) : null;
  const visiblePreview =
    previewSession && previewSignature === valuesSignature ? previewSession : null;
  const preview = visiblePreview ? summarizeRef5Preview(visiblePreview) : null;
  const hardGate = preview ? describeRef5HardGate(preview) : null;
  // 되돌리기는 BP 집중 차례의 정상 세션에만 의미가 있다(§7.6). 어느 차례인지는
  // 미리보기가 알려준다. 서명이 어긋난 미리보기까지 보는 것은 의도다 — 토글을 켜면
  // 서명이 달라지는데, visiblePreview로 판단하면 토글이 스스로를 숨겨 되돌릴 수 없다.
  const lastPreviewFocus = previewSession
    ? (summarizeRef5Preview(previewSession).focus ?? "")
    : "";
  const showOapRevert = oapSlotReverted || lastPreviewFocus.toUpperCase().includes("BP");

  async function requestGeneration(previewOnly: boolean) {
    if (!values) {
      setRequestError(
        locale === "ko"
          ? "정확한 시작 시각과 0보다 큰 오늘의 체중을 입력해 주세요."
          : "Enter an exact start time and today's bodyweight above zero.",
      );
      return;
    }

    setPendingAction(previewOnly ? "preview" : "start");
    setRequestError(null);
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    try {
      const response = await apiPost<{ session: GeneratedSessionLike; resumed?: boolean }>(
        `/api/plans/${encodeURIComponent(planId)}/generate`,
        buildRef5GeneratePayload(previewOnly, values),
        { invalidateCache: !previewOnly, signal: controller.signal },
      );
      if (!response.session) throw new Error("The server did not return a session.");
      if (previewOnly) {
        setPreviewSession(response.session);
        setPreviewSignature(JSON.stringify(values));
      } else {
        onStarted(response.session, { resumed: response.resumed === true });
      }
    } catch (error) {
      if (isAbortError(error)) return;
      setRequestError(
        errorMessage(error) ??
          (locale === "ko"
            ? "REF5 세션을 준비하지 못했습니다."
            : "Could not prepare the REF5 session."),
      );
    } finally {
      if (requestAbortRef.current === controller) {
        requestAbortRef.current = null;
        setPendingAction(null);
      }
    }
  }

  return (
    <V2Card style={{ display: "grid", gap: "var(--v2-s-5)" }}>
      <header style={{ display: "grid", gap: "var(--v2-s-1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--v2-s-2)" }}>
          <h2 className="v2-h2" style={{ margin: 0 }}>
            {locale === "ko" ? "REF5 세션 결정" : "REF5 session decision"}
          </h2>
          <V2Chip tone="info">v1.3</V2Chip>
        </div>
        <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
          {planName} · {dateKey}
        </p>
        <p className="v2-body" style={{ margin: 0, color: "var(--v2-ink-2)" }}>
          {locale === "ko"
            ? "미리보기는 상태를 바꾸지 않습니다. 실제 첫 스쿼트 워크 세트를 시작할 때만 아래 시작 버튼을 누르세요."
            : "Preview does not change state. Use the start button only when you begin the first squat work set."}
        </p>
      </header>

      <div style={{ display: "grid", gap: "var(--v2-s-4)" }}>
        <V2TextField
          type="datetime-local"
          step={1}
          label={locale === "ko" ? "실제 시작 시각" : "Actual start time"}
          value={localStartAt}
          onChange={(event) => setLocalStartAt(event.target.value)}
          required
        />
        <V2TextField
          type="number"
          inputMode="decimal"
          min="1"
          max="500"
          step="0.1"
          label={locale === "ko" ? "오늘의 체중" : "Today's bodyweight"}
          value={bodyweightText}
          onChange={(event) => setBodyweightText(event.target.value)}
          trailing={<span className="v2-small">kg</span>}
          required
        />
        <label
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--v2-s-3)",
          }}
        >
          <span>
            <span className="v2-label" style={{ display: "block" }}>
              {locale === "ko" ? "수동 마이크로 세션" : "Manual micro session"}
            </span>
            <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
              {locale === "ko" ? "오늘 시간 제약이 있을 때 선택" : "Choose when time is limited today"}
            </span>
          </span>
          <V2Switch
            checked={manualMicro}
            onCheckedChange={setManualMicro}
            aria-label={locale === "ko" ? "수동 마이크로 세션" : "Manual micro session"}
          />
        </label>
        {showOapRevert ? (
          <label
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "var(--v2-s-3)",
            }}
          >
            <span>
              <span className="v2-label" style={{ display: "block" }}>
                {locale === "ko" ? "OAP 슬롯 되돌리기" : "Revert the OAP slot"}
              </span>
              <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
                {locale === "ko"
                  ? "3번 슬롯을 PULL 볼륨 2×6으로 되돌립니다. 사다리 진행은 그대로 보존됩니다."
                  : "Restores the third slot to PULL volume 2×6. Ladder progress is preserved."}
              </span>
            </span>
            <V2Switch
              checked={oapSlotReverted}
              onCheckedChange={setOapSlotReverted}
              aria-label={locale === "ko" ? "OAP 슬롯 되돌리기" : "Revert the OAP slot"}
            />
          </label>
        ) : null}
      </div>

      {requestError ? (
        <p role="alert" className="v2-small" style={{ margin: 0, color: "var(--v2-c-danger)" }}>
          {requestError}
        </p>
      ) : null}

      {preview ? (
        <section aria-live="polite" style={{ display: "grid", gap: "var(--v2-s-3)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-2)" }}>
            <V2Chip tone={preview.mode.toUpperCase().includes("MICRO") ? "warning" : "success"}>
              {preview.mode}
            </V2Chip>
            {preview.squat ? <V2Chip tone="weight">SQ {preview.squat}</V2Chip> : null}
            {preview.focus ? <V2Chip tone="accent">{preview.focus}</V2Chip> : null}
            <V2Chip tone="volume">{preview.setCount} sets</V2Chip>
          </div>
          <div>
            <p className="v2-label" style={{ margin: "0 0 var(--v2-s-1)" }}>
              {locale === "ko" ? "결정 이유" : "Decision reasons"}
            </p>
            {preview.reasons.length > 0 ? (
              <ul className="v2-small" style={{ margin: 0, paddingLeft: "var(--v2-s-5)" }}>
                {preview.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            ) : (
              <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
                {locale === "ko"
                  ? "마이크로 전환 사유 없음 · 일반 세션 조건 충족"
                  : "No micro trigger · normal-session conditions met"}
              </p>
            )}
          </div>
          <div style={{ display: "grid", gap: "var(--v2-s-2)" }}>
            {preview.exercises.map((exercise, index) => (
              <div
                key={`${exercise.name}:${index}`}
                style={{ display: "flex", justifyContent: "space-between", gap: "var(--v2-s-3)" }}
              >
                <strong className="v2-body">{exercise.name}</strong>
                <span className="v2-small" style={{ color: "var(--v2-ink-2)", textAlign: "right" }}>
                  {exercise.prescription}
                </span>
              </div>
            ))}
          </div>
          {/* 오늘 뭘 드는지가 먼저다. 판정 근거는 그 아래에서 "왜 이 처방인지"를 받는다. */}
          {hardGate ? <Ref5HardGateBlock gate={hardGate} locale={locale} /> : null}
        </section>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "var(--v2-s-2)" }}>
        <V2SecondaryBtn
          full
          disabled={pendingAction !== null}
          onClick={() => void requestGeneration(true)}
        >
          {pendingAction === "preview"
            ? locale === "ko" ? "미리보는 중" : "Previewing"
            : locale === "ko" ? "세션 미리보기" : "Preview session"}
        </V2SecondaryBtn>
        <V2PrimaryBtn
          full
          disabled={pendingAction !== null || !values}
          onClick={() => void requestGeneration(false)}
        >
          {pendingAction === "start"
            ? locale === "ko" ? "시작 처리 중" : "Starting"
            : locale === "ko" ? "SQ 첫 워크 세트 시작" : "Start SQ first work set"}
        </V2PrimaryBtn>
      </div>
    </V2Card>
  );
}
