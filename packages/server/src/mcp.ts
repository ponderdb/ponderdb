import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StorageAdapter, EmbeddingProvider, MemoryCategory } from "@ponderdb/core";
import { detectCategory } from "@ponderdb/core";

export function createMcpServer(store: StorageAdapter, embedder: EmbeddingProvider) {
  const defaultProjectId = process.env.PONDER_PROJECT_ID || undefined;

  const server = new McpServer({
    name: "ponderdb",
    version: "0.1.0",
  });

  // Tool: remember — store a memory
  server.tool(
    "remember",
    "Store a memory with a key. Use this to save important context, decisions, patterns, bugs, configs, or any knowledge worth remembering across sessions.",
    {
      key: z.string().describe("Unique key like 'auth/jwt-config' or 'bug/login-race-condition'"),
      content: z.string().describe("The memory content to store"),
      category: z.string().optional().describe("Memory category (system or custom)"),
      importance: z.enum(["low", "medium", "high", "critical"]).optional(),
      tags: z.array(z.string()).optional(),
      projectId: z.string().optional(),
    },
    async ({ key, content, category, importance, tags, projectId: pid }) => {
      const projectId = pid ?? defaultProjectId;
      // Use provided category, or check custom categories, or auto-detect
      let cat = category;
      if (!cat) {
        // Check if any custom category matches
        const categories = await store.listCategories(projectId);
        const text = `${key} ${content}`.toLowerCase();
        for (const c of categories) {
          if (!c.isSystem && text.includes(c.name.toLowerCase())) {
            cat = c.name;
            break;
          }
        }
        if (!cat) cat = detectCategory(content, key);
      }
      const embedding = await embedder.embed(`${key} ${content}`);

      // Upsert: update if exists, create if not
      const existing = await store.getByKey(key, projectId);
      let memory;
      if (existing) {
        memory = await store.update(existing.id, { content, category: cat as MemoryCategory, importance, tags, embedding });
      } else {
        memory = await store.create({ key, content, category: cat as MemoryCategory, importance, tags, projectId, embedding });
      }

      return {
        content: [{ type: "text" as const, text: `Remembered: ${memory.key} (${memory.category})` }],
      };
    },
  );

  // Tool: recall — get a specific memory by key
  server.tool(
    "recall",
    "Retrieve a specific memory by its key.",
    {
      key: z.string().describe("The memory key to retrieve"),
      projectId: z.string().optional(),
    },
    async ({ key, projectId: pid }) => {
      const projectId = pid ?? defaultProjectId;
      const memory = await store.getByKey(key, projectId);
      if (!memory) {
        return {
          content: [{ type: "text" as const, text: `No memory found for key: ${key}` }],
        };
      }

      await store.recordAccess(memory.id);
      return {
        content: [{
          type: "text" as const,
          text: `**${memory.key}** (${memory.category}, ${memory.importance})\n\n${memory.content}\n\nTags: ${memory.tags.join(", ") || "none"}\nLast updated: ${memory.updatedAt.toISOString()}`,
        }],
      };
    },
  );

  // Tool: search — semantic + keyword search
  server.tool(
    "search_memories",
    "Search memories by meaning. Use this to find relevant context, past decisions, known bugs, patterns, etc.",
    {
      query: z.string().describe("Natural language search query"),
      category: z.string().optional().describe("Filter by category name"),
      limit: z.number().optional().default(5),
      projectId: z.string().optional(),
    },
    async ({ query, category, limit, projectId: pid }) => {
      const projectId = pid ?? defaultProjectId;
      const embedding = await embedder.embed(query);

      const [vectorResults, keywordResults] = await Promise.all([
        store.vectorSearch(embedding, limit, { category, projectId }),
        store.keywordSearch(query, limit, { category, projectId }),
      ]);

      const seen = new Set<string>();
      const merged: typeof vectorResults = [];
      for (const r of vectorResults) {
        if (!seen.has(r.memory.id)) { seen.add(r.memory.id); merged.push(r); }
      }
      for (const r of keywordResults) {
        if (!seen.has(r.memory.id)) { seen.add(r.memory.id); merged.push({ ...r, score: r.score * 0.7 }); }
      }
      merged.sort((a, b) => b.score - a.score);

      if (merged.length === 0) {
        return { content: [{ type: "text" as const, text: "No memories found." }] };
      }

      const text = merged.slice(0, limit).map((r, i) =>
        `${i + 1}. **${r.memory.key}** (score: ${r.score.toFixed(2)}, ${r.matchType})\n   ${r.memory.content.slice(0, 200)}${r.memory.content.length > 200 ? "..." : ""}`,
      ).join("\n\n");

      return { content: [{ type: "text" as const, text }] };
    },
  );

  // Tool: forget — delete a memory
  server.tool(
    "forget",
    "Delete a memory by its key.",
    {
      key: z.string().describe("The memory key to delete"),
      projectId: z.string().optional(),
    },
    async ({ key, projectId: pid }) => {
      const projectId = pid ?? defaultProjectId;
      const memory = await store.getByKey(key, projectId);
      if (!memory) {
        return { content: [{ type: "text" as const, text: `No memory found for key: ${key}` }] };
      }
      await store.delete(memory.id);
      return { content: [{ type: "text" as const, text: `Forgotten: ${key}` }] };
    },
  );

  // Tool: list_memories
  server.tool(
    "list_memories",
    "List recent memories, optionally filtered by category.",
    {
      category: z.string().optional().describe("Filter by category name"),
      limit: z.number().optional().default(10),
      projectId: z.string().optional(),
    },
    async ({ category, limit, projectId: pid }) => {
      const projectId = pid ?? defaultProjectId;
      const result = await store.list({
        category: category as MemoryCategory | undefined,
        projectId,
        limit,
        sortBy: "updatedAt",
        sortOrder: "desc",
      });

      if (result.items.length === 0) {
        return { content: [{ type: "text" as const, text: "No memories found." }] };
      }

      const text = result.items.map((m, i) =>
        `${i + 1}. **${m.key}** [${m.category}] — ${m.content.slice(0, 100)}${m.content.length > 100 ? "..." : ""}`,
      ).join("\n");

      return { content: [{ type: "text" as const, text: `${result.total} memories total.\n\n${text}` }] };
    },
  );

  // Tool: list_categories — list all available categories
  server.tool(
    "list_categories",
    "List all memory categories (system + custom) with memory counts.",
    {
      projectId: z.string().optional(),
    },
    async ({ projectId: pid }) => {
      const projectId = pid ?? defaultProjectId;
      const categories = await store.listCategories(projectId);

      if (categories.length === 0) {
        return { content: [{ type: "text" as const, text: "No categories found." }] };
      }

      const lines = await Promise.all(
        categories.map(async (cat) => {
          const result = await store.list({ category: cat.name, projectId, limit: 0 });
          const tag = cat.isSystem ? "system" : cat.isAiGenerated ? "ai" : "custom";
          return `- **${cat.name}** (${result.total}) [${tag}] — ${cat.description}`;
        }),
      );

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  return server;
}
