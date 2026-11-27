import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./types";
import { dashboardRoutes } from "./routes/dashboard";
import { redirectRoutes } from "./routes/redirect";

const app = new Hono<{ Bindings: Env }>();

/* 安全响应头（HSTS 交给 Cloudflare 的 SSL 设置，避免本地 http 调试受影响） */
app.use(
  "*",
  secureHeaders({
    strictTransportSecurity: false,
    xContentTypeOptions: true,
    referrerPolicy: "no-referrer",
    xFrameOptions: "DENY",
  }),
);

/* 静态资源（public/ 目录） */
app.get("/assets/*", c => c.env.ASSETS.fetch(c.req.raw));

/* 后台 */
app.route("/x7k2m9", dashboardRoutes);

/* 健康检查 */
app.get("/healthz", c => c.text("ok"));

/* 根路径：打砖块小游戏（对外门面，不暴露后台） */
app.get("/", c => c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url), c.req.raw)));

/* 短链跳转（放在最后，避免吞掉上面的路由） */
app.route("/", redirectRoutes);

/* 其余路径：交给静态资源；不存在时返回 JSON 404 */
app.all("*", async c => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status !== 404) return asset;
  return c.json({ ok: false, error: "not found" }, 404);
});

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/x7k2m9") && (c.req.header("accept") ?? "").includes("text/html")) {
    return c.html(
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>出错了</title>
       <link rel="stylesheet" href="/assets/style.css"></head>
       <body><div class="auth-wrap"><div class="auth-card"><h1>500</h1>
       <p class="sub">服务器内部错误，请查看 Worker 日志。</p></div></div></body></html>`,
      500,
    );
  }
  return c.json({ ok: false, error: "internal error" }, 500);
});

export default app;