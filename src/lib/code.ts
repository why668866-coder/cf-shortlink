const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const RANDOM_LEN = 6;
const MAX_ATTEMPTS = 10;

/** 密码学安全的随机短码（Base62）。 */
export function randomCode(len = RANDOM_LEN): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += BASE62[bytes[i]! % 62];
  return out;
}

/**
 * 用户自定义别名校验：只允许字母数字、- 和 _，长度 2-64。
 * 返回规范化后的值，非法返回 null。
 */
export function normalizeAlias(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const alias = raw.trim();
  if (!alias) return null;
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(alias)) return null;
  return alias;
}

/** 生成一个数据库和 KV 中都不存在的短码。 */
export async function generateUniqueCode(
  db: D1Database,
  kv: KVNamespace,
  isReserved: (code: string) => boolean,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode(RANDOM_LEN + (attempt > 4 ? 1 : 0));
    if (isReserved(code)) continue;
    const exists = await db.prepare("SELECT 1 AS x FROM links WHERE code = ?1").bind(code).first();
    if (exists) continue;
    // KV 里可能残留旧缓存（例如手工删库后的孤儿键），一并跳过
    const cached = await kv.get(`link:${code}`);
    if (cached === null) return code;
  }
  // 极端情况：退化为更长的随机码
  return randomCode(RANDOM_LEN + 4);
}
