#!/usr/bin/env node
/**
 * 交互式设置管理员密码：输入不回显、无需在命令行或聊天里留下明文，
 * 直接写入 wrangler.jsonc 的 vars.ADMIN_PASSWORD_HASH。
 *
 * 用法：npm run set-password
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stdin, stdout } from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "wrangler.jsonc");
const SALT = "cf-shortlink::v1::";

function ask(promptText) {
  return new Promise((resolve) => {
    stdout.write(promptText);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    let buf = "";
    const onData = (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode?.(wasRaw ?? false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(buf);
          return;
        }
        if (ch === "\u0003") {
          stdout.write("\n已取消。\n");
          process.exit(1);
        }
        if (ch === "\u007f" || ch === "\b") {
          buf = buf.slice(0, -1);
          continue;
        }
        buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await ask("请输入新的管理员密码（输入不回显）：");
if (password.length < 8) {
  console.error("密码太短，至少 8 位。");
  process.exit(1);
}
const confirm = await ask("请再输入一次确认：");
if (password !== confirm) {
  console.error("两次输入不一致，已取消。");
  process.exit(1);
}

const hash = createHash("sha256").update(SALT + password, "utf8").digest("hex");
const config = readFileSync(configPath, "utf8");
const re = /("ADMIN_PASSWORD_HASH"\s*:\s*")([^"]*)(")/;
if (!re.test(config)) {
  console.error("在 wrangler.jsonc 中找不到 ADMIN_PASSWORD_HASH 字段。");
  process.exit(1);
}
writeFileSync(configPath, config.replace(re, `$1${hash}$3`));

console.log("");
console.log("✅ 已写入 wrangler.jsonc：");
console.log("   ADMIN_PASSWORD_HASH = " + hash.slice(0, 12) + "…");
console.log("");
console.log("下一步：npm run deploy");
