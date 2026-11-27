const SALT = "cf-shortlink::v1::";
const HEX_RE = /^[0-9a-f]{64}$/;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256(盐 + 密码) 的十六进制表示，与 scripts/hash-password.mjs 保持一致。 */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

/** 常量时间比较，避免时序侧信道。 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, expectedHash: string): Promise<boolean> {
  const hash = (expectedHash ?? "").trim().toLowerCase();
  if (!HEX_RE.test(hash)) return false;
  const actual = await sha256Hex(SALT + password);
  return timingSafeEqual(actual, hash);
}

/** 给 CLI 脚本与部署自检复用。 */
export const PASSWORD_SALT = SALT;
