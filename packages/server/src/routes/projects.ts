import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import { ValidationError } from "@ponderdb/core";

export function projectsRouter(deps: AppDeps) {
  const router = new Hono();
  const { store } = deps;

  // List all projects
  router.get("/", async (c) => {
    const projects = await store.listProjects();

    // Attach memory counts + category counts
    const withStats = await Promise.all(
      projects.map(async (p) => {
        const memResult = await store.list({ projectId: p.slug, limit: 0 });
        const categories = await store.listCategories(p.slug);
        const customCats = categories.filter((cat) => !cat.isSystem).length;
        return { ...p, memoryCount: memResult.total, categoryCount: customCats };
      }),
    );

    return c.json({ projects: withStats });
  });

  // Get project by slug
  router.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const project = await store.getProjectBySlug(slug);
    if (!project) {
      return c.json({ error: { code: "PROJECT_NOT_FOUND", message: `Project not found: ${slug}` } }, 404);
    }
    const memResult = await store.list({ projectId: project.slug, limit: 0 });
    return c.json({ ...project, memoryCount: memResult.total });
  });

  // Create project
  router.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.name) throw new ValidationError("name is required");

    const project = await store.createProject({
      name: body.name,
      slug: body.slug,
      description: body.description,
    });

    return c.json(project, 201);
  });

  // Update project
  router.put("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();

    const project = await store.updateProject(id, {
      name: body.name,
      description: body.description,
    });

    return c.json(project);
  });

  // Delete project (cascades: memories, vectors, project categories)
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await store.deleteProject(id);
    if (!deleted) {
      return c.json({ error: { code: "PROJECT_NOT_FOUND", message: "Project not found" } }, 404);
    }
    return c.json({ deleted: true });
  });

  // Project stats
  router.get("/:slug/stats", async (c) => {
    const slug = c.req.param("slug");
    const project = await store.getProjectBySlug(slug);
    if (!project) {
      return c.json({ error: { code: "PROJECT_NOT_FOUND", message: `Project not found: ${slug}` } }, 404);
    }

    const memResult = await store.list({ projectId: slug, limit: 500 });
    const categories = await store.listCategories(slug);

    const categoryMap = new Map<string, number>();
    const importanceMap = new Map<string, number>();
    let totalAccesses = 0;

    for (const m of memResult.items) {
      categoryMap.set(m.category, (categoryMap.get(m.category) || 0) + 1);
      importanceMap.set(m.importance, (importanceMap.get(m.importance) || 0) + 1);
      totalAccesses += m.accessCount;
    }

    return c.json({
      project,
      stats: {
        totalMemories: memResult.total,
        totalAccesses,
        categories: [...categoryMap.entries()].map(([name, count]) => ({ name, count })),
        importance: [...importanceMap.entries()].map(([name, count]) => ({ name, count })),
        totalCategories: categories.length,
      },
    });
  });

  return router;
}
