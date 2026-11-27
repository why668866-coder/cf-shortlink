#!/usr/bin/env node
/**
 * 生成 ADMIN_PASSWORD_HASH（SHA-256(盐 + 密码) 的十六进制串）。
 *
 * 用法：
 *   node scripts/hash-password.mjs "你的强密码"
 *   node scripts/hash-password.mjs            # 交互式输入（不回显）
 *
 * 输出形如：
 *   ADMIN_PASSWORD_HASH = "3f1c...."
 */
import { createHash } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";

// ⚠️ 必须与 src/lib/password.ts 中的 SALT 完全一致
const SALT = "cf-shortlink::v1::";

const hash = password => createHash("sha256").update(SALT + password, "utf8").digest("hex");

function readHidden(promptText) {
  return new Promise(resolve => {
    output.write(promptText);
    input.setRawMode?.(true);
    input.resume();
    let buf = "";
    const onData = chunk => {
      const s = chunk.toString("utf8");
      for (const ch of s) {
        if (ch === "\r" || ch === "\n") {
          input.setRawMode?.(false);
          input.pause();
          input.off("data", onData);
          output.write("\n");
          resolve(buf);
          return;
        }
        if (ch === "\u0003") {
          output.write("\n");
          process.exit(1);
        }
        if (ch === "\u007f") {
          buf = buf.slice(0, -1);
          continue;
        }
        buf += ch;
      }
    };
    input.on("data", onData);
  });
}

async function main() {
  const arg = process.argv[2];
  let password = arg ?? "";
  if (!password) {
    if (!input.isTTY) {
      console.error("请把密码作为参数传入：node scripts/hash-password.mjs \"你的密码\"");
      process.exit(1);
    }
    const first = await readHidden("请输入管理员密码（输入不回显）：");
    const second = await readHidden("请再次输入确认：");
    if (first !== second) {
      console.error("\n两次输入不一致，已取消。");
      process.exit(1);
    }
    password = first;
  }
  if (password.length < 8) {
    console.error("密码太短，请至少 8 位。");
    process.exit(1);
  }
  const digest = hash(password);
  console.log("");
  console.log("把下面一行写进 wrangler.toml 的 [vars] 或 .dev.vars：");
  console.log("");
  console.log(`ADMIN_PASSWORD_HASH = "${digest}"`);
  console.log("");
  console.log("再生成一个会话签名密钥（任选一种）：");
  console.log("  node -e \"console.log(require('node:crypto').randomBytes(32).toString('hex'))\"");
  console.log("  或  openssl rand -hex 32");
}

main();
