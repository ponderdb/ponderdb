import Database from "better-sqlite3";
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
} from "@ponderdb/core";
import {
  generateId,
  MemoryNotFoundError,
  DuplicateKeyError,
  cosineSimilarity,
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
  version: number;
}

export class SqliteStore implements StorageAdapter {
  private db!: Database.Database;
  private dbPath: string;

  constructor(dataDir: string) {
    const dir = resolve(dataDir);
    mkdirSync(dir, { recursive: true });
    this.dbPath = resolve(dir, "ponder.db");
  }

  async init(): Promise<void> {
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

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
        version INTEGER NOT NULL DEFAULT 1,
        UNIQUE(key, project_id)
      );

      CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
      CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
      CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
      CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories(updated_at);
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
    const embeddingBlob = input.embedding
      ? Buffer.from(new Float32Array(input.embedding).buffer)
      : null;

    this.db.prepare(`
      INSERT INTO memories (id, key, content, category, importance, tags, metadata, embedding, project_id, created_at, updated_at, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.key,
      input.content,
      input.category ?? "custom",
      input.importance ?? "medium",
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.metadata ?? {}),
      embeddingBlob,
      input.projectId ?? null,
      now, now, now,
    );

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
    if (input.embedding !== undefined) {
      sets.push("embedding = ?");
      params.push(Buffer.from(new Float32Array(input.embedding).buffer));
    }

    params.push(id);
    this.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...params);

    return this.rowToMemory(
      this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as SqliteRow,
    );
  }

  async delete(id: MemoryId): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
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
    const sortBy = filter.sortBy ?? "updated_at";
    const sortOrder = filter.sortOrder ?? "desc";
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
    // Brute-force cosine similarity for now — sqlite-vec upgrade later
    const conditions: string[] = ["embedding IS NOT NULL"];
    const params: unknown[] = [];

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
      .prepare(`SELECT * FROM memories WHERE ${where}`)
      .all(...params) as SqliteRow[];

    const scored = rows
      .map((row) => {
        const stored = new Float32Array(
          (row.embedding as Buffer).buffer,
          (row.embedding as Buffer).byteOffset,
          (row.embedding as Buffer).byteLength / 4,
        );
        const score = cosineSimilarity(embedding, Array.from(stored));
        return { memory: this.rowToMemory(row), score, matchType: "semantic" as const };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
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
      version: row.version,
    };
  }
}
