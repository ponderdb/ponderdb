# @ponderdb/sdk

TypeScript SDK for PonderDB — programmatic access to the AI agent memory server.

## Installation

```bash
npm install @ponderdb/sdk
```

## Quick Start

```typescript
import { PonderClient } from "@ponderdb/sdk";

const ponder = new PonderClient({
  baseUrl: "http://127.0.0.1:7437",
  apiKey: "pndr_YOUR_KEY",
  projectId: "my-project", // optional — scopes all operations
});
```

## API

### Remember (Store)

```typescript
await ponder.remember({
  key: "auth/jwt-config",
  content: "JWT uses RS256 with 15min expiry and 7-day refresh tokens",
  category: "config",      // optional — auto-detected if omitted
  importance: "high",      // optional — "low" | "medium" | "high" | "critical"
  tags: ["auth", "jwt"],   // optional
});
```

### Recall (Get)

```typescript
const memory = await ponder.recall("auth/jwt-config");
// Returns Memory object or null if not found

console.log(memory?.content);      // "JWT uses RS256..."
console.log(memory?.category);     // "config"
console.log(memory?.tokenCount);   // 15
console.log(memory?.accessCount);  // 3
```

### Search

```typescript
const results = await ponder.search({
  query: "how does authentication work",
  category: "config",  // optional filter
  limit: 5,
});

for (const r of results) {
  console.log(`${r.memory.key} — score: ${r.score} (${r.matchType})`);
}
```

### List

```typescript
const page = await ponder.list({
  category: "architecture",
  sortBy: "updatedAt",
  sortOrder: "desc",
  limit: 20,
  offset: 0,
});

console.log(`${page.total} total, showing ${page.items.length}`);
```

### Forget (Delete)

```typescript
await ponder.forget("auth/jwt-config");
```

### Stats

```typescript
const stats = await ponder.stats();
console.log(`${stats.total} memories, server ${stats.version}`);
```

## Project Scoping

Pass `projectId` in the constructor to scope all operations:

```typescript
const ponder = new PonderClient({
  baseUrl: "http://127.0.0.1:7437",
  apiKey: "pndr_YOUR_KEY",
  projectId: "my-backend-api",
});

// All operations scoped to "my-backend-api"
await ponder.remember({ key: "db/schema", content: "..." });
const mem = await ponder.recall("db/schema");
```

Or override per-call:

```typescript
const mem = await ponder.recall("db/schema", "other-project");
```

## Error Handling

```typescript
import { PonderApiError } from "@ponderdb/sdk";

try {
  await ponder.recall("nonexistent");
} catch (err) {
  if (err instanceof PonderApiError) {
    console.log(err.statusCode); // 404
    console.log(err.code);       // "MEMORY_NOT_FOUND"
    console.log(err.message);    // "Memory not found: nonexistent"
  }
}
```

## Requirements

- Node.js >= 22 (or any runtime with global `fetch`)
- PonderDB server running

## License

MIT — [PonderDB](https://github.com/ponderdb/ponderdb)
