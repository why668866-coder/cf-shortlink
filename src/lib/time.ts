/** 服务端统一使用 ISO8601（UTC）存储；界面显示为 YYYY-MM-DD HH:mm。 */
export function nowIso(): string {
  return new Date().toISOString().replace("Z", "+00:00");
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const raw = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n ?? 0);
}
