import { Hono } from "hono";
import type { Env, LinkCacheValue } from "../types";
import { cacheKey, findByCode, RESERVED_PATHS } from "../db";

const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const redirectRoutes = new Hono<{ Bindings: Env }>();

/** 单路径短链跳转：GET /:code */
redirectRoutes.get("/:code", async c => {
  const code = c.req.param("code");

  if (!CODE_RE.test(code) || RESERVED_PATHS.has(code.toLowerCase())) {
    return notFoundPage(c.req.raw);
  }

  // 1) 先查 KV 缓存（绝大多数请求走这里，几乎零延迟）
  let cached: LinkCacheValue | null = null;
  const raw = await c.env.SL_CACHE.get(cacheKey(code));
  if (raw) {
    try {
      cached = JSON.parse(raw) as LinkCacheValue;
    } catch {
      cached = null;
    }
  }

  let target: string | null = null;
  if (cached) {
    target = cached.enabled ? cached.target_url : null;
  } else {
    // 2) 缓存未命中：回源 D1 并写回缓存
    const row = await findByCode(c.env.DB, code);
    if (!row) return notFoundPage(c.req.raw);
    await c.env.SL_CACHE.put(
      cacheKey(code),
      JSON.stringify({ target_url: row.target_url, enabled: row.enabled === 1, code: row.code }),
      { expirationTtl: 86_400 },
    );
    target = row.enabled === 1 ? row.target_url : null;
  }

  if (!target) return notFoundPage(c.req.raw, "该短链接已被停用");

  // 3) 计数（不阻塞跳转）
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `UPDATE links
          SET clicks = clicks + 1,
              last_clicked = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE code = ?1 AND enabled = 1`,
    )
      .bind(code)
      .run()
      .catch(() => {
        /* 统计失败不影响跳转 */
      }),
  );

  return c.redirect(target, 302);
});

function notFoundPage(request: Request, message = "页面不存在或链接已失效"): Response {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json")) {
    return Response.json({ ok: false, error: message }, { status: 404 });
  }
  const safe = message.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch));
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#080b12">
<title>404 · 页面不存在</title>
<style>
  :root { --bg:#080b12; --line:#1e2637; --text:#e8eefc; --dim:#7d8aa3; --accent:#5eead4; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; display: grid; place-items: center; padding: 24px;
    background:
      radial-gradient(900px 500px at 50% -10%, #16233c 0%, transparent 65%),
      var(--bg);
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card { text-align: center; max-width: 380px; }
  .code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 64px; font-weight: 700; letter-spacing: .12em;
    color: transparent;
    background: linear-gradient(180deg, #ffffff 0%, #5eead4 120%);
    -webkit-background-clip: text; background-clip: text;
    line-height: 1; margin-bottom: 14px;
  }
  p { color: var(--dim); font-size: 14px; line-height: 1.8; margin: 0 0 22px; }
  a.btn {
    display: inline-block; padding: 10px 26px; border-radius: 10px;
    background: var(--accent); color: #04211d;
    font-weight: 700; text-decoration: none; letter-spacing: .04em;
    box-shadow: 0 8px 24px rgba(94,234,212,.22);
    transition: transform .12s ease, background .12s ease;
  }
  a.btn:hover { transform: translateY(-1px); background: #6ff2dd; }
</style>
</head>
<body>
  <div class="card">
    <div class="code">404</div>
    <p>${safe}</p>
    <a class="btn" href="/">返回首页</a>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
