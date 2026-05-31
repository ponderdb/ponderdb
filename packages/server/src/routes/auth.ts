import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.js";
import { ValidationError } from "@ponderdb/core";

export function authRouter(deps: AppDeps) {
  const router = new Hono<AppEnv>();
  const { store } = deps;

  // Generate new API key (requires existing valid key)
  router.post("/keys", async (c) => {
    const body = await c.req.json();
    const name = (body as Record<string, unknown>).name;
    if (!name || typeof name !== "string") throw new ValidationError("name is required");

    const userId = c.get("userId") as string || "local";
    const { apiKey, rawKey } = await store.createApiKey(name, userId);
    return c.json({
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      key: rawKey,
      createdAt: apiKey.createdAt,
      message: "Save this key — it will not be shown again.",
    }, 201);
  });

  // List API keys (prefix only, no secrets)
  router.get("/keys", async (c) => {
    const userId = c.get("userId") as string || "local";
    const keys = await store.listApiKeys(userId);
    return c.json({ keys });
  });

  // Delete API key
  router.delete("/keys/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await store.deleteApiKey(id);
    if (!deleted) return c.json({ error: { code: "NOT_FOUND", message: "API key not found" } }, 404);
    return c.json({ deleted: true });
  });

  return router;
}
