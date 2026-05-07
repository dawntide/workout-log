const TOKEN_BYTE_LENGTH = 32;

export type AuthTokenPair = {
  token: string;
  tokenHash: string;
};

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

export async function generateAuthTokenPair(): Promise<AuthTokenPair> {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTE_LENGTH));
  const token = bytesToHex(bytes);
  const tokenHash = await sha256Hex(token);
  return { token, tokenHash };
}
