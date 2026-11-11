import { sha256Hex } from "./token";

/**
 * `auth_session.token` 컬럼에 저장하는 값의 형식.
 *
 * 세션 토큰은 쿠키에만 원문으로 있고 DB에는 `sha256:<hex>`로 저장한다. DB 사본(백업·덤프·
 * 읽기 권한 유출) 하나가 곧 활성 세션 전부의 탈취가 되지 않게 하려는 것이다.
 *
 * **접두사가 방어의 일부다.** 전환기에는 예전에 평문으로 저장된 행도 받아야 하는데
 * (아래 `sessionTokenCandidates`), 해시를 접두사 없이 64자리 hex로 저장하면 유출된 해시를
 * 그대로 쿠키에 넣었을 때 "평문 행"으로 일치해 버린다. 접두사가 있으면 저장된 해시는
 * 평문 토큰 형식(64자리 hex)과 겹칠 수 없다.
 */
const STORED_PREFIX = "sha256:";

/** 평문으로 저장되던 시절의 토큰 형식. `generateToken()`이 만드는 32바이트 hex다. */
const LEGACY_PLAINTEXT_PATTERN = /^[0-9a-f]{64}$/;

/** 쿠키의 원문 토큰을 DB 저장값으로 바꾼다. */
export async function storedSessionToken(token: string): Promise<string> {
  return `${STORED_PREFIX}${await sha256Hex(token)}`;
}

export function isStoredSessionTokenHashed(stored: string): boolean {
  return stored.startsWith(STORED_PREFIX);
}

/**
 * 쿠키 토큰과 일치할 수 있는 `auth_session.token` 값들. 첫 번째가 항상 해시 저장값이다.
 *
 * 두 번째(평문)는 전환 전에 만들어진 세션을 끊지 않으려고 받는다. 평문 행은 조회될 때
 * 해시로 바뀌고(`findActiveSession`), 안 쓰이면 idle 만료로 사라진다. 세션 절대 상한
 * (`SESSION_ABSOLUTE_MAX_MS`, 180일)이 지나면 평문 행은 남을 수 없으므로 이 분기를 지운다.
 */
export async function sessionTokenCandidates(token: string): Promise<string[]> {
  if (!token) return [];
  const candidates = [await storedSessionToken(token)];
  if (LEGACY_PLAINTEXT_PATTERN.test(token)) candidates.push(token);
  return candidates;
}

/** 세션 목록의 마스킹 표시에 쓸 값. 저장 형식의 접두사는 사용자에게 의미가 없어 뗀다. */
export function sessionTokenDisplayValue(stored: string): string {
  return isStoredSessionTokenHashed(stored) ? stored.slice(STORED_PREFIX.length) : stored;
}
