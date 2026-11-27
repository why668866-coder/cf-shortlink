import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { isAuthenticated } from "../lib/session";

/** /x7k2m9 下的所有页面都要求有效会话；未登录时跳回登录页。 */
export const requireAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (await isAuthenticated(c)) return next();
  return c.redirect("/x7k2m9", 302);
});