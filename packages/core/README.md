# @ponderdb/core

Core types, interfaces, and utilities for PonderDB — the universal AI agent memory server.

## Installation

```bash
npm install @ponderdb/core
```

## What's Included

### Types

```typescript
import type {
  Memory,              // Core memory object
  MemoryCategory,      // Category string (system + custom)
  MemoryImportance,    // "low" | "medium" | "high" | "critical"
  CreateMemoryInput,   // Input for storing a memory
  UpdateMemoryInput,   // Input for updating a memory
  SearchQuery,         // Search parameters
  SearchResult,        // Search result with score
  PaginatedResult,     // Paginated list response
  ListMemoriesFilter,  // Filtering and sorting options
  ApiKey,              // API key record
  Category,            // Dynamic category definition
  Project,             // Project definition
} from "@ponderdb/core";
```

### Interfaces

```typescript
import type {
  StorageAdapter,      // Storage backend interface (SQLite, Postgres, etc.)
  EmbeddingProvider,   // Embedding model interface
  SearchEngine,        // Search engine interface
} from "@ponderdb/core";
```

### Utilities

```typescript
import {
  generateId,          // Generate unique 24-char hex ID
  generateApiKey,      // Create API key with pndr_ prefix
  hashApiKey,          // SHA256 hash for secure storage
  estimateTokens,      // Estimate token count (~4 chars/token)
  detectCategory,      // Auto-detect category from content
  slugify,             // URL-friendly slug from string
  cosineSimilarity,    // Vector similarity calculation
  expandPath,          // Resolve ~ to home directory
  SYSTEM_CATEGORIES,   // Default 10 system categories
} from "@ponderdb/core";
```

### Errors

```typescript
import {
  PonderError,           // Base error class
  MemoryNotFoundError,   // 404
  DuplicateKeyError,     // 409
  ValidationError,       // 400
  AuthenticationError,   // 401
  RateLimitError,        // 429
} from "@ponderdb/core";
```

## System Categories

PonderDB ships with 10 built-in categories. Custom categories can be created via the API.

| Category | Description |
|----------|-------------|
| `architecture` | System design, structure, diagrams |
| `bug` | Bug reports, fixes, error patterns |
| `pattern` | Code patterns, conventions, best practices |
| `config` | Configuration, environment variables, settings |
| `decision` | Technical decisions, tradeoffs, rationale |
| `snippet` | Code snippets, templates, examples |
| `debug` | Debugging notes, traces, inspections |
| `workflow` | Processes, pipelines, deploy steps |
| `dependency` | Package versions, library notes |
| `custom` | Uncategorized memories |

## License

MIT — [PonderDB](https://github.com/ponderdb/ponderdb)
