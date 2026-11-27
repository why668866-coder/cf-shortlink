import { esc } from "../lib/html";
import { formatNumber, formatTime } from "../lib/time";
import { shortLink } from "../lib/url";
import type { Stats } from "../db";
import type { LinkRow } from "../types";

export interface DashboardViewOptions {
  origin: string;
  rows: LinkRow[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  sort: string;
  stats: Stats;
}

function rowHtml(origin: string, row: LinkRow): string {
  const link = shortLink(origin, row.code);
  const enabled = row.enabled === 1;
  return `<tr data-id="${row.id}" data-code="${esc(row.code)}">
  <td><input type="checkbox" data-check title="选择"></td>
  <td class="code-cell">
    <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">/${esc(row.code)}</a>
  </td>
  <td class="url-cell">
    <span class="u" title="${esc(row.target_url)}">${esc(row.target_url)}</span>
    ${row.title ? `<span class="tail">${esc(row.title)}</span>` : ""}
  </td>
  <td>
    <span class="badge ${enabled ? "on" : "off"}">${enabled ? "启用" : "停用"}</span>
  </td>
  <td class="num">${formatNumber(row.clicks)}</td>
  <td class="tail">${esc(formatTime(row.last_clicked))}</td>
  <td class="tail">${esc(formatTime(row.created_at))}</td>
  <td class="actions">
    <button class="sm ghost" data-act="copy" data-link="${esc(link)}" title="复制短链">复制</button>
    <button class="sm ghost" data-act="edit" title="编辑目标地址">编辑</button>
    <button class="sm ghost" data-act="toggle" title="${enabled ? "停用" : "启用"}">${enabled ? "停用" : "启用"}</button>
    <button class="sm danger" data-act="delete" title="删除">删除</button>
  </td>
</tr>`;
}

export function dashboardPage(opts: DashboardViewOptions): string {
  const { origin, rows, total, page, pageSize, query, sort, stats } = opts;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const body = rows.length
    ? rows.map(r => rowHtml(origin, r)).join("\n")
    : `<tr><td colspan="8"><div class="empty">还没有短链接，在上方输入目标地址创建第一条吧。</div></td></tr>`;

  const qs = (p: number) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (sort && sort !== "newest") sp.set("sort", sort);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return "/x7k2m9" + (s ? `?${s}` : "");
  };

  const sortOptions = [
    ["newest", "最新创建"],
    ["oldest", "最早创建"],
    ["clicks", "点击最多"],
    ["code", "按短码"],
  ]
    .map(([v, label]) => `<option value="${v}"${sort === v ? " selected" : ""}>${label}</option>`)
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>短链接生成器</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <header class="topbar">
    <div class="brand"><span class="dot"></span> 短链接生成器</div>
    <span class="who">管理台</span>
    <div class="spacer"></div>
    <form method="post" action="/x7k2m9/logout" style="margin:0">
      <button class="sm ghost" type="submit">退出登录</button>
    </form>
  </header>

  <main class="page">
    <section class="stats">
      <div class="stat"><div class="k">链接总数</div><div class="v">${formatNumber(stats.total)}</div></div>
      <div class="stat"><div class="k">启用中</div><div class="v accent">${formatNumber(stats.enabled)}</div></div>
      <div class="stat"><div class="k">已停用</div><div class="v">${formatNumber(stats.disabled)}</div></div>
      <div class="stat"><div class="k">累计点击</div><div class="v">${formatNumber(stats.clicks)}</div></div>
      <div class="stat"><div class="k">近 7 天活跃链接点击</div><div class="v">${formatNumber(stats.clicks7d)}</div></div>
    </section>

    <section class="panel" style="margin-bottom:20px">
      <div class="panel-head"><h2>新建短链接</h2></div>
      <div class="panel-body">
        <form class="create" id="create-form" autocomplete="off">
          <label class="field grow2" style="margin:0; grid-column: 1 / -1">
            <span>目标地址</span>
            <input type="text" name="url" placeholder="https://example.com/very/long/path?utm=..." required>
          </label>
          <label class="field" style="margin:0">
            <span>自定义短码（可选）</span>
            <input type="text" name="alias" placeholder="留空随机" pattern="[A-Za-z0-9_-]{2,64}" maxlength="64">
          </label>
          <label class="field" style="margin:0">
            <span>备注（可选）</span>
            <input type="text" name="title" placeholder="方便自己认" maxlength="120">
          </label>
          <button class="primary create-btn" type="submit">创建</button>
        </form>
        <div id="create-result" class="notice hidden" style="margin:14px 0 0"></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>全部链接</h2>
        <div class="spacer"></div>
        <span class="tail">共 ${formatNumber(total)} 条</span>
      </div>

      <div class="toolbar">
        <form class="search-form" method="get" action="/x7k2m9">
          <input type="search" name="q" value="${esc(query)}" placeholder="搜索短码 / 地址 / 备注">
          <select name="sort">${sortOptions}</select>
          <button type="submit">搜索</button>
          ${query ? `<a class="btn ghost" href="/x7k2m9">清除</a>` : ""}
        </form>
        <div class="spacer"></div>
        <button class="sm danger" id="bulk-delete" disabled>删除选中</button>
        <span class="tail" id="sel-info"></span>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:36px"><input type="checkbox" id="check-all" title="全选"></th>
              <th style="width:130px">短码</th>
              <th>目标地址</th>
              <th style="width:80px">状态</th>
              <th style="width:90px">点击</th>
              <th style="width:140px">最近访问</th>
              <th style="width:140px">创建时间</th>
              <th style="width:230px; text-align:right">操作</th>
            </tr>
          </thead>
          <tbody id="rows">
${body}
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span>共 ${formatNumber(total)} 条${total ? `，第 ${from}–${to} 条` : ""} · 第 ${page}/${pages} 页</span>
        <div class="btns">
          ${page > 1 ? `<a class="btn sm" href="${esc(qs(page - 1))}">上一页</a>` : `<button class="sm" disabled>上一页</button>`}
          ${page < pages ? `<a class="btn sm" href="${esc(qs(page + 1))}">下一页</a>` : `<button class="sm" disabled>下一页</button>`}
        </div>
      </div>
    </section>
  </main>

  <script>
  (() => {
    "use strict";

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const rowsBody = $("#rows");
    const result = $("#create-result");

    function flash(message, kind = "ok") {
      result.textContent = message;
      result.className = "notice" + (kind === "error" ? " danger" : "");
      result.style.margin = "14px 0 0";
      clearTimeout(flash._t);
      flash._t = setTimeout(() => result.classList.add("hidden"), 6000);
    }

    async function api(method, path, body) {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin",
      });
      let data = null;
      try { data = await res.json(); } catch { /* ignore */ }
      if (res.status === 401) {
        location.href = "/x7k2m9";
        throw new Error("登录已过期");
      }
      if (!res.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || ("请求失败：" + res.status));
      }
      return data;
    }

    /* ── 新建 ─────────────────────────────────────────── */
    const createForm = $("#create-form");
    createForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const submit = createForm.querySelector("button[type=submit]");
      const fd = new FormData(createForm);
      submit.disabled = true;
      try {
        const data = await api("POST", "/x7k2m9/api/links", {
          url: fd.get("url"),
          alias: fd.get("alias") || undefined,
          title: fd.get("title") || undefined,
        });
        const link = data.link;
        try { await navigator.clipboard.writeText(link); } catch { /* 忽略 */ }
        flash("已创建并复制：" + link);
        createForm.reset();
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        flash(err.message, "error");
      } finally {
        submit.disabled = false;
      }
    });

    /* ── 行操作（事件委托） ───────────────────────────── */
    rowsBody.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button[data-act]");
      if (!btn) return;
      const tr = btn.closest("tr");
      if (!tr) return;
      const id = Number(tr.dataset.id);
      const act = btn.dataset.act;

      try {
        if (act === "copy") {
          const link = btn.dataset.link;
          try { await navigator.clipboard.writeText(link); } catch { window.prompt("复制短链：", link); }
          const old = btn.textContent;
          btn.textContent = "已复制";
          btn.classList.add("copy-ok");
          setTimeout(() => { btn.textContent = old; btn.classList.remove("copy-ok"); }, 1200);
          return;
        }

        if (act === "edit") {
          const current = tr.querySelector(".u").textContent.trim();
          const next = window.prompt("修改目标地址：", current);
          if (next === null) return;
          if (next.trim() === current) return;
          await api("PATCH", "/x7k2m9/api/links/" + id, { url: next.trim() });
          flash("已更新目标地址");
          setTimeout(() => location.reload(), 400);
          return;
        }

        if (act === "toggle") {
          const isOn = tr.querySelector(".badge").classList.contains("on");
          await api("PATCH", "/x7k2m9/api/links/" + id, { enabled: !isOn });
          flash(isOn ? "已停用该短链" : "已启用该短链");
          setTimeout(() => location.reload(), 400);
          return;
        }

        if (act === "delete") {
          if (!window.confirm("确定删除 /" + tr.dataset.code + " ？此操作不可撤销。")) return;
          await api("DELETE", "/x7k2m9/api/links/" + id);
          flash("已删除 /" + tr.dataset.code);
          setTimeout(() => location.reload(), 400);
        }
      } catch (err) {
        flash(err.message, "error");
      }
    });

    /* ── 多选与批量删除 ───────────────────────────────── */
    const checkAll = $("#check-all");
    const bulkBtn = $("#bulk-delete");
    const selInfo = $("#sel-info");
    const boxes = () => $$('input[data-check]', rowsBody);

    function refreshSelection() {
      const selected = boxes().filter(b => b.checked).length;
      bulkBtn.disabled = selected === 0;
      selInfo.textContent = selected ? "已选 " + selected + " 条" : "";
      if (checkAll) checkAll.checked = selected > 0 && selected === boxes().length;
    }

    if (checkAll) {
      checkAll.addEventListener("change", () => {
        for (const b of boxes()) b.checked = checkAll.checked;
        refreshSelection();
      });
    }
    rowsBody.addEventListener("change", (ev) => {
      if (ev.target.matches("input[data-check]")) refreshSelection();
    });

    bulkBtn.addEventListener("click", async () => {
      const ids = boxes().filter(b => b.checked).map(b => Number(b.closest("tr").dataset.id));
      if (!ids.length) return;
      if (!window.confirm("确定删除选中的 " + ids.length + " 条链接？此操作不可撤销。")) return;
      bulkBtn.disabled = true;
      try {
        await api("DELETE", "/x7k2m9/api/links", { ids });
        flash("已删除 " + ids.length + " 条链接");
        setTimeout(() => location.reload(), 400);
      } catch (err) {
        flash(err.message, "error");
        bulkBtn.disabled = false;
      }
    });

    refreshSelection();
  })();
  </script>
</body>
</html>`;
}