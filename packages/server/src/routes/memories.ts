import { Hono } from "hono";
import type { AppDeps } from "../app.js";
import type { MemoryCategory, MemoryImportance, ListMemoriesFilter } from "@ponderdb/core";
import { ValidationError, detectCategory } from "@ponderdb/core";

export function memoriesRouter(deps: AppDeps) {
  const router = new Hono();
  const { store, embedder } = deps;

  // List memories
  router.get("/", async (c) => {
    const filter: ListMemoriesFilter = {
      category: c.req.query("category") as MemoryCategory | undefined,
      projectId: c.req.query("projectId"),
      importance: c.req.query("importance") as MemoryImportance | undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
      offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
      sortBy: c.req.query("sortBy") as ListMemoriesFilter["sortBy"],
      sortOrder: c.req.query("sortOrder") as ListMemoriesFilter["sortOrder"],
    };
    const result = await store.list(filter);
    return c.json(result);
  });

  // Search memories
  router.post("/search", async (c) => {
    const body = await c.req.json();
    if (!body.query) throw new ValidationError("query is required");

    const limit = body.limit ?? 10;
    const embedding = await embedder.embed(body.query);

    // Hybrid search: vector + keyword
    const [vectorResults, keywordResults] = await Promise.all([
      store.vectorSearch(embedding, limit, { category: body.category, projectId: body.projectId }),
      store.keywordSearch(body.query, limit, { category: body.category, projectId: body.projectId }),
    ]);

    // Merge and deduplicate results
    const seen = new Set<string>();
    const merged: typeof vectorResults = [];

    for (const r of vectorResults) {
      if (!seen.has(r.memory.id)) {
        seen.add(r.memory.id);
        merged.push(r);
      }
    }
    for (const r of keywordResults) {
      if (!seen.has(r.memory.id)) {
        seen.add(r.memory.id);
        merged.push({ ...r, score: r.score * 0.7 }); // keyword results weighted lower
      }
    }

    merged.sort((a, b) => b.score - a.score);
    return c.json({ results: merged.slice(0, limit) });
  });

  // Get memory by key
  router.get("/:key{.+}", async (c) => {
    const key = c.req.param("key");
    const projectId = c.req.query("projectId");
    const memory = await store.getByKey(key, projectId);
    if (!memory) return c.json({ error: { code: "MEMORY_NOT_FOUND", message: `Memory not found: ${key}` } }, 404);

    await store.recordAccess(memory.id);
    return c.json(memory);
  });

  // Create memory
  router.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.key) throw new ValidationError("key is required");
    if (!body.content) throw new ValidationError("content is required");

    const category = body.category ?? detectCategory(body.content, body.key);
    const embedding = await embedder.embed(`${body.key} ${body.content}`);

    const memory = await store.create({
      key: body.key,
      content: body.content,
      category,
      importance: body.importance,
      tags: body.tags,
      metadata: body.metadata,
      projectId: body.projectId,
      isGlobal: body.isGlobal,
      embedding,
    });

    return c.json(memory, 201);
  });

  // Update memory
  router.put("/:key{.+}", async (c) => {
    const key = c.req.param("key");
    const projectId = c.req.query("projectId");
    const body = await c.req.json();

    const existing = await store.getByKey(key, projectId);
    if (!existing) return c.json({ error: { code: "MEMORY_NOT_FOUND", message: `Memory not found: ${key}` } }, 404);

    let embedding: number[] | undefined;
    if (body.content) {
      embedding = await embedder.embed(`${key} ${body.content}`);
    }

    const updated = await store.update(existing.id, { ...body, embedding });
    return c.json(updated);
  });

  // Delete memory
  router.delete("/:key{.+}", async (c) => {
    const key = c.req.param("key");
    const projectId = c.req.query("projectId");

    const existing = await store.getByKey(key, projectId);
    if (!existing) return c.json({ error: { code: "MEMORY_NOT_FOUND", message: `Memory not found: ${key}` } }, 404);

    await store.delete(existing.id);
    return c.json({ deleted: true });
  });

  return router;
}
