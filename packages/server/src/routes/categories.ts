import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { ValidationError } from "@ponderdb/core";

export function categoriesRouter(deps: AppDeps) {
  const router = new Hono();
  const { store } = deps;

  // List categories (optionally filtered by project)
  router.get("/", async (c) => {
    const projectId = c.req.query("projectId");
    const categories = await store.listCategories(projectId);

    // Attach memory counts
    const withCounts = await Promise.all(
      categories.map(async (cat) => {
        const result = await store.list({
          category: cat.name,
          projectId,
          limit: 0,
          offset: 0,
        });
        return { ...cat, count: result.total };
      }),
    );

    return c.json({ categories: withCounts });
  });

  // Create a new category
  router.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.name) throw new ValidationError("name is required");

    const existing = await store.getCategoryByName(body.name, body.projectId);
    if (existing) {
      return c.json({ error: { code: "DUPLICATE_CATEGORY", message: `Category "${body.name}" already exists` } }, 409);
    }

    const category = await store.createCategory({
      name: body.name.toLowerCase().replace(/\s+/g, "-"),
      description: body.description,
      color: body.color,
      icon: body.icon,
      projectId: body.projectId,
      isAiGenerated: body.isAiGenerated ?? false,
    });

    return c.json(category, 201);
  });

  // Update a category
  router.put("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();

    const category = await store.updateCategory(id, {
      name: body.name,
      description: body.description,
      color: body.color,
      icon: body.icon,
    });

    return c.json(category);
  });

  // Delete a category (reassigns memories to "custom")
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await store.deleteCategory(id);
    if (!deleted) {
      return c.json({ error: { code: "CANNOT_DELETE", message: "Category not found or is a system category" } }, 400);
    }
    return c.json({ deleted: true });
  });

  // AI suggest category for content
  router.post("/suggest", async (c) => {
    const body = await c.req.json();
    if (!body.content) throw new ValidationError("content is required");

    const { detectCategory } = await import("@ponderdb/core");
    const suggested = detectCategory(body.content, body.key ?? "");

    // Check if any custom categories match better via keyword
    const categories = await store.listCategories(body.projectId);
    const text = `${body.key ?? ""} ${body.content}`.toLowerCase();

    for (const cat of categories) {
      if (cat.isSystem) continue;
      // Simple keyword match: if category name appears in content
      if (text.includes(cat.name.toLowerCase())) {
        return c.json({ category: cat.name, confidence: 0.8, source: "keyword" });
      }
    }

    return c.json({ category: suggested, confidence: 0.7, source: "auto-detect" });
  });

  return router;
}
