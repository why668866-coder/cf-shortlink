-- 短链接表
CREATE TABLE IF NOT EXISTS links (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT    NOT NULL UNIQUE,              -- 短码（大小写敏感）
  target_url   TEXT    NOT NULL,                     -- 目标地址
  title        TEXT    NOT NULL DEFAULT '',          -- 备注/标题
  enabled      INTEGER NOT NULL DEFAULT 1,           -- 1 启用 / 0 停用
  clicks       INTEGER NOT NULL DEFAULT 0,           -- 累计点击
  last_clicked TEXT,                                 -- 最近访问时间（ISO8601）
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_links_created ON links (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_target  ON links (target_url);
