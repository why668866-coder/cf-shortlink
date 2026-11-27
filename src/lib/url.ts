const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * 校验并规范化目标 URL。
 * - 只接受 http / https，以及缺省协议时补 https://
 * - 拒绝 javascript: / data: / file: 等危险协议
 * - 拒绝指向自身跳转域名的地址（防止死循环）
 */
export function normalizeTargetUrl(
  raw: string | null | undefined,
  origin: string,
): { ok: true; url: string } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: "目标地址不能为空" };
  let value = raw.trim();
  if (!value) return { ok: false, error: "目标地址不能为空" };
  if (value.length > 2048) return { ok: false, error: "目标地址过长（上限 2048 字符）" };

  if (!SCHEME_RE.test(value)) {
    // 形如 example.com/path，补全协议
    value = "https://" + value.replace(/^\/+/, "");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "目标地址格式不正确" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "只支持 http / https 链接" };
  }
  if (!parsed.hostname) return { ok: false, error: "目标地址缺少域名" };

  // 循环跳转检测
  let originHost = "";
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    /* ignore */
  }
  if (originHost && parsed.host.toLowerCase() === originHost) {
    return { ok: false, error: "目标地址不能指向本站域名（会引起循环跳转）" };
  }

  return { ok: true, url: parsed.toString() };
}

/** 展示用短链：https://host/code */
export function shortLink(origin: string, code: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}/${code}`;
}
