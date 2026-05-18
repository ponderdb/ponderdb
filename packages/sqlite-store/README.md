# @ponderdb/sqlite-store

SQLite + sqlite-vec storage adapter for PonderDB. Local-first, zero-config, with vector search.

## Installation

```bash
npm install @ponderdb/sqlite-store
```

## Usage

```typescript
import { SqliteStore } from "@ponderdb/sqlite-store";

const store = new SqliteStore("~/.ponderdb", 384); // data dir, embedding dimensions
await store.init(); // creates tables, indexes, seeds categories

// Create a memory
const memory = await store.create({
  key: "auth/jwt-config",
  content: "JWT uses RS256 with 15min expiry",
  category: "config",
  tags: ["auth", "jwt"],
  projectId: "my-project",
  embedding: [0.1, 0.2, ...], // 384-dim vector
});

// Search by vector similarity
const results = await store.vectorSearch(queryEmbedding, 10, {
  category: "config",
  projectId: "my-project",
});

// Keyword search
const keywordResults = await store.keywordSearch("JWT", 10);

// List with filters
const list = await store.list({
  category: "architecture",
  projectId: "my-project",
  sortBy: "updatedAt",
  sortOrder: "desc",
  limit: 20,
});

await store.close();
```

## Features

- **SQLite** via `better-sqlite3` — synchronous, fast, zero-config
- **Vector search** via `sqlite-vec` — KNN cosine similarity
- **WAL mode** — concurrent reads during writes
- **Auto-migrations** — new columns added automatically on init
- **System categories** — 10 built-in categories seeded on first run
- **Project auto-seed** — existing memory project IDs auto-create project entries
- **Token counting** — estimates token count on create/update
- **API key auth** — SHA256 hashed keys, never stored in plaintext

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `memories` | Core memory storage with embeddings |
| `vec_memories` | sqlite-vec virtual table for KNN search |
| `api_keys` | API key hashes for authentication |
| `categories` | System + custom categories |
| `projects` | Project definitions |

### Storage Location

Default: `~/.ponderdb/ponder.db`

## Requirements

- Node.js >= 22
- Platforms: macOS (Intel/ARM), Linux (x64/ARM), Windows

## License

MIT — [PonderDB](https://github.com/ponderdb/ponderdb)
