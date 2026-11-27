import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";

export const SESSION_COOKIE = "sl_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 小时

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

interface SessionPayload {
  sub: "admin";
  exp: number;
  iat: number;
}

/** 签发 Cookie：payload.signature（base64url，均不含 '='）。 */
export async function issueSession(c: Context<{ Bindings: Env }>): Promise<void> {
  const secret = c.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET 未配置或长度不足 16 位");
  }
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub: "admin", iat: now, exp: now + SESSION_TTL_SECONDS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await sign(secret, body);
  setCookie(c, SESSION_COOKIE, `${body}.${sig}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSession(c: Context<{ Bindings: Env }>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** 校验当前请求是否为有效的管理员会话。 */
export async function isAuthenticated(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const secret = c.env.SESSION_SECRET;
  if (!secret || secret.length < 16) return false;
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return false;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!body || !sig) return false;

  const expected = await sign(secret, body);
  // 签名长度固定，先比长度再逐字节比较
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return false;

  try {
    const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as SessionPayload;
    if (payload.sub !== "admin") return false;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
