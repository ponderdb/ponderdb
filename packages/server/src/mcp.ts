import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StorageAdapter, EmbeddingProvider, MemoryCategory } from "@ponderdb/core";
import { detectCategory } from "@ponderdb/core";

export function createMcpServer(store: StorageAdapter, embedder: EmbeddingProvider, headerProjectId?: string, userId = "local") {
  const defaultProjectId = headerProjectId ?? process.env.PONDER_PROJECT_ID ?? undefined;

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
      isGlobal: z.boolean().optional().describe("Mark as global memory (accessible across all projects)"),
    },
    async ({ key, content, category, importance, tags, projectId: pid, isGlobal }) => {
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
        memory = await store.update(existing.id, { content, category: cat as MemoryCategory, importance, tags, embedding, isGlobal });
      } else {
        memory = await store.create({ key, content, category: cat as MemoryCategory, importance, tags, projectId, isGlobal, embedding });
      }

      const scope = memory.isGlobal ? " [global]" : memory.projectId ? ` [project: ${memory.projectId}]` : "";
      return {
        content: [{ type: "text" as const, text: `Remembered: ${memory.key} (${memory.category})${scope}` }],
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
          text: `**${memory.key}** (${memory.category}, ${memory.importance})${memory.isGlobal ? " [global]" : memory.projectId ? ` [project: ${memory.projectId}]` : ""}\n\n${memory.content}\n\nTags: ${memory.tags.join(", ") || "none"}\nLast updated: ${memory.updatedAt.toISOString()}`,
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

      const text = merged.slice(0, limit).map((r, i) => {
        const scope = r.memory.isGlobal ? " [global]" : r.memory.projectId ? ` [project: ${r.memory.projectId}]` : "";
        return `${i + 1}. **${r.memory.key}** (score: ${r.score.toFixed(2)}, ${r.matchType})${scope}\n   ${r.memory.content.slice(0, 200)}${r.memory.content.length > 200 ? "..." : ""}`;
      }).join("\n\n");

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

      const text = result.items.map((m, i) => {
        const scope = m.isGlobal ? " [global]" : m.projectId ? ` [project: ${m.projectId}]` : "";
        return `${i + 1}. **${m.key}** [${m.category}]${scope} — ${m.content.slice(0, 100)}${m.content.length > 100 ? "..." : ""}`;
      }).join("\n");

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

  // Tool: create_category — create a custom category
  server.tool(
    "create_category",
    "Create a custom memory category.",
    {
      name: z.string().describe("Category name (lowercase, e.g. 'api-notes')"),
      description: z.string().optional().describe("What this category is for"),
      color: z.string().optional().describe("Hex color (e.g. '#3b82f6')"),
      icon: z.string().optional().describe("Icon name or emoji"),
      projectId: z.string().optional(),
    },
    async ({ name, description, color, icon, projectId: pid }) => {
      const projectId = pid ?? defaultProjectId;
      const existing = await store.getCategoryByName(name, projectId);
      if (existing) {
        return { content: [{ type: "text" as const, text: `Category already exists: ${name}` }] };
      }
      const cat = await store.createCategory({ name, description, color, icon, projectId });
      return { content: [{ type: "text" as const, text: `Created category: ${cat.name} (${cat.color})` }] };
    },
  );

  // Tool: update_category — update a custom category
  server.tool(
    "update_category",
    "Update an existing custom category's details.",
    {
      name: z.string().describe("Current category name"),
      newName: z.string().optional().describe("New name"),
      description: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
      projectId: z.string().optional(),
    },
    async ({ name, newName, description, color, icon, projectId: pid }) => {
      const projectId = pid ?? defaultProjectId;
      const cat = await store.getCategoryByName(name, projectId);
      if (!cat) {
        return { content: [{ type: "text" as const, text: `Category not found: ${name}` }] };
      }
      if (cat.isSystem) {
        return { content: [{ type: "text" as const, text: `Cannot modify system category: ${name}` }] };
      }
      const updated = await store.updateCategory(cat.id, { name: newName, description, color, icon });
      return { content: [{ type: "text" as const, text: `Updated category: ${updated.name}` }] };
    },
  );

  // Tool: delete_category — delete a custom category
  server.tool(
    "delete_category",
    "Delete a custom category. Memories in it will be reassigned to 'custom'.",
    {
      name: z.string().describe("Category name to delete"),
      projectId: z.string().optional(),
    },
    async ({ name, projectId: pid }) => {
      const projectId = pid ?? defaultProjectId;
      const cat = await store.getCategoryByName(name, projectId);
      if (!cat) {
        return { content: [{ type: "text" as const, text: `Category not found: ${name}` }] };
      }
      if (cat.isSystem) {
        return { content: [{ type: "text" as const, text: `Cannot delete system category: ${name}` }] };
      }
      await store.deleteCategory(cat.id);
      return { content: [{ type: "text" as const, text: `Deleted category: ${name}` }] };
    },
  );

  // Tool: list_projects — list all projects
  server.tool(
    "list_projects",
    "List all memory projects.",
    {},
    async () => {
      const projects = await store.listProjects(userId);
      if (projects.length === 0) {
        return { content: [{ type: "text" as const, text: "No projects found." }] };
      }
      const lines = projects.map((p) =>
        `- **${p.name}** (slug: ${p.slug}) — ${p.description || "no description"}`,
      );
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  // Tool: create_project — create a new project
  server.tool(
    "create_project",
    "Create a new memory project to organize memories.",
    {
      name: z.string().describe("Project name (e.g. 'My Backend API')"),
      description: z.string().optional().describe("What this project is about"),
    },
    async ({ name, description }) => {
      const project = await store.createProject({ name, description, userId });
      return { content: [{ type: "text" as const, text: `Created project: ${project.name} (slug: ${project.slug})` }] };
    },
  );

  // Tool: update_project — update a project
  server.tool(
    "update_project",
    "Update an existing project's name or description.",
    {
      slug: z.string().describe("Project slug to update"),
      name: z.string().optional(),
      description: z.string().optional(),
    },
    async ({ slug, name, description }) => {
      const project = await store.getProjectBySlug(slug, userId);
      if (!project) {
        return { content: [{ type: "text" as const, text: `Project not found: ${slug}` }] };
      }
      const updated = await store.updateProject(project.id, { name, description });
      return { content: [{ type: "text" as const, text: `Updated project: ${updated.name}` }] };
    },
  );

  // Tool: delete_project — delete a project and all its memories
  server.tool(
    "delete_project",
    "Delete a project and ALL its memories, vectors, and categories. This is irreversible.",
    {
      slug: z.string().describe("Project slug to delete"),
      confirm: z.boolean().describe("Must be true to confirm deletion"),
    },
    async ({ slug, confirm }) => {
      if (!confirm) {
        return { content: [{ type: "text" as const, text: "Deletion not confirmed. Set confirm: true to proceed." }] };
      }
      const project = await store.getProjectBySlug(slug, userId);
      if (!project) {
        return { content: [{ type: "text" as const, text: `Project not found: ${slug}` }] };
      }
      await store.deleteProject(project.id);
      return { content: [{ type: "text" as const, text: `Deleted project: ${project.name} (${slug}) and all its data.` }] };
    },
  );

  // Tool: tag_memory — add or remove tags on a memory
  server.tool(
    "tag_memory",
    "Add or remove tags on an existing memory.",
    {
      key: z.string().describe("Memory key"),
      addTags: z.array(z.string()).optional().describe("Tags to add"),
      removeTags: z.array(z.string()).optional().describe("Tags to remove"),
      projectId: z.string().optional(),
    },
    async ({ key, addTags, removeTags, projectId: pid }) => {
      const projectId = pid ?? defaultProjectId;
      const memory = await store.getByKey(key, projectId);
      if (!memory) {
        return { content: [{ type: "text" as const, text: `No memory found for key: ${key}` }] };
      }
      const tags = new Set(memory.tags);
      for (const t of addTags ?? []) tags.add(t);
      for (const t of removeTags ?? []) tags.delete(t);
      const updated = await store.update(memory.id, { tags: [...tags] });
      return { content: [{ type: "text" as const, text: `Tags updated for ${key}: ${updated.tags.join(", ") || "none"}` }] };
    },
  );

  return server;
}
