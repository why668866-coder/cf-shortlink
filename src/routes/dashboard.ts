import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Env } from "../types";
import { loginPage } from "../views/login";
import { dashboardPage } from "../views/dashboard";
import { requireAuth } from "../middleware/auth";
import { clearSession, isAuthenticated, issueSession } from "../lib/session";
import { verifyPassword } from "../lib/password";
import { normalizeTargetUrl, shortLink } from "../lib/url";
import { normalizeAlias, randomCode, generateUniqueCode } from "../lib/code";
import { RESERVED_PATHS } from "../db";
import {
  cacheLink,
  createLink,
  deleteLink,
  deleteLinks,
  findByCode,
  findById,
  getStats,
  invalidateCache,
  listLinks,
  setEnabled,
  updateTarget,
  type ListQuery,
} from "../db";

const PAGE_SIZE = 20;

export const dashboardRoutes = new Hono<{ Bindings: Env }>();

/* ── 登录 / 登出 ─────────────────────────────────────────── */

dashboardRoutes.get("/", async c => {
  if (await isAuthenticated(c)) return c.redirect("/x7k2m9/links", 302);
  return c.html(loginPage());
});

dashboardRoutes.post(
  "/login",
  bodyLimit({ maxSize: 8 * 1024, onError: c => c.html(loginPage({ error: "请求体过大" }), 413) }),
  async c => {
    const form = await c.req.parseBody();
    const password = typeof form.password === "string" ? form.password : "";
    const nextRaw = typeof form.next === "string" ? form.next : "";
    const next = nextRaw.startsWith("/x7k2m9") && !nextRaw.startsWith("//") ? nextRaw : "/x7k2m9/links";

    const expected = c.env.ADMIN_PASSWORD_HASH;
    if (!expected || expected.startsWith("REPLACE_WITH")) {
      return c.html(loginPage({ error: "服务端未配置 ADMIN_PASSWORD_HASH，请先按 README 完成部署配置。" }), 500);
    }
    if (!password) {
      return c.html(loginPage({ error: "请输入密码" }));
    }
    if (!(await verifyPassword(password, expected))) {
      if (await isRateLimited(c.env.SL_CACHE, c.req.header("cf-connecting-ip") ?? "unknown")) {
        return c.html(loginPage({ error: "尝试次数过多，请稍后再试。" }), 429);
      }
      return c.html(loginPage({ error: "密码错误" }), 401);
    }

    await issueSession(c);
    return c.redirect(next, 303);
  },
);

dashboardRoutes.post("/logout", c => {
  clearSession(c);
  return c.redirect("/x7k2m9", 303);
});

/* ── 后台页面 ───────────────────────────────────────────── */

dashboardRoutes.get("/links", requireAuth, async c => {
  const origin = new URL(c.req.url).origin;
  const url = new URL(c.req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const sortRaw = url.searchParams.get("sort") ?? "newest";
  const sort: ListQuery["sort"] = (["newest", "oldest", "clicks", "code"] as const).includes(sortRaw as ListQuery["sort"])
    ? (sortRaw as ListQuery["sort"])
    : "newest";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const [listResult, stats] = await Promise.all([
    listLinks(c.env.DB, { q, page, pageSize: PAGE_SIZE, sort }),
    getStats(c.env.DB),
  ]);

  return c.html(
    dashboardPage({
      origin,
      rows: listResult.rows,
      total: listResult.total,
      page,
      pageSize: PAGE_SIZE,
      query: q,
      sort,
      stats,
    }),
  );
});

/* ── 后台 JSON API（仅后台页面使用；对外 API 请在此基础上加 Token 鉴权） ── */

const api = new Hono<{ Bindings: Env }>();

api.use(bodyLimit({ maxSize: 64 * 1024, onError: c => c.json({ ok: false, error: "请求体过大" }, 413) }));

api.post("/links", async c => {
  if (!(await isAuthenticated(c))) return c.json({ ok: false, error: "未登录或登录已过期" }, 401);

  let payload: { url?: unknown; alias?: unknown; title?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "请求体必须是 JSON" }, 400);
  }

  const origin = new URL(c.req.url).origin;
  const target = normalizeTargetUrl(typeof payload.url === "string" ? payload.url : null, origin);
  if (!target.ok) return c.json({ ok: false, error: target.error }, 400);

  const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 200) : "";

  let code: string;
  if (payload.alias !== undefined && payload.alias !== null && String(payload.alias).trim() !== "") {
    const alias = normalizeAlias(String(payload.alias));
    if (!alias) {
      return c.json({ ok: false, error: "自定义短码只能包含字母、数字、- 和 _，长度 2–64" }, 400);
    }
    if (RESERVED_PATHS.has(alias.toLowerCase())) {
      return c.json({ ok: false, error: `"${alias}" 是保留路径，请换一个` }, 409);
    }
    if (await findByCode(c.env.DB, alias)) {
      return c.json({ ok: false, error: `短码 "${alias}" 已被占用` }, 409);
    }
    code = alias;
  } else {
    code = await generateUniqueCode(c.env.DB, c.env.SL_CACHE, candidate => RESERVED_PATHS.has(candidate.toLowerCase()));
  }

  try {
    const row = await createLink(c.env.DB, { code, target_url: target.url, title });
    await cacheLink(c.env.SL_CACHE, row);
    return c.json({ ok: true, link: shortLink(origin, row.code), code: row.code, row }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE/i.test(msg)) {
      return c.json({ ok: false, error: "短码已存在，请重试" }, 409);
    }
    throw err;
  }
});

api.patch("/links/:id", async c => {
  if (!(await isAuthenticated(c))) return c.json({ ok: false, error: "未登录或登录已过期" }, 401);

  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ ok: false, error: "无效的链接 ID" }, 400);

  let payload: { url?: unknown; enabled?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "请求体必须是 JSON" }, 400);
  }

  const existing = await findById(c.env.DB, id);
  if (!existing) return c.json({ ok: false, error: "链接不存在" }, 404);

  let row = existing;
  if (payload.url !== undefined) {
    const origin = new URL(c.req.url).origin;
    const target = normalizeTargetUrl(typeof payload.url === "string" ? payload.url : null, origin);
    if (!target.ok) return c.json({ ok: false, error: target.error }, 400);
    const updated = await updateTarget(c.env.DB, id, target.url, null);
    if (updated) row = updated;
  }
  if (payload.enabled !== undefined) {
    const updated = await setEnabled(c.env.DB, id, Boolean(payload.enabled));
    if (updated) row = updated;
  }

  await cacheLink(c.env.SL_CACHE, row);
  return c.json({ ok: true, row });
});

api.delete("/links/:id", async c => {
  if (!(await isAuthenticated(c))) return c.json({ ok: false, error: "未登录或登录已过期" }, 401);

  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ ok: false, error: "无效的链接 ID" }, 400);

  const row = await deleteLink(c.env.DB, id);
  if (!row) return c.json({ ok: false, error: "链接不存在" }, 404);
  await invalidateCache(c.env.SL_CACHE, row.code);
  return c.json({ ok: true, code: row.code });
});

api.delete("/links", async c => {
  if (!(await isAuthenticated(c))) return c.json({ ok: false, error: "未登录或登录已过期" }, 401);

  let payload: { ids?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "请求体必须是 JSON" }, 400);
  }
  const ids = Array.isArray(payload.ids)
    ? payload.ids.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0)
    : [];
  if (ids.length === 0) return c.json({ ok: false, error: "请选择要删除的链接" }, 400);
  if (ids.length > 200) return c.json({ ok: false, error: "单次最多删除 200 条" }, 400);

  const codes = await deleteLinks(c.env.DB, ids);
  await Promise.all(codes.map(code => invalidateCache(c.env.SL_CACHE, code)));
  return c.json({ ok: true, deleted: codes.length, codes });
});

dashboardRoutes.route("/api", api);

/** 旧地址兼容：/x7k2m9 的其它子路径一律回列表页。 */
dashboardRoutes.get("/*", async c => {
  if (await isAuthenticated(c)) return c.redirect("/x7k2m9/links", 302);
  return c.redirect("/x7k2m9", 302);
});

/** 登录失败限流：同一 IP 每 10 分钟最多 10 次失败。 */
async function isRateLimited(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = `login-fail:${ip}`;
  const current = Number(await kv.get(key)) || 0;
  if (current >= 10) return true;
  await kv.put(key, String(current + 1), { expirationTtl: 600 });
  return false;
}