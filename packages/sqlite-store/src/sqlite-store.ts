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
  User,
  CreateUserInput,
  UpdateUserInput,
  Team,
  TeamMember,
  TeamRole,
  CreateTeamInput,
  MemoryVersion,
  AuditLogEntry,
  AuditAction,
  MarketplaceListing,
  CreateMarketplaceListingInput,
  AiSuggestion,
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
  is_global: number;
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
  user_id: string;
  team_id: string | null;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
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
        is_global INTEGER NOT NULL DEFAULT 0,
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
    `);

    // Migration: add token_count column if missing (existing DBs)
    const cols = this.db.prepare("PRAGMA table_info(memories)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "token_count")) {
      this.db.exec("ALTER TABLE memories ADD COLUMN token_count INTEGER NOT NULL DEFAULT 0");
    }

    // Migration: add is_global column if missing (existing DBs)
    if (!cols.some((c) => c.name === "is_global")) {
      this.db.exec("ALTER TABLE memories ADD COLUMN is_global INTEGER NOT NULL DEFAULT 0");
    }

    // Backfill token_count for any rows that are 0
    const zeroTokenRows = this.db.prepare(
      "SELECT id, content FROM memories WHERE token_count = 0"
    ).all() as { id: string; content: string }[];
    if (zeroTokenRows.length > 0) {
      const update = this.db.prepare("UPDATE memories SET token_count = ? WHERE id = ?");
      const tx = this.db.transaction(() => {
        for (const row of zeroTokenRows) {
          update.run(estimateTokens(row.content), row.id);
        }
      });
      tx();
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        user_id TEXT NOT NULL DEFAULT 'local',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(slug, user_id)
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT 'local',
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

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS team_members (
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (team_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

      CREATE TABLE IF NOT EXISTS memory_history (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        importance TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL,
        changed_at TEXT NOT NULL DEFAULT (datetime('now')),
        changed_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_memory_history_memory ON memory_history(memory_id);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

      CREATE TABLE IF NOT EXISTS marketplace_listings (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'custom',
        tags TEXT NOT NULL DEFAULT '[]',
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        downloads INTEGER NOT NULL DEFAULT 0,
        rating REAL NOT NULL DEFAULT 0,
        is_public INTEGER NOT NULL DEFAULT 1,
        published_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_marketplace_category ON marketplace_listings(category);

      CREATE TABLE IF NOT EXISTS ai_suggestions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        related_memory_ids TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0,
        dismissed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_suggestions_user ON ai_suggestions(user_id);
    `);

    // Migration: add user_id to projects if missing
    const projCols = this.db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    if (!projCols.some((c) => c.name === "user_id")) {
      this.db.exec("ALTER TABLE projects ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local'");
    }

    // Migration: add user_id to api_keys if missing
    const keyCols = this.db.prepare("PRAGMA table_info(api_keys)").all() as { name: string }[];
    if (!keyCols.some((c) => c.name === "user_id")) {
      this.db.exec("ALTER TABLE api_keys ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local'");
    }

    // Migration: add team_id to projects if missing
    const projCols2 = this.db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    if (!projCols2.some((c) => c.name === "team_id")) {
      this.db.exec("ALTER TABLE projects ADD COLUMN team_id TEXT");
    }

    // Seed default local user
    const localUser = this.db.prepare("SELECT id FROM users WHERE id = 'local'").get();
    if (!localUser) {
      this.db.prepare(
        "INSERT OR IGNORE INTO users (id, email, name) VALUES ('local', 'local@ponderdb.local', 'Local User')"
      ).run();
    }

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
        "INSERT OR IGNORE INTO projects (id, name, slug, description, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'local', datetime('now'), datetime('now'))"
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
      INSERT INTO memories (id, key, content, category, importance, tags, metadata, embedding, project_id, is_global, token_count, created_at, updated_at, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVec = this.db.prepare(`
      INSERT INTO vec_memories (memory_id, embedding) VALUES (?, ?)
    `);

    const tx = this.db.transaction(() => {
      insertMemory.run(
        id, input.key, input.content,
        input.category ?? "custom", input.importance ?? "medium",
        JSON.stringify(input.tags ?? []), JSON.stringify(input.metadata ?? {}),
        embeddingBlob, input.projectId ?? null, input.isGlobal ? 1 : 0, tokenCount,
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

    // Save current state to history before modifying
    this.db.prepare(`
      INSERT INTO memory_history (id, memory_id, content, category, importance, tags, metadata, version, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(generateId(), id, existing.content, existing.category, existing.importance, existing.tags, existing.metadata, existing.version);

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
    if (input.isGlobal !== undefined) {
      sets.push("is_global = ?");
      params.push(input.isGlobal ? 1 : 0);
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
      conditions.push("(project_id = ? OR is_global = 1)");
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
      if (filter?.projectId && row.project_id !== filter.projectId && row.is_global !== 1) continue;

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
      conditions.push("(project_id = ? OR is_global = 1)");
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
        this.db.prepare("SELECT COUNT(*) as count FROM memories WHERE project_id = ? OR is_global = 1").get(filter.projectId) as { count: number }
      ).count;
    }
    return (this.db.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number }).count;
  }

  async recordAccess(id: MemoryId): Promise<void> {
    this.db
      .prepare("UPDATE memories SET accessed_at = datetime('now'), access_count = access_count + 1 WHERE id = ?")
      .run(id);
  }

  async getMemoryHistory(memoryId: MemoryId): Promise<MemoryVersion[]> {
    const rows = this.db.prepare(
      "SELECT * FROM memory_history WHERE memory_id = ? ORDER BY version DESC"
    ).all(memoryId) as {
      id: string; memory_id: string; content: string; category: string;
      importance: string; tags: string; metadata: string; version: number;
      changed_at: string; changed_by: string | null;
    }[];

    return rows.map((r) => ({
      id: r.id,
      memoryId: r.memory_id,
      content: r.content,
      category: r.category,
      importance: r.importance as MemoryVersion["importance"],
      tags: JSON.parse(r.tags),
      metadata: JSON.parse(r.metadata),
      version: r.version,
      changedAt: new Date(r.changed_at),
      changedBy: r.changed_by ?? undefined,
    }));
  }

  async restoreMemoryVersion(memoryId: MemoryId, versionNumber: number): Promise<Memory> {
    const historyRow = this.db.prepare(
      "SELECT * FROM memory_history WHERE memory_id = ? AND version = ?"
    ).get(memoryId, versionNumber) as {
      content: string; category: string; importance: string;
      tags: string; metadata: string;
    } | undefined;

    if (!historyRow) throw new MemoryNotFoundError(`version ${versionNumber} of ${memoryId}`);

    return this.update(memoryId, {
      content: historyRow.content,
      category: historyRow.category,
      importance: historyRow.importance as Memory["importance"],
      tags: JSON.parse(historyRow.tags),
      metadata: JSON.parse(historyRow.metadata),
    });
  }

  // ── Users ──

  async createUser(input: CreateUserInput): Promise<User> {
    const id = generateId();
    const now = new Date().toISOString();
    this.db.prepare(
      "INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, input.email, input.name, now, now);
    return this.rowToUser(this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow);
  }

  async getUserById(id: string): Promise<User | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? this.rowToUser(row) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    return row ? this.rowToUser(row) : null;
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];
    if (input.name !== undefined) { sets.push("name = ?"); params.push(input.name); }
    if (input.email !== undefined) { sets.push("email = ?"); params.push(input.email); }
    params.push(id);
    this.db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    return this.rowToUser(this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow);
  }

  async listUsers(): Promise<User[]> {
    const rows = this.db.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[];
    return rows.map((r) => this.rowToUser(r));
  }

  private rowToUser(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ── API Keys ──

  async createApiKey(name: string, userId: string): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const { key: rawKey, prefix, hash } = generateApiKey();
    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO api_keys (id, name, key_hash, prefix, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, hash, prefix, userId, now);

    return {
      apiKey: { id, name, keyHash: hash, prefix, userId, createdAt: new Date(now) },
      rawKey,
    };
  }

  async validateApiKey(rawKey: string): Promise<ApiKey | null> {
    const hash = hashApiKey(rawKey);
    const row = this.db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(hash) as {
      id: string; name: string; key_hash: string; prefix: string; user_id: string;
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
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    };
  }

  async listApiKeys(userId: string): Promise<ApiKey[]> {
    const rows = this.db.prepare("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC").all(userId) as {
      id: string; name: string; key_hash: string; prefix: string; user_id: string;
      created_at: string; last_used_at: string | null; expires_at: string | null;
    }[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      keyHash: "[hidden]",
      prefix: row.prefix,
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    }));
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
    return result.changes > 0;
  }

  async countApiKeys(userId: string): Promise<number> {
    return (this.db.prepare("SELECT COUNT(*) as count FROM api_keys WHERE user_id = ?").get(userId) as { count: number }).count;
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

  async listProjects(userId: string): Promise<Project[]> {
    // User's own projects + team projects they're a member of
    const rows = this.db.prepare(`
      SELECT DISTINCT p.* FROM projects p
      LEFT JOIN team_members tm ON p.team_id = tm.team_id
      WHERE p.user_id = ? OR tm.user_id = ?
      ORDER BY p.name ASC
    `).all(userId, userId) as ProjectRow[];
    return rows.map((r) => this.rowToProject(r));
  }

  async getProjectBySlug(slug: string, userId: string): Promise<Project | null> {
    const row = this.db.prepare("SELECT * FROM projects WHERE slug = ? AND user_id = ?").get(slug, userId) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : null;
  }

  async createProject(input: CreateProjectInput & { userId: string }): Promise<Project> {
    const id = generateId();
    const now = new Date().toISOString();
    const slug = input.slug || slugify(input.name);
    this.db.prepare(`
      INSERT INTO projects (id, name, slug, description, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, slug, input.description ?? "", input.userId, now, now);
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
      userId: row.user_id,
      teamId: row.team_id ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ── Teams ──

  async createTeam(input: CreateTeamInput, ownerId: string): Promise<Team> {
    const id = generateId();
    const slug = input.slug || slugify(input.name);
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      this.db.prepare(
        "INSERT INTO teams (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).run(id, input.name, slug, now, now);
      this.db.prepare(
        "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)"
      ).run(id, ownerId, now);
    });
    tx();

    return { id, name: input.name, slug, createdAt: new Date(now), updatedAt: new Date(now) };
  }

  async getTeamById(id: string): Promise<Team | null> {
    const row = this.db.prepare("SELECT * FROM teams WHERE id = ?").get(id) as {
      id: string; name: string; slug: string; created_at: string; updated_at: string;
    } | undefined;
    if (!row) return null;
    return { id: row.id, name: row.name, slug: row.slug, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
  }

  async getTeamBySlug(slug: string): Promise<Team | null> {
    const row = this.db.prepare("SELECT * FROM teams WHERE slug = ?").get(slug) as {
      id: string; name: string; slug: string; created_at: string; updated_at: string;
    } | undefined;
    if (!row) return null;
    return { id: row.id, name: row.name, slug: row.slug, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
  }

  async listUserTeams(userId: string): Promise<(Team & { role: TeamRole })[]> {
    const rows = this.db.prepare(`
      SELECT t.*, tm.role FROM teams t
      JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ?
      ORDER BY t.name ASC
    `).all(userId) as { id: string; name: string; slug: string; role: string; created_at: string; updated_at: string }[];

    return rows.map((r) => ({
      id: r.id, name: r.name, slug: r.slug,
      role: r.role as TeamRole,
      createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
    }));
  }

  async addTeamMember(teamId: string, userId: string, role: TeamRole): Promise<TeamMember> {
    const now = new Date().toISOString();
    this.db.prepare(
      "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)"
    ).run(teamId, userId, role, now);
    return { teamId, userId, role, joinedAt: new Date(now) };
  }

  async removeTeamMember(teamId: string, userId: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").run(teamId, userId);
    return result.changes > 0;
  }

  async listTeamMembers(teamId: string): Promise<TeamMember[]> {
    const rows = this.db.prepare(`
      SELECT tm.*, u.email, u.name as user_name FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ?
      ORDER BY tm.joined_at ASC
    `).all(teamId) as { team_id: string; user_id: string; role: string; joined_at: string; email: string; user_name: string }[];

    return rows.map((r) => ({
      teamId: r.team_id, userId: r.user_id, role: r.role as TeamRole,
      joinedAt: new Date(r.joined_at),
      user: { id: r.user_id, email: r.email, name: r.user_name },
    }));
  }

  async updateTeamMemberRole(teamId: string, userId: string, role: TeamRole): Promise<TeamMember> {
    this.db.prepare("UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?").run(role, teamId, userId);
    const row = this.db.prepare(
      "SELECT * FROM team_members WHERE team_id = ? AND user_id = ?"
    ).get(teamId, userId) as { team_id: string; user_id: string; role: string; joined_at: string };
    return { teamId: row.team_id, userId: row.user_id, role: row.role as TeamRole, joinedAt: new Date(row.joined_at) };
  }

  async deleteTeam(id: string): Promise<boolean> {
    const team = this.db.prepare("SELECT id FROM teams WHERE id = ?").get(id) as { id: string } | undefined;
    if (!team) return false;

    const tx = this.db.transaction(() => {
      // Delete team projects' memories and vectors
      const projectSlugs = this.db.prepare("SELECT slug FROM projects WHERE team_id = ?").all(id) as { slug: string }[];
      for (const p of projectSlugs) {
        this.db.prepare("DELETE FROM vec_memories WHERE memory_id IN (SELECT id FROM memories WHERE project_id = ?)").run(p.slug);
        this.db.prepare("DELETE FROM memories WHERE project_id = ?").run(p.slug);
        this.db.prepare("DELETE FROM categories WHERE project_id = ?").run(p.slug);
      }
      this.db.prepare("DELETE FROM projects WHERE team_id = ?").run(id);
      this.db.prepare("DELETE FROM team_members WHERE team_id = ?").run(id);
      this.db.prepare("DELETE FROM teams WHERE id = ?").run(id);
    });
    tx();
    return true;
  }

  // ── Sync ──

  async getChangesSince(since: string | null, userId: string): Promise<{
    memories: Memory[];
    projects: Project[];
    categories: Category[];
  }> {
    const sinceDate = since || "1970-01-01T00:00:00.000Z";

    // Get user's projects first to scope memories
    const projects = this.db.prepare(
      "SELECT * FROM projects WHERE user_id = ? AND updated_at > ?"
    ).all(userId, sinceDate) as ProjectRow[];

    const userProjectSlugs = this.db.prepare(
      "SELECT slug FROM projects WHERE user_id = ?"
    ).all(userId) as { slug: string }[];
    const slugs = userProjectSlugs.map((p) => p.slug);

    let memories: SqliteRow[] = [];
    if (slugs.length > 0) {
      const placeholders = slugs.map(() => "?").join(",");
      memories = this.db.prepare(
        `SELECT * FROM memories WHERE updated_at > ? AND (project_id IN (${placeholders}) OR is_global = 1)`
      ).all(sinceDate, ...slugs) as SqliteRow[];
    }

    const categories = this.db.prepare(
      "SELECT * FROM categories WHERE created_at > ? AND (project_id IS NULL OR project_id IN (SELECT slug FROM projects WHERE user_id = ?))"
    ).all(sinceDate, userId) as CategoryRow[];

    return {
      memories: memories.map((r) => this.rowToMemory(r)),
      projects: projects.map((r) => this.rowToProject(r)),
      categories: categories.map((r) => this.rowToCategory(r)),
    };
  }

  async applyRemoteChanges(changes: {
    memories: Memory[];
    projects: Project[];
    categories: Category[];
    deletedMemoryIds: string[];
    deletedProjectIds: string[];
    deletedCategoryIds: string[];
  }): Promise<void> {
    const tx = this.db.transaction(() => {
      // Upsert projects
      const upsertProject = this.db.prepare(`
        INSERT INTO projects (id, name, slug, description, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, updated_at=excluded.updated_at
      `);
      for (const p of changes.projects) {
        upsertProject.run(p.id, p.name, p.slug, p.description, p.userId, p.createdAt.toISOString(), p.updatedAt.toISOString());
      }

      // Upsert memories (without embeddings — those are re-generated locally)
      const upsertMemory = this.db.prepare(`
        INSERT INTO memories (id, key, content, category, importance, tags, metadata, project_id, is_global, token_count, created_at, updated_at, accessed_at, access_count, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          content=excluded.content, category=excluded.category, importance=excluded.importance,
          tags=excluded.tags, metadata=excluded.metadata, is_global=excluded.is_global,
          token_count=excluded.token_count, updated_at=excluded.updated_at,
          accessed_at=excluded.accessed_at, access_count=excluded.access_count, version=excluded.version
      `);
      for (const m of changes.memories) {
        upsertMemory.run(
          m.id, m.key, m.content, m.category, m.importance,
          JSON.stringify(m.tags), JSON.stringify(m.metadata),
          m.projectId ?? null, m.isGlobal ? 1 : 0, m.tokenCount,
          m.createdAt.toISOString(), m.updatedAt.toISOString(),
          m.accessedAt.toISOString(), m.accessCount, m.version,
        );
      }

      // Upsert categories
      const upsertCategory = this.db.prepare(`
        INSERT INTO categories (id, name, description, color, icon, project_id, is_system, is_ai_generated, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, color=excluded.color, icon=excluded.icon
      `);
      for (const cat of changes.categories) {
        upsertCategory.run(
          cat.id, cat.name, cat.description, cat.color, cat.icon ?? null,
          cat.projectId ?? null, cat.isSystem ? 1 : 0, cat.isAiGenerated ? 1 : 0,
          cat.createdAt.toISOString(),
        );
      }

      // Apply deletes
      const delMemory = this.db.prepare("DELETE FROM memories WHERE id = ?");
      const delVec = this.db.prepare("DELETE FROM vec_memories WHERE memory_id = ?");
      for (const id of changes.deletedMemoryIds) {
        delVec.run(id);
        delMemory.run(id);
      }

      const delProject = this.db.prepare("DELETE FROM projects WHERE id = ?");
      for (const id of changes.deletedProjectIds) { delProject.run(id); }

      const delCategory = this.db.prepare("DELETE FROM categories WHERE id = ? AND is_system = 0");
      for (const id of changes.deletedCategoryIds) { delCategory.run(id); }
    });

    tx();
  }

  // ── Audit Logs ──

  async createAuditLog(entry: Omit<AuditLogEntry, "id" | "createdAt">): Promise<AuditLogEntry> {
    const id = generateId();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, entry.userId, entry.action, entry.resourceType, entry.resourceId,
      JSON.stringify(entry.details), entry.ipAddress ?? null, entry.userAgent ?? null, now);
    return { ...entry, id, createdAt: new Date(now) };
  }

  async listAuditLogs(filter: {
    userId?: string; action?: AuditAction; resourceType?: string; limit?: number; offset?: number;
  }): Promise<{ items: AuditLogEntry[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.userId) { conditions.push("user_id = ?"); params.push(filter.userId); }
    if (filter.action) { conditions.push("action = ?"); params.push(filter.action); }
    if (filter.resourceType) { conditions.push("resource_type = ?"); params.push(filter.resourceType); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const total = (this.db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${where}`).get(...params) as { count: number }).count;
    const rows = this.db.prepare(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as Record<string, unknown>[];

    return {
      total,
      items: rows.map((r) => ({
        id: r.id as string, userId: r.user_id as string,
        action: r.action as AuditAction, resourceType: r.resource_type as AuditLogEntry["resourceType"],
        resourceId: r.resource_id as string, details: JSON.parse(r.details as string),
        ipAddress: (r.ip_address as string) ?? undefined, userAgent: (r.user_agent as string) ?? undefined,
        createdAt: new Date(r.created_at as string),
      })),
    };
  }

  // ── Marketplace ──

  async createMarketplaceListing(
    input: CreateMarketplaceListingInput & { authorId: string; authorName: string }
  ): Promise<MarketplaceListing> {
    const id = generateId();
    const memory = await this.getById(input.memoryId);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO marketplace_listings (id, memory_id, title, description, category, tags, author_id, author_name, is_public, published_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.memoryId, input.title, input.description,
      memory?.category ?? "custom", JSON.stringify(memory?.tags ?? []),
      input.authorId, input.authorName, input.isPublic !== false ? 1 : 0, now, now);
    return (await this.getMarketplaceListing(id))!;
  }

  async listMarketplaceListings(filter?: {
    category?: string; search?: string; limit?: number; offset?: number;
  }): Promise<{ items: MarketplaceListing[]; total: number }> {
    const conditions: string[] = ["is_public = 1"];
    const params: unknown[] = [];
    if (filter?.category) { conditions.push("category = ?"); params.push(filter.category); }
    if (filter?.search) { conditions.push("(title LIKE ? OR description LIKE ?)"); params.push(`%${filter.search}%`, `%${filter.search}%`); }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const total = (this.db.prepare(`SELECT COUNT(*) as count FROM marketplace_listings ${where}`).get(...params) as { count: number }).count;
    const rows = this.db.prepare(
      `SELECT * FROM marketplace_listings ${where} ORDER BY downloads DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as Record<string, unknown>[];

    return { total, items: rows.map((r) => this.rowToListing(r)) };
  }

  async getMarketplaceListing(id: string): Promise<MarketplaceListing | null> {
    const row = this.db.prepare("SELECT * FROM marketplace_listings WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToListing(row) : null;
  }

  async recordMarketplaceDownload(id: string): Promise<void> {
    this.db.prepare("UPDATE marketplace_listings SET downloads = downloads + 1 WHERE id = ?").run(id);
  }

  private rowToListing(r: Record<string, unknown>): MarketplaceListing {
    return {
      id: r.id as string, memoryId: r.memory_id as string,
      title: r.title as string, description: r.description as string,
      category: r.category as string, tags: JSON.parse(r.tags as string),
      authorId: r.author_id as string, authorName: r.author_name as string,
      downloads: r.downloads as number, rating: r.rating as number,
      isPublic: r.is_public === 1,
      publishedAt: new Date(r.published_at as string), updatedAt: new Date(r.updated_at as string),
    };
  }

  // ── AI Suggestions ──

  async createAiSuggestion(suggestion: Omit<AiSuggestion, "id" | "createdAt" | "dismissed"> & { userId?: string }): Promise<AiSuggestion> {
    const id = generateId();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO ai_suggestions (id, user_id, type, title, description, related_memory_ids, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, (suggestion as Record<string, unknown>).userId ?? "local", suggestion.type, suggestion.title,
      suggestion.description, JSON.stringify(suggestion.relatedMemoryIds), suggestion.confidence, now);
    return { ...suggestion, id, dismissed: false, createdAt: new Date(now) };
  }

  async listAiSuggestions(userId: string): Promise<AiSuggestion[]> {
    const rows = this.db.prepare(
      "SELECT * FROM ai_suggestions WHERE user_id = ? AND dismissed = 0 ORDER BY confidence DESC"
    ).all(userId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string, type: r.type as AiSuggestion["type"],
      title: r.title as string, description: r.description as string,
      relatedMemoryIds: JSON.parse(r.related_memory_ids as string),
      confidence: r.confidence as number, dismissed: r.dismissed === 1,
      createdAt: new Date(r.created_at as string),
    }));
  }

  async dismissAiSuggestion(id: string): Promise<boolean> {
    const result = this.db.prepare("UPDATE ai_suggestions SET dismissed = 1 WHERE id = ?").run(id);
    return result.changes > 0;
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
      isGlobal: row.is_global === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      accessedAt: new Date(row.accessed_at),
      accessCount: row.access_count,
      tokenCount: row.token_count,
      version: row.version,
    };
  }
}
