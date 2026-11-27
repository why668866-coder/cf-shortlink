#!/usr/bin/env node
/**
 * 更换后台路径：把项目里所有引用一起改掉，避免漏改导致 404 或泄露旧路径。
 *
 * 用法：
 *   node scripts/set-path.mjs /myHiddenPanel
 *   npm run set-path -- /myHiddenPanel
 *
 * 规则：
 *   - 必须以 / 开头
 *   - 只允许字母、数字、- 和 _，长度 3–64
 *   - 不能是保留字（index、assets、api、healthz 等）
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESERVED = new Set(["index", "assets", "api", "healthz", "favicon", "robots", "cdn-cgi", "static"]);

const raw = process.argv[2];
if (!raw) {
  console.error("用法：npm run set-path -- /yourHiddenPath");
  process.exit(1);
}
const next = raw.startsWith("/") ? raw : "/" + raw;
if (!/^\/[A-Za-z0-9_-]{3,64}$/.test(next)) {
  console.error("路径格式不对：需要以 / 开头，只含字母、数字、- 和 _，长度 3–64。");
  process.exit(1);
}
if (RESERVED.has(next.slice(1).toLowerCase())) {
  console.error(`"${next}" 是保留路径，请换一个。`);
  process.exit(1);
}

/** 从 src/index.ts 里读出当前后台路径 */
function currentPath() {
  const src = readFileSync(join(root, "src", "index.ts"), "utf8");
  const m = src.match(/app\.route\("(\/[^"]+)",\s*dashboardRoutes\)/);
  if (!m) {
    console.error("无法从 src/index.ts 里找到后台路由，请检查文件是否被改动。");
    process.exit(1);
  }
  return m[1];
}

const from = currentPath();
if (from === next) {
  console.log("后台路径没有变化：" + next);
  process.exit(0);
}

const SKIP_DIRS = new Set(["node_modules", ".wrangler", ".preview", ".git", ".dsh-pilot"]);
const EXTS = [".ts", ".mjs", ".js", ".jsonc", ".json", ".md", ".html"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

// 保留路径表里用的是去掉斜杠的裸形式（如 "x7k2m9"），要一并替换
const fromBare = from.slice(1);
const nextBare = next.slice(1);
// 只匹配保留路径表里的双引号裸形式，例如 "x7k2m9"
const barePattern = new RegExp(String.fromCharCode(34) + fromBare + String.fromCharCode(34), "g");

let changed = 0;
for (const file of walk(root)) {
  const text = readFileSync(file, "utf8");
  const withSlash = text.split(from).join(next);
  const replaced = withSlash.replace(barePattern, String.fromCharCode(34) + nextBare + String.fromCharCode(34));
  if (replaced === text) continue;
  writeFileSync(file, replaced);
  changed += 1;
  console.log("  更新 " + relative(root, file));
}

console.log("");
console.log(`✅ 后台路径：${from} → ${next}`);
console.log(`   已更新 ${changed} 个文件。记得执行 npm run deploy 让线上生效。`);