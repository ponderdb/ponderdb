import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.js";

export function auditRouter(deps: AppDeps) {
  const router = new Hono<AppEnv>();
  const { store } = deps;

  router.get("/", async (c) => {
    const userId = c.get("userId") || "local";
    const action = c.req.query("action");
    const resourceType = c.req.query("resourceType");
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
    const offset = c.req.query("offset") ? Number(c.req.query("offset")) : undefined;

    const result = await store.listAuditLogs({ userId, action: action as any, resourceType, limit, offset });
    return c.json(result);
  });

  return router;
}
