import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.js";

export function suggestionsRouter(deps: AppDeps) {
  const router = new Hono<AppEnv>();
  const { store } = deps;

  // List suggestions for current user
  router.get("/", async (c) => {
    const userId = c.get("userId") || "local";
    const suggestions = await store.listAiSuggestions(userId);
    return c.json({ suggestions });
  });

  // Dismiss a suggestion
  router.post("/:id/dismiss", async (c) => {
    const id = c.req.param("id");
    const dismissed = await store.dismissAiSuggestion(id);
    if (!dismissed) return c.json({ error: { code: "NOT_FOUND", message: "Suggestion not found" } }, 404);
    return c.json({ dismissed: true });
  });

  return router;
}
