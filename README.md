# cf-shortlink

部署在 Cloudflare Workers 上的短链接服务。根路径是一个打砖块小游戏作为门面，
管理后台藏在自定义路径下，页面上不暴露任何后台入口。

## 功能

- **短链** — 随机 Base62 短码或自定义别名，302 跳转
- **后台** — 创建 / 编辑 / 启停 / 删除 / 批量删除 / 搜索 / 分页
- **统计** — 累计点击、最近访问时间
- **性能** — 跳转走 KV 缓存，未命中回源 D1 并写回
- **安全** — 单管理员密码 + HMAC 签名 Cookie、登录失败限流、仅允许 http(s) 目标、防循环跳转、全量 HTML 转义
- **门面** — `/` 是纯前端打砖块，无外链、无后台线索

## 技术栈

Workers · Hono · D1 · KV · Workers Assets，无前端构建步骤。

## 部署

需要 Node.js 18+ 和一个 Cloudflare 账号。

```bash
npm install
npx wrangler login

# 1. 创建资源，把输出的 id 填进 wrangler.jsonc
npm run db:create
npm run kv:create

# 2. 云端建表
npm run db:migrate:remote

# 3. 配置密钥
npm run set-password    # 交互式设置管理员密码（不回显）
npm run gen-secret      # 生成 SESSION_SECRET，填进 wrangler.jsonc

# 4. 部署
npm run deploy
```

部署后的三个入口：

| 路径 | 用途 |
| --- | --- |
| `/` | 打砖块小游戏（门面） |
| `/x7k2m9` | 管理后台 |
| `/<code>` | 短链跳转 |

## 修改后台路径

后台路径写在源码里，**公开仓库前请务必先换掉**：

```bash
npm run set-path -- /your-secret-path
npm run deploy
```

脚本会同步修改源码、配置、测试和文档里的所有引用，旧地址随即失效。

## 本地开发

```bash
cp .dev.vars.example .dev.vars      # 填入与线上相同的两个变量
npm run db:migrate:local
npm run dev                         # http://localhost:8787
```

## 配置

`wrangler.jsonc` 中需要填写：

| 键 | 说明 |
| --- | --- |
| `d1_databases[0].database_id` | D1 数据库 ID |
| `kv_namespaces[0].id` | KV 命名空间 ID |
| `vars.ADMIN_PASSWORD_HASH` | 管理员密码哈希，`npm run set-password` 自动写入 |
| `vars.SESSION_SECRET` | Cookie 签名密钥，`npm run gen-secret` 生成 |

不想把密钥写进文件，也可以改用：

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET
```

## 项目结构

```
src/
├── index.ts              Worker 入口与路由装配
├── db.ts                 D1 访问 + KV 缓存
├── types.ts              环境绑定与数据类型
├── lib/                  短码、URL 校验、密码、会话、转义、时间
├── middleware/auth.ts    登录校验
├── routes/dashboard.ts   后台页面与 JSON 接口
├── routes/redirect.ts    短链跳转与 404 页
└── views/                服务端渲染模板

public/
├── index.html            门面游戏（打砖块）
└── assets/style.css      后台样式

migrations/                D1 建表 SQL
scripts/                  密码哈希、设置密码、更换后台路径
```

## 备注

- 短链域名即部署域名，绑定自定义域名后自动生效，无需改代码
- 本仓库不含测试代码

## License

MIT
