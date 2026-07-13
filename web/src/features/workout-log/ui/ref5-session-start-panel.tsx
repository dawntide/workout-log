"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  V2Card,
  V2Chip,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2Switch,
  V2TextField,
} from "@/components/v2/primitives";
import { errorMessage } from "@/lib/error-message";
import { apiPost, isAbortError } from "@/shared/api";
import type { GeneratedSessionLike } from "@/entities/workout-record";

export type Ref5SessionStartValues = {
  actualStartAt: string;
  bodyweightKg: number;
  manualMicro: boolean;
  climbingWithin48h: boolean;
  omitPullVolume: boolean;
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
  onStarted: (session: GeneratedSessionLike) => void;
};

type PreviewExercise = {
  name: string;
  prescription: string;
};

type PreviewSummary = {
  mode: string;
  squat: string | null;
  focus: string | null;
  reasons: string[];
  exercises: PreviewExercise[];
  setCount: number;
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
    ...(decision?.climbingReplacement === true ? ["CLIMBING_REPLACEMENT"] : []),
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
  const omittedRows = Array.isArray(ref5?.omittedPrescriptions)
    ? ref5.omittedPrescriptions
        .map(asRecord)
        .filter((exercise): exercise is Record<string, unknown> => Boolean(exercise))
        .map((exercise) => ({
          name: firstString([exercise], ["exerciseName", "name", "lift"]) ?? "Exercise",
          prescription: `${firstString([exercise], ["stream", "role"]) ?? "OMITTED"} · OMITTED · INVALID`,
        }))
    : [];

  return { mode, squat, focus, reasons, exercises: [...exercises, ...omittedRows], setCount };
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
  climbingWithin48h: boolean;
  omitPullVolume: boolean;
  startEventId: string;
}): Ref5SessionStartValues | null {
  const start = new Date(input.localStartAt);
  const bodyweightKg = Number(input.bodyweightText);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(bodyweightKg) || bodyweightKg <= 0) {
    return null;
  }
  return {
    actualStartAt: start.toISOString(),
    bodyweightKg,
    manualMicro: input.manualMicro,
    climbingWithin48h: input.climbingWithin48h,
    omitPullVolume: input.omitPullVolume,
    startEventId: input.startEventId,
  };
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
  const [climbingWithin48h, setClimbingWithin48h] = useState(false);
  const [omitPullVolume, setOmitPullVolume] = useState(false);
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
        climbingWithin48h,
        omitPullVolume,
        startEventId,
      }),
    [bodyweightText, climbingWithin48h, localStartAt, manualMicro, omitPullVolume, startEventId],
  );
  const valuesSignature = values ? JSON.stringify(values) : null;
  const visiblePreview =
    previewSession && previewSignature === valuesSignature ? previewSession : null;
  const preview = visiblePreview ? summarizeRef5Preview(visiblePreview) : null;

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
      const response = await apiPost<{ session: GeneratedSessionLike }>(
        `/api/plans/${encodeURIComponent(planId)}/generate`,
        buildRef5GeneratePayload(previewOnly, values),
        { invalidateCache: !previewOnly, signal: controller.signal },
      );
      if (!response.session) throw new Error("The server did not return a session.");
      if (previewOnly) {
        setPreviewSession(response.session);
        setPreviewSignature(JSON.stringify(values));
      } else {
        onStarted(response.session);
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
          <V2Chip tone="info">v1.1</V2Chip>
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
              {locale === "ko" ? "오늘 회복을 우선할 때 선택" : "Choose when recovery takes priority today"}
            </span>
          </span>
          <V2Switch
            checked={manualMicro}
            onCheckedChange={setManualMicro}
            aria-label={locale === "ko" ? "수동 마이크로 세션" : "Manual micro session"}
          />
        </label>
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
              {locale === "ko" ? "48시간 내 클라이밍" : "Climbing within 48 hours"}
            </span>
            <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
              {locale === "ko" ? "당기기 처방을 조정합니다" : "Adjusts the pulling prescription"}
            </span>
          </span>
          <V2Switch
            checked={climbingWithin48h}
            onCheckedChange={(checked) => {
              setClimbingWithin48h(checked);
              if (!checked) setOmitPullVolume(false);
            }}
            aria-label={locale === "ko" ? "48시간 내 클라이밍" : "Climbing within 48 hours"}
          />
        </label>
        {climbingWithin48h ? (
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
                {locale === "ko" ? "PULL 볼륨 생략" : "Omit PULL volume"}
              </span>
              <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
                {locale === "ko"
                  ? "생략한 처방은 INVALID로 닫히며 진행창에 들어가지 않습니다"
                  : "The omitted prescription closes as INVALID and does not enter a window"}
              </span>
            </span>
            <V2Switch
              checked={omitPullVolume}
              onCheckedChange={setOmitPullVolume}
              aria-label={locale === "ko" ? "PULL 볼륨 생략" : "Omit PULL volume"}
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
