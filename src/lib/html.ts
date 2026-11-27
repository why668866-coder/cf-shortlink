const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "=": "&#61;",
  "`": "&#96;",
};

/** HTML 转义：单遍替换，避免多遍替换造成二次转义。 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'=`]/g, ch => ESCAPES[ch] ?? ch);
}

/** 把 JSON 安全嵌入 <script>，避免 </script> 截断与 U+2028/2029 语法错误。 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
