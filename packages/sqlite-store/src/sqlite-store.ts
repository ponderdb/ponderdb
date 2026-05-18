import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import type {
  StorageAdapter,
  Memory,
  MemoryId,
  CreateMemoryInput,
  UpdateMemoryInput,
  ListMemoriesFilter,
  PaginatedResult,
  SearchResult,
  ApiKey,
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
} from "@ponderdb/core";
import {
  generateId,
  generateApiKey,
  hashApiKey,
  slugify,
  estimateTokens,
  MemoryNotFoundError,
  DuplicateKeyError,
  SYSTEM_CATEGORIES,
} from "@ponderdb/core";

interface SqliteRow {
  id: string;
  key: string;
  content: string;
  category: string;
  importance: string;
  tags: string;
  metadata: string;
  embedding: Buffer | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  accessed_at: string;
  access_count: number;
  token_count: number;
  version: number;
}

interface CategoryRow {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string | null;
  project_id: string | null;
  is_system: number;
  is_ai_generated: number;
  created_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

function embeddingToBlob(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

export class SqliteStore implements StorageAdapter {
  private db!: Database.Database;
  private dbPath: string;
  private vecDimensions: number;

  constructor(dataDir: string, dimensions = 384) {
    const dir = resolve(dataDir);
    mkdirSync(dir, { recursive: true });
    this.dbPath = resolve(dir, "ponder.db");
    this.vecDimensions = dimensions;
  }

  async init(): Promise<void> {
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    // Load sqlite-vec extension
    sqliteVec.load(this.db);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'custom',
        importance TEXT NOT NULL DEFAULT 'medium',
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        embedding BLOB,
        project_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
        access_count INTEGER NOT NULL DEFAULT 0,
        token_count INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(key, project_id)
      );

      CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
      CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
      CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
      CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories(updated_at);

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT,
        expires_at TEXT
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#64748b',
        icon TEXT,
        project_id TEXT,
        is_system INTEGER NOT NULL DEFAULT 0,
        is_ai_generated INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(name, project_id)
      );
      CREATE INDEX IF NOT EXISTS idx_categories_project ON categories(project_id);
    `);

    // Seed system categories if none exist
    const catCount = (this.db.prepare("SELECT COUNT(*) as count FROM categories WHERE is_system = 1").get() as { count: number }).count;
    if (catCount === 0) {
      const insert = this.db.prepare("INSERT OR IGNORE INTO categories (id, name, description, color, is_system) VALUES (?, ?, ?, ?, 1)");
      const tx = this.db.transaction(() => {
        for (const cat of SYSTEM_CATEGORIES) {
          insert.run(generateId(), cat.name, cat.description, cat.color);
        }
      });
      tx();
    }

    // Auto-create project rows for any existing memory project_ids that don't have a project entry
    const orphanProjects = this.db.prepare(`
      SELECT DISTINCT project_id FROM memories
      WHERE project_id IS NOT NULL
        AND project_id NOT IN (SELECT slug FROM projects)
    `).all() as { project_id: string }[];
    if (orphanProjects.length > 0) {
      const insertProject = this.db.prepare(
        "INSERT OR IGNORE INTO projects (id, name, slug, description, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))"
      );
      const tx = this.db.transaction(() => {
        for (const row of orphanProjects) {
          insertProject.run(generateId(), row.project_id, row.project_id, "");
        }
      });
      tx();
    }

    // Create sqlite-vec virtual table for vector search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
        memory_id TEXT PRIMARY KEY,
        embedding float[${this.vecDimensions}] distance_metric=cosine
      );
    `);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async create(input: CreateMemoryInput & { embedding?: number[] }): Promise<Memory> {
    const existing = this.db
      .prepare("SELECT id FROM memories WHERE key = ? AND project_id IS ?")
      .get(input.key, input.projectId ?? null) as { id: string } | undefined;

    if (existing) throw new DuplicateKeyError(input.key);

    const id = generateId();
    const now = new Date().toISOString();
    const embeddingBlob = input.embedding ? embeddingToBlob(input.embedding) : null;
    const tokenCount = estimateTokens(input.content);

    const insertMemory = this.db.prepare(`
      INSERT INTO memories (id, key, content, category, importance, tags, metadata, embedding, project_id, token_count, created_at, updated_at, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVec = this.db.prepare(`
      INSERT INTO vec_memories (memory_id, embedding) VALUES (?, ?)
    `);

    const tx = this.db.transaction(() => {
      insertMemory.run(
        id, input.key, input.content,
        input.category ?? "custom", input.importance ?? "medium",
        JSON.stringify(input.tags ?? []), JSON.stringify(input.metadata ?? {}),
        embeddingBlob, input.projectId ?? null, tokenCount,
        now, now, now,
      );
      if (embeddingBlob) {
        insertVec.run(id, embeddingBlob);
      }
    });

    tx();

    return this.rowToMemory(
      this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as SqliteRow,
    );
  }

  async getById(id: MemoryId): Promise<Memory | null> {
    const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as SqliteRow | undefined;
    return row ? this.rowToMemory(row) : null;
  }

  async getByKey(key: string, projectId?: string): Promise<Memory | null> {
    const row = this.db
      .prepare("SELECT * FROM memories WHERE key = ? AND project_id IS ?")
      .get(key, projectId ?? null) as SqliteRow | undefined;
    return row ? this.rowToMemory(row) : null;
  }

  async update(id: MemoryId, input: UpdateMemoryInput & { embedding?: number[] }): Promise<Memory> {
    const existing = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as SqliteRow | undefined;
    if (!existing) throw new MemoryNotFoundError(id);

    const sets: string[] = ["updated_at = datetime('now')", "version = version + 1"];
    const params: unknown[] = [];

    if (input.content !== undefined) {
      sets.push("content = ?");
      params.push(input.content);
      sets.push("token_count = ?");
      params.push(estimateTokens(input.content));
    }
    if (input.category !== undefined) {
      sets.push("category = ?");
      params.push(input.category);
    }
    if (input.importance !== undefined) {
      sets.push("importance = ?");
      params.push(input.importance);
    }
    if (input.tags !== undefined) {
      sets.push("tags = ?");
      params.push(JSON.stringify(input.tags));
    }
    if (input.metadata !== undefined) {
      sets.push("metadata = ?");
      params.push(JSON.stringify(input.metadata));
    }

    let newEmbeddingBlob: Buffer | undefined;
    if (input.embedding !== undefined) {
      newEmbeddingBlob = embeddingToBlob(input.embedding);
      sets.push("embedding = ?");
      params.push(newEmbeddingBlob);
    }

    params.push(id);

    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...params);

      if (newEmbeddingBlob) {
        // Delete old vec entry and insert new one (vec0 doesn't support UPDATE)
        this.db.prepare("DELETE FROM vec_memories WHERE memory_id = ?").run(id);
        this.db.prepare("INSERT INTO vec_memories (memory_id, embedding) VALUES (?, ?)").run(id, newEmbeddingBlob);
      }
    });

    tx();

    return this.rowToMemory(
      this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as SqliteRow,
    );
  }

  async delete(id: MemoryId): Promise<boolean> {
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM vec_memories WHERE memory_id = ?").run(id);
      return this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    });

    const result = tx();
    return result.changes > 0;
  }

  async list(filter: ListMemoriesFilter): Promise<PaginatedResult<Memory>> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.category) {
      conditions.push("category = ?");
      params.push(filter.category);
    }
    if (filter.projectId) {
      conditions.push("project_id = ?");
      params.push(filter.projectId);
    }
    if (filter.importance) {
      conditions.push("importance = ?");
      params.push(filter.importance);
    }
    if (filter.tags?.length) {
      for (const tag of filter.tags) {
        conditions.push("tags LIKE ?");
        params.push(`%"${tag}"%`);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const columnMap: Record<string, string> = {
      updatedAt: "updated_at",
      createdAt: "created_at",
      accessedAt: "accessed_at",
      accessCount: "access_count",
    };
    const rawSort = filter.sortBy ?? "updated_at";
    const sortBy = columnMap[rawSort] ?? rawSort;
    const validColumns = new Set(["id", "key", "content", "category", "importance", "created_at", "updated_at", "accessed_at", "access_count", "version"]);
    if (!validColumns.has(sortBy)) throw new Error(`Invalid sort column: ${sortBy}`);
    const sortOrder = filter.sortOrder === "asc" ? "asc" : "desc";
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const total = (
      this.db.prepare(`SELECT COUNT(*) as count FROM memories ${where}`).get(...params) as { count: number }
    ).count;

    const rows = this.db
      .prepare(`SELECT * FROM memories ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as SqliteRow[];

    return {
      items: rows.map((r) => this.rowToMemory(r)),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  async vectorSearch(
    embedding: number[],
    limit: number,
    filter?: { category?: string; projectId?: string },
  ): Promise<SearchResult[]> {
    const queryBlob = embeddingToBlob(embedding);

    // KNN search via sqlite-vec
    const vecRows = this.db.prepare(`
      SELECT memory_id, distance
      FROM vec_memories
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(queryBlob, limit * 3) as { memory_id: string; distance: number }[];

    // Fetch full memory rows and apply filters
    const results: SearchResult[] = [];
    for (const vr of vecRows) {
      if (results.length >= limit) break;

      const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(vr.memory_id) as SqliteRow | undefined;
      if (!row) continue;

      if (filter?.category && row.category !== filter.category) continue;
      if (filter?.projectId && row.project_id !== filter.projectId) continue;

      // Convert cosine distance to similarity score (distance 0 = perfect match = score 1)
      const score = 1 - vr.distance;

      results.push({
        memory: this.rowToMemory(row),
        score,
        matchType: "semantic",
      });
    }

    return results;
  }

  async keywordSearch(
    query: string,
    limit: number,
    filter?: { category?: string; projectId?: string },
  ): Promise<SearchResult[]> {
    const conditions: string[] = ["(content LIKE ? OR key LIKE ?)"];
    const searchTerm = `%${query}%`;
    const params: unknown[] = [searchTerm, searchTerm];

    if (filter?.category) {
      conditions.push("category = ?");
      params.push(filter.category);
    }
    if (filter?.projectId) {
      conditions.push("project_id = ?");
      params.push(filter.projectId);
    }

    const where = conditions.join(" AND ");
    const rows = this.db
      .prepare(`SELECT * FROM memories WHERE ${where} ORDER BY updated_at DESC LIMIT ?`)
      .all(...params, limit) as SqliteRow[];

    return rows.map((row) => ({
      memory: this.rowToMemory(row),
      score: 1.0,
      matchType: "keyword" as const,
    }));
  }

  async count(filter?: { projectId?: string }): Promise<number> {
    if (filter?.projectId) {
      return (
        this.db.prepare("SELECT COUNT(*) as count FROM memories WHERE project_id = ?").get(filter.projectId) as { count: number }
      ).count;
    }
    return (this.db.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number }).count;
  }

  async recordAccess(id: MemoryId): Promise<void> {
    this.db
      .prepare("UPDATE memories SET accessed_at = datetime('now'), access_count = access_count + 1 WHERE id = ?")
      .run(id);
  }

  async createApiKey(name: string): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const { key: rawKey, prefix, hash } = generateApiKey();
    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO api_keys (id, name, key_hash, prefix, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, hash, prefix, now);

    return {
      apiKey: { id, name, keyHash: hash, prefix, userId: "local", createdAt: new Date(now) },
      rawKey,
    };
  }

  async validateApiKey(rawKey: string): Promise<ApiKey | null> {
    const hash = hashApiKey(rawKey);
    const row = this.db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(hash) as {
      id: string; name: string; key_hash: string; prefix: string;
      created_at: string; last_used_at: string | null; expires_at: string | null;
    } | undefined;

    if (!row) return null;

    // Check expiry
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

    // Update last_used_at
    this.db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id);

    return {
      id: row.id,
      name: row.name,
      keyHash: row.key_hash,
      prefix: row.prefix,
      userId: "local",
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    };
  }

  async listApiKeys(): Promise<ApiKey[]> {
    const rows = this.db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC").all() as {
      id: string; name: string; key_hash: string; prefix: string;
      created_at: string; last_used_at: string | null; expires_at: string | null;
    }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      keyHash: "[hidden]",
      prefix: row.prefix,
      userId: "local",
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    }));
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
    return result.changes > 0;
  }

  async countApiKeys(): Promise<number> {
    return (this.db.prepare("SELECT COUNT(*) as count FROM api_keys").get() as { count: number }).count;
  }

  // ── Categories ──

  async listCategories(projectId?: string): Promise<Category[]> {
    const rows = this.db.prepare(
      "SELECT * FROM categories WHERE project_id IS ? OR is_system = 1 ORDER BY is_system DESC, name ASC"
    ).all(projectId ?? null) as CategoryRow[];
    return rows.map((r) => this.rowToCategory(r));
  }

  async getCategoryByName(name: string, projectId?: string): Promise<Category | null> {
    const row = this.db.prepare(
      "SELECT * FROM categories WHERE name = ? AND (project_id IS ? OR is_system = 1) ORDER BY project_id IS NOT NULL DESC LIMIT 1"
    ).get(name, projectId ?? null) as CategoryRow | undefined;
    return row ? this.rowToCategory(row) : null;
  }

  async createCategory(input: CreateCategoryInput & { isSystem?: boolean; isAiGenerated?: boolean }): Promise<Category> {
    const id = generateId();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO categories (id, name, description, color, icon, project_id, is_system, is_ai_generated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.name, input.description ?? "", input.color ?? "#64748b",
      input.icon ?? null, input.projectId ?? null,
      input.isSystem ? 1 : 0, input.isAiGenerated ? 1 : 0, now,
    );
    return this.rowToCategory(
      this.db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as CategoryRow,
    );
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.name !== undefined) { sets.push("name = ?"); params.push(input.name); }
    if (input.description !== undefined) { sets.push("description = ?"); params.push(input.description); }
    if (input.color !== undefined) { sets.push("color = ?"); params.push(input.color); }
    if (input.icon !== undefined) { sets.push("icon = ?"); params.push(input.icon); }
    if (sets.length === 0) {
      return this.rowToCategory(this.db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as CategoryRow);
    }
    params.push(id);
    this.db.prepare(`UPDATE categories SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    return this.rowToCategory(this.db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as CategoryRow);
  }

  async deleteCategory(id: string): Promise<boolean> {
    // Reassign memories to "custom" before deleting
    const cat = this.db.prepare("SELECT name FROM categories WHERE id = ?").get(id) as { name: string } | undefined;
    if (cat) {
      this.db.prepare("UPDATE memories SET category = 'custom' WHERE category = ?").run(cat.name);
    }
    const result = this.db.prepare("DELETE FROM categories WHERE id = ? AND is_system = 0").run(id);
    return result.changes > 0;
  }

  private rowToCategory(row: CategoryRow): Category {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      icon: row.icon ?? undefined,
      projectId: row.project_id ?? undefined,
      isSystem: row.is_system === 1,
      isAiGenerated: row.is_ai_generated === 1,
      createdAt: new Date(row.created_at),
    };
  }

  // ── Projects ──

  async listProjects(): Promise<Project[]> {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY name ASC").all() as ProjectRow[];
    return rows.map((r) => this.rowToProject(r));
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    const row = this.db.prepare("SELECT * FROM projects WHERE slug = ?").get(slug) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const id = generateId();
    const now = new Date().toISOString();
    const slug = input.slug || slugify(input.name);
    this.db.prepare(`
      INSERT INTO projects (id, name, slug, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.name, slug, input.description ?? "", now, now);
    return this.rowToProject(this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow);
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];
    if (input.name !== undefined) { sets.push("name = ?"); params.push(input.name); }
    if (input.description !== undefined) { sets.push("description = ?"); params.push(input.description); }
    params.push(id);
    this.db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    return this.rowToProject(this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow);
  }

  async deleteProject(id: string): Promise<boolean> {
    const project = this.db.prepare("SELECT slug FROM projects WHERE id = ?").get(id) as { slug: string } | undefined;
    if (!project) return false;

    const tx = this.db.transaction(() => {
      // Delete vectors for project memories
      this.db.prepare(`
        DELETE FROM vec_memories WHERE memory_id IN (
          SELECT id FROM memories WHERE project_id = ?
        )
      `).run(project.slug);
      // Delete memories
      this.db.prepare("DELETE FROM memories WHERE project_id = ?").run(project.slug);
      // Delete project-scoped categories
      this.db.prepare("DELETE FROM categories WHERE project_id = ?").run(project.slug);
      // Delete project
      this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    });
    tx();
    return true;
  }

  private rowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToMemory(row: SqliteRow): Memory {
    return {
      id: row.id,
      key: row.key,
      content: row.content,
      category: row.category as Memory["category"],
      importance: row.importance as Memory["importance"],
      tags: JSON.parse(row.tags),
      metadata: JSON.parse(row.metadata),
      projectId: row.project_id ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      accessedAt: new Date(row.accessed_at),
      accessCount: row.access_count,
      tokenCount: row.token_count,
      version: row.version,
    };
  }
}
