export interface Env {
  DB: D1Database;
  SL_CACHE: KVNamespace;
  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;
  ASSETS: Fetcher;
}

/** D1 中一行短链接记录。 */
export interface LinkRow {
  id: number;
  code: string;
  target_url: string;
  title: string;
  enabled: number;
  clicks: number;
  last_clicked: string | null;
  created_at: string;
  updated_at: string;
}

/** KV 中缓存的跳转目标（只存跳转必需字段）。 */
export interface LinkCacheValue {
  target_url: string;
  enabled: boolean;
  code: string;
}

export interface AppVariables {
  origin: string;
}
