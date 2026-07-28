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

export const REF5_PROTOCOL_VERSION = "1.3" as const;
export const REF5_LEGACY_PROTOCOL_VERSION = "1.1" as const;
/** The immediately preceding protocol. v1.3 decoders reject it (§24.3). */
export const REF5_PRIOR_PROTOCOL_VERSION = "1.2" as const;
