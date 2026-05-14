"use client";

import {
  type CSSProperties,
  type ReactNode,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { APP_ROUTES } from "@/lib/app-routes";
import {
  V2PrimaryBtn,
  V2Segmented,
  V2SelectableRow,
  V2TextField,
} from "./primitives";

const ONBOARDING_DONE_KEY = "workout-log.v2.onboarding.done";

export function markOnboardingDone() {
  try {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
  } catch {
    // ignore
  }
}

export function isOnboardingDone(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

const TOTAL_STEPS = 4;

type GoalKey = "strength" | "hypertrophy" | "endurance" | "general";
type ExpKey = "novice" | "intermediate" | "advanced" | "returning";
type Unit = "kg" | "lb";

type ProgramRec = {
  key: string;
  name: string;
  level: string;
  cadence: string;
  recommended?: boolean;
  href?: string;
};

const NOVICE_PROGRAMS: ProgramRec[] = [
  {
    key: "starting-strength",
    name: "Starting Strength",
    level: "초급 · 선형 진행",
    cadence: "12주 · 3×/주",
    recommended: true,
  },
  {
    key: "greyskull",
    name: "Greyskull LP",
    level: "초급 · AMRAP 마지막 세트",
    cadence: "12주 · 3×/주",
  },
  {
    key: "browse",
    name: "직접 고르기",
    level: "프로그램 스토어",
    cadence: "둘러보기",
  },
];

const INTERMEDIATE_PROGRAMS: ProgramRec[] = [
  {
    key: "531-bbb",
    name: "5/3/1 BBB",
    level: "중급 · 자동 조절",
    cadence: "16주 · 4×/주",
    recommended: true,
  },
  {
    key: "ppl",
    name: "Push Pull Legs",
    level: "중급 · 분할",
    cadence: "6일/주",
  },
  {
    key: "browse",
    name: "직접 고르기",
    level: "프로그램 스토어",
    cadence: "둘러보기",
  },
];

export function V2Onboarding() {
  const router = useRouter();
  const { locale } = useLocale();
  const [step, setStep] = useState(0);
  const [unit, setUnit] = useState<Unit>("kg");
  const [bodyweight, setBodyweight] = useState<string>("");
  const [goals, setGoals] = useState<GoalKey[]>(["strength"]);
  const [exp, setExp] = useState<ExpKey | null>(null);
  const [program, setProgram] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const finish = () => {
    markOnboardingDone();
    startTransition(() => {
      if (program === "browse" || !program) {
        router.push(APP_ROUTES.programStore);
      } else {
        // 미래에 program slug → /program-store/detail?slug=… 매핑 가능.
        router.push(APP_ROUTES.programStore);
      }
    });
  };

  const skip = () => {
    markOnboardingDone();
    router.push("/");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        flexDirection: "column",
        background: "var(--v2-bg)",
        color: "var(--v2-ink)",
        overflow: "hidden",
      }}
    >
      {/* 진행 바 */}
      <div
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
          padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={step === 0 ? skip : goBack}
            aria-label={
              step === 0
                ? locale === "ko"
                  ? "닫기"
                  : "Close"
                : locale === "ko"
                  ? "이전"
                  : "Back"
            }
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--v2-ink-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: "var(--v2-r-2)",
              marginLeft: -8,
            }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden
            >
              {step === 0 ? "close" : "arrow_back"}
            </span>
          </button>
          <div style={{ flex: 1, display: "flex", gap: 4 }}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: "var(--v2-r-pill)",
                  background:
                    i <= step ? "var(--v2-accent)" : "var(--v2-paper-3)",
                  transition: "background var(--v2-d-2) var(--v2-e-out)",
                }}
              />
            ))}
          </div>
          {step < TOTAL_STEPS - 1 && (
            <button
              type="button"
              onClick={goNext}
              className="v2-font-display"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--v2-ink-2)",
                fontSize: 13,
                fontWeight: 600,
                minHeight: 44,
                padding: "8px 12px",
                borderRadius: "var(--v2-r-2)",
                marginRight: -8,
              }}
            >
              {locale === "ko" ? "나중에" : "Later"}
            </button>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 24px 16px",
          animation: "v2-fadeUp 320ms var(--v2-e-out) both",
        }}
        key={step}
      >
        {step === 0 && <Welcome locale={locale} />}
        {step === 1 && (
          <UnitGoals
            locale={locale}
            unit={unit}
            setUnit={setUnit}
            bodyweight={bodyweight}
            setBodyweight={setBodyweight}
            goals={goals}
            setGoals={setGoals}
          />
        )}
        {step === 2 && (
          <Experience locale={locale} exp={exp} setExp={setExp} />
        )}
        {step === 3 && (
          <ProgramPick
            locale={locale}
            exp={exp}
            program={program}
            setProgram={setProgram}
          />
        )}
      </div>

      {/* 하단 CTA */}
      <div
        style={{
          padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        <V2PrimaryBtn
          full
          icon={step === TOTAL_STEPS - 1 ? "rocket_launch" : "arrow_forward"}
          onClick={step === TOTAL_STEPS - 1 ? finish : goNext}
        >
          {step === TOTAL_STEPS - 1
            ? locale === "ko"
              ? "시작하기"
              : "Start"
            : locale === "ko"
              ? "계속"
              : "Continue"}
        </V2PrimaryBtn>
      </div>
    </div>
  );
}

/* ─── Step 1: Welcome ─── */

function Welcome({ locale }: { locale: "ko" | "en" }) {
  const features: [string, string, string][] =
    locale === "ko"
      ? [
          ["bolt", "한 번에 한 세트", "큰 키패드, 한 손으로 충분."],
          ["trending_up", "진짜 진행만", "우상향 그래프 외에 잡소음 없음."],
          ["shield", "데이터는 당신 것", "오프라인 우선, 언제든 내보내기."],
        ]
      : [
          ["bolt", "One set at a time", "Big keypad. One-handed."],
          [
            "trending_up",
            "Real progress only",
            "Just the curve going up. No noise.",
          ],
          [
            "shield",
            "Your data, always",
            "Offline-first. Export any time.",
          ],
        ];

  return (
    <div>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "var(--v2-r-4)",
          background: "var(--v2-accent-weak)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 28,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 38,
            color: "var(--v2-accent)",
            fontVariationSettings: "'FILL' 1, 'wght' 600",
          }}
          aria-hidden
        >
          fitness_center
        </span>
      </div>
      <h1 className="v2-display" style={{ fontSize: 44 }}>
        {locale === "ko" ? (
          <>
            매번
            <br />
            조금씩
            <br />
            강해지기.
          </>
        ) : (
          <>
            Get a little
            <br />
            stronger,
            <br />
            every time.
          </>
        )}
      </h1>
      <p
        className="v2-body"
        style={{
          marginTop: 18,
          fontSize: 16,
          color: "var(--v2-ink-2)",
        }}
      >
        {locale === "ko"
          ? "Workout Log는 단순합니다. 프로그램을 따르고, 세트를 기록하고, 그래프가 우상향하는 걸 봅니다."
          : "Workout Log is simple. Follow a program, log your sets, watch the graph go up."}
      </p>

      <div
        style={{
          marginTop: 28,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {features.map(([ic, t, s]) => (
          <div
            key={t}
            style={{ display: "flex", gap: 14, alignItems: "flex-start" }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 22,
                color: "var(--v2-accent)",
                marginTop: 1,
                fontVariationSettings: "'FILL' 1, 'wght' 500",
              }}
              aria-hidden
            >
              {ic}
            </span>
            <div>
              <div className="v2-h3" style={{ fontSize: 15 }}>
                {t}
              </div>
              <div
                className="v2-small"
                style={{ marginTop: 2, color: "var(--v2-ink-3)" }}
              >
                {s}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 2: Unit / Goals ─── */

function UnitGoals({
  locale,
  unit,
  setUnit,
  bodyweight,
  setBodyweight,
  goals,
  setGoals,
}: {
  locale: "ko" | "en";
  unit: Unit;
  setUnit: (u: Unit) => void;
  bodyweight: string;
  setBodyweight: (v: string) => void;
  goals: GoalKey[];
  setGoals: (g: GoalKey[]) => void;
}) {
  const toggle = (g: GoalKey) =>
    setGoals(goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g]);

  const opts: [GoalKey, string, string][] =
    locale === "ko"
      ? [
          ["strength", "근력", "낮은 반복, 높은 강도"],
          ["hypertrophy", "근비대", "중간 반복, 볼륨 중심"],
          ["endurance", "근지구력", "높은 반복"],
          ["general", "전반적 컨디션", "꾸준함이 중요"],
        ]
      : [
          ["strength", "Strength", "Low reps, high load"],
          ["hypertrophy", "Hypertrophy", "Mid reps, volume"],
          ["endurance", "Endurance", "High reps"],
          ["general", "General fitness", "Consistency"],
        ];

  return (
    <div>
      <p className="v2-eyebrow">
        {locale === "ko" ? "설정 1/3" : "STEP 1/3"}
      </p>
      <h1 className="v2-h1" style={{ marginTop: 8 }}>
        {locale === "ko" ? "주된 목표는?" : "What's your goal?"}
      </h1>
      <p className="v2-small" style={{ marginTop: 6 }}>
        {locale === "ko"
          ? "여러 개 선택 가능. 나중에 변경됩니다."
          : "Select multiple. You can change later."}
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-2)",
          marginTop: "var(--v2-s-6)",
        }}
      >
        {opts.map(([k, l, s]) => (
          <V2SelectableRow
            key={k}
            mode="multi"
            selected={goals.includes(k)}
            onClick={() => toggle(k)}
            title={l}
            description={s}
          />
        ))}
      </div>

      <div className="v2-label" style={{ marginTop: "var(--v2-s-7)" }}>
        {locale === "ko" ? "단위 / 체중" : "Unit / Bodyweight"}
      </div>
      <div style={{ marginTop: "var(--v2-s-2)" }}>
        <V2Segmented
          options={[
            { value: "kg", label: "kg" },
            { value: "lb", label: "lb" },
          ]}
          value={unit}
          onChange={setUnit}
          ariaLabel={locale === "ko" ? "단위" : "Unit"}
          style={{ display: "flex", width: "100%" }}
        />
      </div>

      <div style={{ marginTop: "var(--v2-s-2)" }}>
        <V2TextField
          label={locale === "ko" ? "체중" : "Bodyweight"}
          icon="monitor_weight"
          type="text"
          inputMode="decimal"
          value={bodyweight}
          onChange={(e) =>
            setBodyweight(e.target.value.replace(/[^0-9.]/g, ""))
          }
          placeholder="—"
          trailing={
            <span className="v2-mono-label" style={{ color: "var(--v2-ink-3)" }}>
              {unit}
            </span>
          }
        />
      </div>
    </div>
  );
}

/* ─── Step 3: Experience ─── */

function Experience({
  locale,
  exp,
  setExp,
}: {
  locale: "ko" | "en";
  exp: ExpKey | null;
  setExp: (e: ExpKey) => void;
}) {
  const opts: [ExpKey, string, string, string][] =
    locale === "ko"
      ? [
          ["novice", "초급", "< 6개월 · 매주 무게가 늘어남", "auto_awesome"],
          [
            "intermediate",
            "중급",
            "6개월 ~ 2년 · 매월 무게가 늘어남",
            "trending_up",
          ],
          ["advanced", "고급", "2년 + · 분기 단위 진행", "shield"],
          ["returning", "복귀", "쉬다가 돌아오는 중", "replay"],
        ]
      : [
          ["novice", "Novice", "< 6 months · Weekly progress", "auto_awesome"],
          [
            "intermediate",
            "Intermediate",
            "6mo–2yr · Monthly progress",
            "trending_up",
          ],
          ["advanced", "Advanced", "2yr+ · Quarterly progress", "shield"],
          ["returning", "Returning", "Coming back from a break", "replay"],
        ];

  return (
    <div>
      <p className="v2-eyebrow">
        {locale === "ko" ? "설정 2/3" : "STEP 2/3"}
      </p>
      <h1 className="v2-h1" style={{ marginTop: 8 }}>
        {locale === "ko" ? "훈련 경험은?" : "Training experience?"}
      </h1>
      <p className="v2-small" style={{ marginTop: 6 }}>
        {locale === "ko"
          ? "적합한 프로그램과 시작 무게를 추천하는 데 사용해요."
          : "Used to recommend programs and starting weights."}
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-2)",
          marginTop: "var(--v2-s-6)",
        }}
      >
        {opts.map(([k, l, s, ic]) => (
          <V2SelectableRow
            key={k}
            mode="single"
            selected={exp === k}
            onClick={() => setExp(k)}
            icon={ic}
            title={l}
            description={s}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Step 4: Program ─── */

function ProgramPick({
  locale,
  exp,
  program,
  setProgram,
}: {
  locale: "ko" | "en";
  exp: ExpKey | null;
  program: string | null;
  setProgram: (p: string) => void;
}) {
  const recs =
    exp === "novice" || exp === "returning"
      ? NOVICE_PROGRAMS
      : INTERMEDIATE_PROGRAMS;

  return (
    <div>
      <p className="v2-eyebrow">
        {locale === "ko" ? "설정 3/3" : "STEP 3/3"}
      </p>
      <h1 className="v2-h1" style={{ marginTop: 8 }}>
        {locale === "ko" ? "시작 프로그램." : "Pick a program."}
      </h1>
      <p className="v2-small" style={{ marginTop: 6 }}>
        {locale === "ko"
          ? "경험에 맞춰 골랐어요. 언제든 변경 가능."
          : "Picked to match your experience. Switch any time."}
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginTop: 24,
        }}
      >
        {recs.map((rec) => {
          const sel = program === rec.key;
          return (
            <button
              key={rec.key}
              type="button"
              onClick={() => setProgram(rec.key)}
              style={{
                textAlign: "left",
                cursor: "pointer",
                border: "none",
                padding: "16px 18px",
                borderRadius: "var(--v2-r-3)",
                background: sel ? "var(--v2-accent-weak)" : "var(--v2-paper)",
                boxShadow: sel
                  ? "inset 0 0 0 2px var(--v2-accent)"
                  : "var(--v2-elev-1)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                transition: "all var(--v2-d-2) var(--v2-e-out)",
                minHeight: 64,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  className="v2-h2"
                  style={{
                    fontSize: 19,
                    color: sel ? "var(--v2-accent-ink)" : "var(--v2-ink)",
                  }}
                >
                  {rec.name}
                </span>
                {rec.recommended && <RecommendedChip locale={locale} />}
              </div>
              <div
                className="v2-mono-label"
                style={{ color: "var(--v2-ink-3)" }}
              >
                {rec.level} · {rec.cadence}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RecommendedChip({ locale }: { locale: "ko" | "en" }) {
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: "var(--v2-r-pill)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    background: "var(--v2-accent)",
    color: "var(--v2-ink-on-accent)",
  };
  return (
    <span className="v2-font-display" style={style}>{locale === "ko" ? "추천" : "RECOMMENDED"}</span>
  );
}

/* helper export — used outside component too */
export const onboardingExports: { dummy: ReactNode } = { dummy: null };
