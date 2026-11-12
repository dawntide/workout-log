/**
 * REF5 프로토콜 버전의 단일 진실원.
 *
 * ref5.ts 본체가 아니라 별도 모듈에 두는 이유는 소비자 때문이다. 시작 패널·스토어 시트
 * 같은 클라이언트 컴포넌트도 현재 프로토콜 버전을 알아야 하는데, 그 값 하나 때문에
 * ref5.ts(엔진 전체)를 import하면 클라이언트 번들이 엔진을 끌고 들어갈 여지가 생긴다.
 * 상수만 있는 이 모듈은 어디서 import해도 부담이 없다.
 *
 * 리터럴로 복제하지 말 것 — v1.3 컷오버(#617)에서 web/e2e에 남아 있던 "1.2" 리터럴이
 * 서버의 REF5_STALE_VERSION(409)에 걸려 nightly가 엿새간 실패했다. 현재 버전을 뜻하는
 * 자리는 항상 이 상수를 참조한다(ref5-protocol-version-guard.test.mjs가 강제한다).
 */

export const REF5_PROTOCOL_VERSION = "1.6" as const;
export const REF5_LEGACY_PROTOCOL_VERSION = "1.1" as const;
/**
 * The protocols whose plans continue in place (§24.3), oldest first. Their
 * runtime state is relabelled on read, while their session snapshots keep
 * their own label: v1.4 snapshots replay with their frozen decisions, and
 * v1.4/v1.5 completions replay under the REF-space auxiliary cap they were
 * judged with (§6.4).
 */
export const REF5_CARRIED_PROTOCOL_VERSIONS = ["1.4", "1.5"] as const;
export type Ref5CarriedProtocolVersion = (typeof REF5_CARRIED_PROTOCOL_VERSIONS)[number];
/** The oldest carried protocol: the only one whose snapshot shape differs. */
export const REF5_CARRIED_PROTOCOL_VERSION = "1.4" as const;
/** The carried protocol that shares the current snapshot shape. */
export const REF5_PRIOR_PROTOCOL_VERSION = "1.5" as const;
/** The newest archived protocol. Its plans are refused, never carried (§24.3). */
export const REF5_ARCHIVED_PROTOCOL_VERSION = "1.3" as const;

/** A protocol whose plans and frozen sessions the current engine still reads. */
export type Ref5ReadableProtocolVersion =
  | typeof REF5_PROTOCOL_VERSION
  | Ref5CarriedProtocolVersion;

/** Readable protocols in birth order; a session can never predate its plan. */
const REF5_READABLE_PROTOCOL_ORDER: readonly Ref5ReadableProtocolVersion[] = [
  ...REF5_CARRIED_PROTOCOL_VERSIONS,
  REF5_PROTOCOL_VERSION,
];

export function isRef5CarriedProtocolVersion(value: unknown): value is Ref5CarriedProtocolVersion {
  return (REF5_CARRIED_PROTOCOL_VERSIONS as readonly unknown[]).includes(value);
}

export function isRef5ReadableProtocolVersion(value: unknown): value is Ref5ReadableProtocolVersion {
  return value === REF5_PROTOCOL_VERSION || isRef5CarriedProtocolVersion(value);
}

/**
 * Whether a frozen session of `sessionVersion` belongs to a plan stamped
 * `planVersion`. A plan keeps its origin stamp and collects sessions of that
 * protocol and every later readable one, so a session fits when it is not
 * older than its plan.
 */
export function isRef5SessionVersionReadableForPlan(
  sessionVersion: unknown,
  planVersion: unknown,
): boolean {
  if (!isRef5ReadableProtocolVersion(planVersion)) return false;
  if (!isRef5ReadableProtocolVersion(sessionVersion)) return false;
  return (
    REF5_READABLE_PROTOCOL_ORDER.indexOf(sessionVersion) >=
    REF5_READABLE_PROTOCOL_ORDER.indexOf(planVersion)
  );
}
