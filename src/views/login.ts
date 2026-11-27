import { esc } from "../lib/html";

export interface LoginViewOptions {
  error?: string;
  next?: string;
}

export function loginPage(opts: LoginViewOptions = {}): string {
  const errorBlock = opts.error
    ? `<div class="notice danger" role="alert">${esc(opts.error)}</div>`
    : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>登录 · 短链接生成器</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <div class="auth-wrap">
    <form class="auth-card" method="post" action="/x7k2m9/login">
      <div class="auth-brand"><span class="dot"></span> control panel</div>
      <h1>短链接生成器</h1>
      <p class="sub">输入管理员密码以继续</p>
      ${errorBlock}
      <input type="hidden" name="next" value="${esc(opts.next ?? "/x7k2m9")}">
      <label class="field">
        <span>管理员密码</span>
        <input type="password" name="password" placeholder="••••••••" autocomplete="current-password" autofocus required>
      </label>
      <button class="primary" type="submit" style="width:100%">登录</button>
    </form>
  </div>
</body>
</html>`;
}