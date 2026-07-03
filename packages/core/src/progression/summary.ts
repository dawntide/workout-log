export type ProgressionTargetDecisionPayload = {
  target: string;
  outcome: "SUCCESS" | "FAIL";
  eventType: "INCREASE" | "HOLD" | "RESET";
  reason: string;
  beforeWorkKg: number | null;
  afterWorkKg: number | null;
  deltaWorkKg: number | null;
};

export type ProgressionEventPayload = {
  id: string;
  eventType: string;
  programSlug: string;
  reason: string | null;
  createdAt: string;
  didAdvanceSession: boolean;
  targetDecisions: ProgressionTargetDecisionPayload[];
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
};

export type ProgressionSummaryPayload = {
  mode: "upsert" | "replay";
  applied: boolean;
  replayApplied: boolean;
  reason: string | null;
  eventType: string | null;
  programSlug: string | null;
  event: ProgressionEventPayload | null;
};

type ProgressionLocale = "ko" | "en";

function eventLabel(eventType: string | null | undefined, locale: ProgressionLocale) {
  switch (String(eventType ?? "").toUpperCase()) {
    case "INCREASE":
      return locale === "ko" ? "증량" : "Increase";
    case "RESET":
      return locale === "ko" ? "리셋" : "Reset";
    case "HOLD":
      return locale === "ko" ? "유지" : "Hold";
    case "ADVANCE_WEEK":
      return locale === "ko" ? "세션 진행" : "Advance Session";
    default:
      return eventType ? String(eventType) : locale === "ko" ? "미적용" : "Not Applied";
  }
}

function skipReasonLabel(reason: string, locale: ProgressionLocale) {
  const raw = reason.replace(/^skip:/, "");
  switch (raw) {
    case "no-plan":
      return locale === "ko" ? "플랜 없음" : "No plan";
    case "disabled":
      return locale === "ko" ? "플랜 자동 진행 OFF" : "Plan auto-progression off";
    case "no-root-program":
      return locale === "ko" ? "루트 프로그램 없음" : "No root program";
    case "version-missing":
      return locale === "ko" ? "프로그램 버전 없음" : "No program version";
    case "template-missing":
      return locale === "ko" ? "템플릿 없음" : "No template";
    case "unsupported-program":
      return locale === "ko" ? "미지원 프로그램" : "Unsupported program";
    case "forbidden-plan":
      return locale === "ko" ? "플랜 권한 없음" : "No plan access";
    case "log-missing":
      return locale === "ko" ? "로그 없음" : "No log";
    case "already-applied":
      return locale === "ko" ? "이미 적용됨" : "Already applied";
    default:
      return raw || reason;
  }
}

export function formatProgressionReason(reason: string | null | undefined, locale: ProgressionLocale = "ko") {
  const value = String(reason ?? "").trim();
  if (!value) return "";
  if (value.startsWith("increase:+")) {
    return locale === "ko" ? `${value.replace("increase:+", "")} 증량` : `Increase ${value.replace("increase:+", "")}`;
  }
  if (value.startsWith("reset:*")) {
    const factor = Number(value.replace("reset:*", ""));
    if (Number.isFinite(factor) && factor > 0) {
      return locale === "ko" ? `${Math.round(factor * 100)}% 리셋` : `${Math.round(factor * 100)}% reset`;
    }
    return locale === "ko" ? "리셋" : "Reset";
  }
  if (value === "advance:session") return locale === "ko" ? "다음 세션으로 진행" : "Advance to next session";
  if (value === "hold:success-streak") return locale === "ko" ? "성공 누적" : "Success streak maintained";
  if (value === "hold:failure-streak") return locale === "ko" ? "실패 누적" : "Failure streak maintained";
  if (value.startsWith("skip:")) return skipReasonLabel(value, locale);
  if (value === "replay:updated") return locale === "ko" ? "수정 로그 기준 재계산 완료" : "Recalculated from edited log";
  return value;
}

export function formatDecisionDelta(decision: ProgressionTargetDecisionPayload) {
  if (typeof decision.deltaWorkKg !== "number" || !Number.isFinite(decision.deltaWorkKg)) return null;
  if (decision.deltaWorkKg === 0) return "0kg";
  return `${decision.deltaWorkKg > 0 ? "+" : ""}${decision.deltaWorkKg}kg`;
}

export function summarizeProgression(summary: ProgressionSummaryPayload | null | undefined, locale: ProgressionLocale = "ko") {
  if (!summary) return null;
  const reasonText = formatProgressionReason(summary.reason, locale);
  const event = summary.event;

  if (!event) {
    if (!summary.applied) {
      return reasonText ? (locale === "ko" ? `자동 진행 미적용: ${reasonText}` : `Auto progression not applied: ${reasonText}`) : locale === "ko" ? "자동 진행 미적용" : "Auto progression not applied";
    }
    if (summary.replayApplied) {
      return reasonText ? (locale === "ko" ? `자동 진행 재계산 완료: ${reasonText}` : `Auto progression recalculated: ${reasonText}`) : locale === "ko" ? "자동 진행 재계산 완료" : "Auto progression recalculated";
    }
    return reasonText ? (locale === "ko" ? `자동 진행 적용: ${reasonText}` : `Auto progression applied: ${reasonText}`) : locale === "ko" ? "자동 진행 적용됨" : "Auto progression applied";
  }

  const changed = event.targetDecisions.filter((d) => d.eventType === "INCREASE" || d.eventType === "RESET");
  const changedText = changed
    .slice(0, 2)
    .map((d) => {
      const delta = formatDecisionDelta(d);
      return delta ? `${d.target} ${delta}` : d.target;
    })
    .join(", ");
  const parts = [locale === "ko" ? `자동 진행 ${eventLabel(event.eventType, locale)}` : `Auto progression ${eventLabel(event.eventType, locale)}`];
  if (event.didAdvanceSession) parts.push(locale === "ko" ? "세션 진행" : "Session advanced");
  if (changedText) parts.push(changedText);
  if (reasonText) parts.push(reasonText);
  return parts.join(" · ");
}

export function progressionTone(summary: ProgressionSummaryPayload | null | undefined): "neutral" | "success" | "warning" {
  if (!summary) return "neutral";
  if (!summary.applied && String(summary.reason ?? "").startsWith("skip:")) return "warning";
  if (summary.event?.eventType === "RESET") return "warning";
  return "success";
}
