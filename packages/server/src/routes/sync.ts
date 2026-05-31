import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.js";

export function syncRouter(deps: AppDeps) {
  const router = new Hono<AppEnv>();
  const { store } = deps;

  /** Pull changes from server since given timestamp */
  router.post("/pull", async (c) => {
    const userId = c.get("userId") || "local";
    const body = await c.req.json() as { since: string | null };
    const since = body.since || null;

    const changes = await store.getChangesSince(since, userId);
    const syncedAt = new Date().toISOString();

    return c.json({
      memories: changes.memories,
      projects: changes.projects,
      categories: changes.categories,
      deletedMemoryIds: [],
      deletedProjectIds: [],
      deletedCategoryIds: [],
      syncedAt,
    });
  });

  /** Push local changes to server */
  router.post("/push", async (c) => {
    const body = await c.req.json() as {
      memories: unknown[];
      projects: unknown[];
      categories: unknown[];
      deletedMemoryIds: string[];
      deletedProjectIds: string[];
      deletedCategoryIds: string[];
    };

    await store.applyRemoteChanges({
      memories: body.memories as Parameters<typeof store.applyRemoteChanges>[0]["memories"],
      projects: body.projects as Parameters<typeof store.applyRemoteChanges>[0]["projects"],
      categories: body.categories as Parameters<typeof store.applyRemoteChanges>[0]["categories"],
      deletedMemoryIds: body.deletedMemoryIds || [],
      deletedProjectIds: body.deletedProjectIds || [],
      deletedCategoryIds: body.deletedCategoryIds || [],
    });

    return c.json({ ok: true, syncedAt: new Date().toISOString() });
  });

  /** Get sync status */
  router.get("/status", async (c) => {
    const userId = c.get("userId") || "local";
    const changes = await store.getChangesSince(null, userId);
    return c.json({
      totalMemories: changes.memories.length,
      totalProjects: changes.projects.length,
      totalCategories: changes.categories.length,
    });
  });

  return router;
}
