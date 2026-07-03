/**
 * Password hashing using Web Crypto API PBKDF2 (Edge runtime 호환).
 *
 * Format: pbkdf2$<iterations>$<saltBase64>$<hashBase64>
 * - 외부 의존성 없음 (bcrypt 등 안 씀)
 * - 600k iterations + 16-byte salt + 32-byte SHA-256 derived key
 *
 * iteration 수는 각 해시에 임베드된다 → verifyPassword가 저장값 기준으로 검증하므로 구/신
 * 해시가 공존해도 안전하고, 로그인 시 passwordNeedsRehash로 점진적 업그레이드가 가능하다.
 */

// OWASP 2023 권고치(PBKDF2-HMAC-SHA256). 이전 250k에서 상향 — 기존 해시는 로그인 시 재해시로 승격.
const ITERATIONS = 600_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const HASH_NAME = "SHA-256";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const saltBuf = new Uint8Array(salt).buffer as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuf,
      iterations,
      hash: HASH_NAME,
    },
    key,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await deriveBits(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/**
 * 저장된 해시가 현재 정책(ITERATIONS)보다 약하면 true → 로그인 성공 시 재해시 대상.
 * verifyPassword가 성공한 뒤에만 호출되므로(유효 pbkdf2 해시 보장) 실제로는 iteration 비교가 핵심.
 * 파싱 불가/미지 포맷은 방어적으로 재해시 대상으로 본다.
 */
export function passwordNeedsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return true;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations)) return true;
  return iterations < ITERATIONS;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const got = await deriveBits(password, salt, iterations);
  if (got.length !== expected.length) return false;
  // 상수 시간 비교
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}
