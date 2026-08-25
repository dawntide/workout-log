"use client";

import { useMemo, useState } from "react";
import { V2Card } from "@/components/v2/primitives";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import { muscleGroupLabel } from "@/lib/i18n/muscle-group-labels";
import { MuscleFreshnessEvidenceSheet } from "./muscle-freshness-evidence-sheet";
import type {
  MuscleFreshnessGroup,
  MuscleFreshnessResult,
} from "@workout/core/stats/muscle-freshness";

/** 신선(≥70) / 보통(30~70) / 피로(<30). 시맨틱 색이라 액센트 테마와 무관하다. */
const FRESH_THRESHOLD = 70;
const TIRED_THRESHOLD = 30;

function toneOf(pct: number): { color: string; labelKo: string; labelEn: string } {
  if (pct >= FRESH_THRESHOLD) {
    return { color: "var(--v2-c-success)", labelKo: "신선", labelEn: "Fresh" };
  }
  if (pct >= TIRED_THRESHOLD) {
    return { color: "var(--v2-c-warning)", labelKo: "보통", labelEn: "Moderate" };
  }
  return { color: "var(--v2-c-danger)", labelKo: "피로", labelEn: "Fatigued" };
}

/**
 * `capacityKg === 0`은 **"회복 완료"가 아니라 "기록 없음"**이다.
 *
 * 모델은 둘 다 100%를 주지만 뜻이 다르다. prod에서 `Core`가 상시 이 상태라
 * (코어 운동 기록 0건) 게이지를 가득 채워 두면 "쉬어서 준비됨"으로 읽힌다 —
 * 거짓말이다. 계획서 §7 결정 6.
 */
function hasRecord(group: MuscleFreshnessGroup): boolean {
  return group.capacityKg > 0;
}

function FreshnessRow({
  group,
  locale,
}: {
  group: MuscleFreshnessGroup;
  locale: "ko" | "en";
}) {
  const recorded = hasRecord(group);
  const tone = toneOf(group.freshnessPct);
  const label = muscleGroupLabel(group.muscleGroup, locale);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "var(--v2-s-2)",
          marginBottom: "var(--v2-s-1)",
        }}
      >
        <span className="v2-body" style={{ fontWeight: 600 }}>
          {label}
        </span>
        {recorded ? (
          <span className="v2-mono-label" style={{ color: tone.color, fontWeight: 700 }}>
            {group.freshnessPct}%
            <span style={{ color: "var(--v2-ink-3)", fontWeight: 400 }}>
              {" · "}
              {locale === "ko" ? tone.labelKo : tone.labelEn}
            </span>
          </span>
        ) : (
          <span className="v2-mono-label" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko" ? "기록 없음" : "No record"}
          </span>
        )}
      </div>
      <div
        role="meter"
        aria-label={
          locale === "ko" ? `${label} 신선도` : `${label} freshness`
        }
        aria-valuenow={recorded ? group.freshnessPct : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={
          recorded ? undefined : locale === "ko" ? "기록 없음" : "No record"
        }
        style={{
          height: "var(--v2-s-2)",
          background: "var(--v2-paper-3)",
          borderRadius: "var(--v2-r-pill)",
          overflow: "hidden",
        }}
      >
        {recorded ? (
          <div
            style={{
              // 0%도 보이게 최소 폭을 준다 — 빈 막대는 "기록 없음"과 헷갈린다.
              width: `${Math.max(4, group.freshnessPct)}%`,
              height: "100%",
              background: tone.color,
              borderRadius: "var(--v2-r-pill)",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * 부위별 신선도 게이지.
 *
 * **정렬은 신선도 내림차순이다** — 이 카드가 답하는 질문이 "오늘 뭘 할 수 있나"라
 * 가장 준비된 부위가 맨 위에 와야 한다. 고정 해부학 순서는 참조표에는 맞지만
 * 질문에 답하지 않는다. 기록 없는 부위는 맨 아래로 내린다.
 *
 * `Other`는 목록에서 숨긴다(계획서 §7 결정 5) — 매핑 공백은 근거 시트(PR3)에서 본다.
 */
export function MuscleFreshnessSection({
  data,
  locale,
  onDataChanged,
}: {
  data: MuscleFreshnessResult | null;
  locale: "ko" | "en";
  /** 근거 시트에서 회복 시간을 바꾸면 서버가 다시 계산해야 한다. */
  onDataChanged: () => void;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const rows = useMemo(() => {
    if (!data) return [];
    return data.groups
      .filter((group) => group.muscleGroup !== "Other")
      .slice()
      .sort((a, b) => {
        const aRecorded = hasRecord(a);
        const bRecorded = hasRecord(b);
        if (aRecorded !== bRecorded) return aRecorded ? -1 : 1;
        return b.freshnessPct - a.freshnessPct;
      });
  }, [data]);

  if (!data) return null;

  const recoveryDays = Math.round(data.recoveryHours / 24);
  const anyRecord = rows.some(hasRecord);

  return (
    <V2Card>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--v2-s-2)",
          padding: "0px 0px var(--v2-s-3)",
        }}
      >
        <div>
          <p className="v2-label">{locale === "ko" ? "부위별 신선도" : "Muscle Freshness"}</p>
          <p
            className="v2-small"
            style={{ marginTop: "var(--v2-s-1)", color: "var(--v2-ink-3)" }}
          >
            {locale === "ko"
              ? `최근 ${data.capacityWeeks}주 주간 평균 볼륨 기준 · ${recoveryDays}일이면 완전 회복`
              : `Against your ${data.capacityWeeks}-week average weekly volume · full recovery in ${recoveryDays} days`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEvidenceOpen(true)}
          aria-label={locale === "ko" ? "신선도 계산 근거" : "How freshness is calculated"}
          className="v2-pressable"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "44px",
            height: "44px",
            margin: "-10px -10px 0px 0px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--v2-ink-3)",
            flexShrink: 0,
          }}
        >
          <V2Icon name="function" style={{ fontSize: "var(--v2-t-18)" }} />
        </button>
      </div>

      {!anyRecord ? (
        <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
          {locale === "ko"
            ? "최근 기록이 없습니다. 세션을 저장하면 부위별로 쌓인 피로가 여기 표시됩니다."
            : "No recent sessions. Accumulated fatigue by muscle group appears here once you log a workout."}
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-2)",
          }}
        >
          {rows.map((group) => (
            <FreshnessRow key={group.muscleGroup} group={group} locale={locale} />
          ))}
        </div>
      )}

      {evidenceOpen ? (
        <MuscleFreshnessEvidenceSheet
          open={evidenceOpen}
          onClose={() => setEvidenceOpen(false)}
          data={data}
          locale={locale}
          onRecoveryHoursSaved={onDataChanged}
        />
      ) : null}
    </V2Card>
  );
}
