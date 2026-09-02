import {
  REF5_OAP_ARMS,
  REF5_OAP_NEGATIVE_RUNG,
  REF5_OAP_PROMOTE_STREAK,
  REF5_OAP_RUNGS,
  REF5_PROTOCOL_VERSION,
  REF5_RUNTIME_SCHEMA_VERSION,
  createInitialRef5State,
  deriveRef5AuxiliaryCaps,
  deriveRef5ControlRefs,
  deriveRef5Standards,
  type Ref5OapArmState,
  type Ref5RuntimeState,
  type Ref5StartConfig,
  type Ref5WindowResult,
} from "./ref5";

/**
 * §18 gain rate for one lift: INCREASE judgments over completed judgment windows,
 * plus the bounded recent flow. Reads the accumulators defensively so a plan whose
 * cached state predates these counters (pre-gain-rate v1.3) still renders — a
 * later replay repopulates them.
 */
function ref5WindowGain(window: {
  completedWindowCount: number;
  increaseWindowCount?: number;
  recentResults?: Ref5WindowResult[];
}) {
  const completed = window.completedWindowCount;
  const increases = window.increaseWindowCount ?? 0;
  return {
    completed,
    increases,
    gainRate: completed > 0 ? increases / completed : null,
    recentResults: window.recentResults ?? [],
  };
}

/**
 * §18 OAP readout for one arm: current rung with its name, the promotion streak
 * as `n/3`, and the two latched flags. Deliberately rung-shaped, never kg —
 * the ladder is an ordinal scale and must not join the direct-standard table.
 */
function ref5OapArmStatus(arm: Ref5OapArmState) {
  return {
    rung: arm.rung,
    rungName: REF5_OAP_RUNGS[arm.rung].name,
    rungNameKo: REF5_OAP_RUNGS[arm.rung].nameKo,
    passStreak: arm.passStreak,
    failStreak: arm.failStreak,
    promoteThreshold: REF5_OAP_PROMOTE_STREAK,
    negativesUnlocked: arm.negativesUnlocked,
    negativeRung: REF5_OAP_NEGATIVE_RUNG,
    achieved: arm.achieved,
    lastFreeExposureAt: arm.lastFreeExposureAt,
  };
}

function isRef5State(value: unknown): value is Ref5RuntimeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<Ref5RuntimeState>;
  return (
    state.schemaVersion === REF5_RUNTIME_SCHEMA_VERSION &&
    state.protocolVersion === REF5_PROTOCOL_VERSION &&
    typeof state.revision === "number" &&
    Boolean(state.directStandardsKg) &&
    Boolean(state.oap)
  );
}

/**
 * `startConfig` is the plan's whole start configuration, not just the loads:
 * before the first session there is no runtime state, and the OAP readout has
 * to show that plan's configured start rungs rather than the protocol default.
 */
export function buildRef5Status(value: unknown, startConfig?: Ref5StartConfig) {
  const state = isRef5State(value)
    ? value
    : createInitialRef5State(startConfig?.startingValuesKg, startConfig?.oap);
  const directStandardsKg = { ...state.directStandardsKg };
  const stagnationPending = (["SQ", "BP", "PULL"] as const).filter(
    (lift) => state.stagnation[lift].phase === "PENDING_MICRO",
  );
  const pendingMicroReasons = [
    ...(state.forcedMicro.pending ? ["FORCED_PRIMARY_FAILS"] : []),
    ...stagnationPending.map((lift) => `STAGNATION_${lift}`),
  ];
  return {
    schemaVersion: state.schemaVersion,
    protocolVersion: state.protocolVersion,
    revision: state.revision,
    nextFocus: state.nextFocus,
    nextSquatHard: state.nextSquatHard,
    pendingMicro: {
      pending: pendingMicroReasons.length > 0,
      reasons: pendingMicroReasons,
      forcedToken: state.forcedMicro.pending,
      stagnationLifts: stagnationPending,
    },
    windows: {
      SQ: {
        current: state.mainWindows.SQ.exposures.length,
        threshold: 6,
        volumeFailures: state.mainWindows.SQ.volumeFailEventIds.length,
        ...ref5WindowGain(state.mainWindows.SQ),
      },
      BP: {
        current: state.mainWindows.BP.exposures.length,
        threshold: 4,
        volumeFailures: state.mainWindows.BP.volumeFailEventIds.length,
        ...ref5WindowGain(state.mainWindows.BP),
      },
      PULL: {
        current: state.mainWindows.PULL.exposures.length,
        threshold: 4,
        volumeFailures: state.mainWindows.PULL.volumeFailEventIds.length,
        ...ref5WindowGain(state.mainWindows.PULL),
      },
      DL: {
        current: state.auxiliaryWindows.DL.exposures.length,
        threshold: 4,
        volumeFailures: 0,
        ...ref5WindowGain(state.auxiliaryWindows.DL),
      },
      OHP: {
        current: state.auxiliaryWindows.OHP.exposures.length,
        threshold: 4,
        volumeFailures: 0,
        ...ref5WindowGain(state.auxiliaryWindows.OHP),
      },
    },
    directStandardsKg,
    derivedStandardsKg: deriveRef5Standards(directStandardsKg),
    controlRefsKg: deriveRef5ControlRefs(directStandardsKg),
    auxiliaryCapsKg: deriveRef5AuxiliaryCaps(directStandardsKg),
    structureReview: {
      SQ: state.stagnation.SQ.structureReview,
      BP: state.stagnation.BP.structureReview,
      PULL: state.stagnation.PULL.structureReview,
      any:
        state.stagnation.SQ.structureReview ||
        state.stagnation.BP.structureReview ||
        state.stagnation.PULL.structureReview,
    },
    pullLock: state.pull.lock,
    oap: Object.fromEntries(
      REF5_OAP_ARMS.map((arm) => [arm, ref5OapArmStatus(state.oap[arm])]),
    ) as Record<(typeof REF5_OAP_ARMS)[number], ReturnType<typeof ref5OapArmStatus>>,
    startedSessionCount: state.startedSessions.length,
    completedSessionCount: state.completedSessions.length,
    recentChanges: state.progressionChanges.slice(-8),
  };
}

export type Ref5Status = ReturnType<typeof buildRef5Status>;
