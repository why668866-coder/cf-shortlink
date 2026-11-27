import type { LinkRow } from "./types";

export const RESERVED_PATHS = new Set([
  "x7k2m9",
  "api",
  "assets",
  "favicon.ico",
  "robots.txt",
  "healthz",
  "cdn-cgi",
]);

const CACHE_TTL = 60 * 60 * 24; // KV 缓存 24 小时；写操作会主动失效

export interface LinkInput {
  code: string;
  target_url: string;
  title: string;
}

export function cacheKey(code: string): string {
  return `link:${code}`;
}

/** 读取单条（按短码）。 */
export async function findByCode(db: D1Database, code: string): Promise<LinkRow | null> {
  return db.prepare("SELECT * FROM links WHERE code = ?1").bind(code).first<LinkRow>();
}

/** 读取单条（按 id）。 */
export async function findById(db: D1Database, id: number): Promise<LinkRow | null> {
  return db.prepare("SELECT * FROM links WHERE id = ?1").bind(id).first<LinkRow>();
}

export async function createLink(db: D1Database, input: LinkInput): Promise<LinkRow> {
  const row = await db
    .prepare(
      `INSERT INTO links (code, target_url, title)
       VALUES (?1, ?2, ?3)
       RETURNING *`,
    )
    .bind(input.code, input.target_url, input.title)
    .first<LinkRow>();
  if (!row) throw new Error("创建失败：数据库未返回记录");
  return row;
}

export async function updateTarget(db: D1Database, id: number, targetUrl: string, title: string | null): Promise<LinkRow | null> {
  return db
    .prepare(
      `UPDATE links
          SET target_url = ?1,
              title = COALESCE(?2, title),
              updated_at = datetime('now')
        WHERE id = ?3
        RETURNING *`,
    )
    .bind(targetUrl, title, id)
    .first<LinkRow>();
}

export async function setEnabled(db: D1Database, id: number, enabled: boolean): Promise<LinkRow | null> {
  return db
    .prepare(`UPDATE links SET enabled = ?1, updated_at = datetime('now') WHERE id = ?2 RETURNING *`)
    .bind(enabled ? 1 : 0, id)
    .first<LinkRow>();
}

export async function deleteLink(db: D1Database, id: number): Promise<LinkRow | null> {
  return db.prepare("DELETE FROM links WHERE id = ?1 RETURNING *").bind(id).first<LinkRow>();
}

export async function deleteLinks(db: D1Database, ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  const rows = await db
    .prepare(`DELETE FROM links WHERE id IN (${placeholders}) RETURNING code`)
    .bind(...ids)
    .all<{ code: string }>();
  return (rows.results ?? []).map(r => r.code);
}

export interface ListQuery {
  q: string;
  page: number;
  pageSize: number;
  sort: "newest" | "oldest" | "clicks" | "code";
}

const SORT_SQL: Record<ListQuery["sort"], string> = {
  newest: "created_at DESC, id DESC",
  oldest: "created_at ASC, id ASC",
  clicks: "clicks DESC, id DESC",
  code: "code ASC",
};

export interface ListResult {
  rows: LinkRow[];
  total: number;
}

export async function listLinks(db: D1Database, query: ListQuery): Promise<ListResult> {
  const where: string[] = [];
  const binds: string[] = [];
  if (query.q) {
    where.push("(target_url LIKE ?1 OR title LIKE ?1 OR code LIKE ?1)");
    binds.push(`%${query.q.replace(/[\\%_]/g, m => "\\" + m)}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = SORT_SQL[query.sort] ?? SORT_SQL.newest;
  const offset = (query.page - 1) * query.pageSize;

  const [countRow, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total FROM links ${whereSql}`).bind(...binds).first<{ total: number }>(),
    db
      .prepare(`SELECT * FROM links ${whereSql} ORDER BY ${orderSql} LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`)
      .bind(...binds, query.pageSize, offset)
      .all<LinkRow>(),
  ]);

  return { rows: rows.results ?? [], total: countRow?.total ?? 0 };
}

export interface Stats {
  total: number;
  enabled: number;
  disabled: number;
  clicks: number;
  clicks7d: number;
}

export async function getStats(db: D1Database): Promise<Stats> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*)                                   AS total,
         COALESCE(SUM(enabled), 0)                  AS enabled,
         COALESCE(SUM(clicks), 0)                   AS clicks,
         COALESCE(SUM(CASE WHEN last_clicked IS NOT NULL
                            AND last_clicked >= ?1 THEN clicks ELSE 0 END), 0) AS clicks7d
       FROM links`,
    )
    .bind(daysAgoIso(7))
    .first<{ total: number; enabled: number; clicks: number; clicks7d: number }>();

  const total = row?.total ?? 0;
  const enabled = row?.enabled ?? 0;
  return { total, enabled, disabled: total - enabled, clicks: row?.clicks ?? 0, clicks7d: row?.clicks7d ?? 0 };
}

function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** 写穿缓存：把最新状态放进 KV。 */
export async function cacheLink(kv: KVNamespace, row: Pick<LinkRow, "code" | "target_url" | "enabled">): Promise<void> {
  await kv.put(
    cacheKey(row.code),
    JSON.stringify({ target_url: row.target_url, enabled: row.enabled === 1, code: row.code }),
    { expirationTtl: CACHE_TTL },
  );
}

export async function invalidateCache(kv: KVNamespace, code: string): Promise<void> {
  try {
    await kv.delete(cacheKey(code));
  } catch {
    // 缓存删除失败不影响主流程，TTL 到期会自愈
  }
}