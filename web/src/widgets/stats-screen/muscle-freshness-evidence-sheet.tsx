"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { V2Hairline, V2Segmented } from "@/components/v2/primitives";
import { muscleGroupLabel } from "@/lib/i18n/muscle-group-labels";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import {
  DEFAULT_FRESHNESS_RECOVERY_HOURS,
  SETTINGS_KEYS,
} from "@/lib/settings/workout-preferences";
import { FRESHNESS_RECOVERY_HOURS_OPTIONS } from "@workout/core/stats/muscle-freshness-constants";
import type { MuscleFreshnessResult } from "@workout/core/stats/muscle-freshness";

const BottomSheet = dynamic(
  () => import("@/components/ui/bottom-sheet").then((mod) => mod.BottomSheet),
  { ssr: false },
);

function formatDay(iso: string, locale: "ko" | "en") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatKg(value: number) {
  return `${Math.round(value).toLocaleString()}kg`;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
      <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
        {title}
      </span>
      {children}
    </div>
  );
}

/**
 * 신선도 계산 근거.
 *
 * **이 시트가 M5의 이유다.** Fitbod·SHRED는 회복 점수를 주면서 왜 그 값인지
 * 설명하지 않는다. 우리는 식·파라미터·기여 세션을 전부 열고, 유일한 가정
 * (회복 시간)을 사용자가 바꾸게 한다.
 *
 * 값은 서버가 계산한다 — 회복 시간을 바꾸면 `onRecoveryHoursSaved`로 상위에
 * 알려 부트스트랩을 다시 받는다. 클라이언트에서 다시 계산하면 감쇠 창 밖으로
 * 밀려난 세션을 되살릴 수 없어(응답에 없다) 창을 늘리는 방향이 틀어진다.
 */
export function MuscleFreshnessEvidenceSheet({
  open,
  onClose,
  data,
  locale,
  onRecoveryHoursSaved,
}: {
  open: boolean;
  onClose: () => void;
  data: MuscleFreshnessResult;
  locale: "ko" | "en";
  onRecoveryHoursSaved: () => void;
}) {
  const ko = locale === "ko";

  const recoveryHours = useSettingRowMutation<number>({
    key: SETTINGS_KEYS.freshnessRecoveryHours,
    fallbackValue: DEFAULT_FRESHNESS_RECOVERY_HOURS,
    serverValue: data.recoveryHours,
    persistServer: createPersistServerSetting<number>(),
    successMessage: ko ? "회복 시간을 저장했습니다." : "Saved the recovery window.",
    rollbackNotice: ko
      ? "회복 시간 저장에 실패해 이전 값으로 되돌렸습니다."
      : "Failed to save the recovery window, so the previous value was restored.",
  });

  /** 기여 세션이 있는 부위만, 피로가 큰 순으로. */
  const contributors = useMemo(
    () =>
      data.groups
        .filter((group) => group.contributions.length > 0)
        .slice()
        .sort((a, b) => b.fatigue - a.fatigue),
    [data.groups],
  );

  const recoveryDays = Math.round(data.recoveryHours / 24);
  const otherPct = Math.round(data.otherSetShare * 1000) / 10;

  return (
    <BottomSheet
      open={open}
      title={ko ? "신선도 계산 근거" : "How freshness is calculated"}
      description={
        ko
          ? "추정 모델의 식과 파라미터, 그리고 이 값을 만든 세션입니다."
          : "The model, its parameters, and the sessions behind these numbers."
      }
      onClose={onClose}
      closeLabel={ko ? "닫기" : "Close"}
      footer={null}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-5)" }}>
        <Block title={ko ? "모델" : "Model"}>
          <pre
            style={{
              margin: 0,
              padding: "var(--v2-s-3)",
              background: "var(--v2-paper-2)",
              borderRadius: "var(--v2-r-2)",
              color: "var(--v2-ink-2)",
              fontSize: "var(--v2-t-12)",
              lineHeight: 1.7,
              overflowX: "auto",
              whiteSpace: "pre",
            }}
          >
{`신선도 = 1 - Σ (세션부하 ÷ 기준부하) × 감쇠
감쇠   = max(0, 1 - 경과시간 ÷ ${data.recoveryHours}h)
기준부하 = 최근 ${data.capacityWeeks}주 총 부하 ÷ ${data.capacityWeeks}`}
          </pre>
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
            {ko
              ? "머신러닝이 아니라 위 식이 전부입니다. 기준부하는 사람마다 다르므로 절대 톤수가 아니라 본인의 주간 평균으로 정규화합니다."
              : "No machine learning — the formula above is the whole model. Load is normalized against your own weekly average, not an absolute tonnage."}
          </p>
        </Block>

        <V2Hairline />

        <Block title={ko ? "회복 시간" : "Recovery window"}>
          <V2Segmented
            size="sm"
            ariaLabel={ko ? "회복 시간" : "Recovery window"}
            value={String(recoveryHours.value)}
            onChange={(next) => {
              void recoveryHours.commit(Number(next)).then((result) => {
                // 같은 값 재선택은 ignored로 떨어진다 — 그때 재조회하면 헛일이다.
                if (!result.ignored && result.ok) onRecoveryHoursSaved();
              });
            }}
            options={FRESHNESS_RECOVERY_HOURS_OPTIONS.map((hours) => ({
              value: String(hours),
              label: ko ? `${hours / 24}일` : `${hours / 24}d`,
              ariaLabel: `${hours}h`,
            }))}
            style={{ minWidth: "max-content" }}
          />
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
            {ko
              ? `기본 ${DEFAULT_FRESHNESS_RECOVERY_HOURS / 24}일. 이 시간이 지나면 그 세션의 부하는 0으로 봅니다 — 모델의 유일한 가정이라 직접 조정할 수 있게 열어 뒀습니다.`
              : `Default ${DEFAULT_FRESHNESS_RECOVERY_HOURS / 24} days. After this, a session counts as fully recovered — it is the model's only assumption, so you can set it yourself.`}
          </p>
          {recoveryHours.error ? (
            <p className="v2-small" style={{ margin: 0, color: "var(--v2-c-danger)" }}>
              {recoveryHours.error}
            </p>
          ) : null}
        </Block>

        <V2Hairline />

        <Block title={ko ? "기여한 세션" : "Contributing sessions"}>
          {contributors.length === 0 ? (
            <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
              {ko
                ? `최근 ${recoveryDays}일 안에 기록된 세션이 없습니다. 전 부위가 완전 회복 상태입니다.`
                : `No sessions in the last ${recoveryDays} days — every muscle group is fully recovered.`}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}>
              {contributors.map((group) => (
                <div
                  key={group.muscleGroup}
                  style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: "var(--v2-s-2)",
                    }}
                  >
                    <span className="v2-body" style={{ fontWeight: 700 }}>
                      {muscleGroupLabel(group.muscleGroup, locale)}
                    </span>
                    <span className="v2-mono-label" style={{ color: "var(--v2-ink-3)" }}>
                      {ko ? "기준" : "base"} {formatKg(group.capacityKg)}
                      {ko ? "/주" : "/wk"}
                    </span>
                  </div>
                  {group.contributions.map((entry) => (
                    <p
                      key={`${group.muscleGroup}-${entry.logId}`}
                      className="v2-mono-label"
                      style={{ margin: 0, color: "var(--v2-ink-2)" }}
                    >
                      {formatDay(entry.performedAt, locale)} · {formatKg(entry.loadKg)} ×{" "}
                      {entry.decay.toFixed(2)} = {entry.fatigue.toFixed(2)}
                    </p>
                  ))}
                  <p
                    className="v2-mono-label"
                    style={{ margin: 0, color: "var(--v2-ink-3)" }}
                  >
                    {ko ? "합계 피로" : "total fatigue"} {group.fatigue.toFixed(2)} →{" "}
                    {group.freshnessPct}%
                    {group.fatigue > 1
                      ? ko
                        ? " (0%에서 멈춤)"
                        : " (clamped at 0%)"
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Block>

        <V2Hairline />

        <Block title={ko ? "매핑 공백" : "Mapping gaps"}>
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
            {/* 목록에서는 Other를 숨긴다(계획서 §7 결정 5). 대신 여기서 비율을 밝혀
                사용자가 "내 운동이 어디에도 안 잡히고 있다"를 알 수 있게 한다. */}
            {ko
              ? `부위를 특정하지 못한 세트 ${otherPct}%. 이 세트들은 어느 부위에도 반영되지 않습니다.`
              : `${otherPct}% of sets could not be mapped to a muscle group and are excluded from every gauge.`}
          </p>
        </Block>
      </div>
    </BottomSheet>
  );
}
