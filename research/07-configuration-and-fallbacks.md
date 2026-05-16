# User Configuration & Fallback Strategy

## What Users Can Configure + What Happens When Things Fail

---

## Table of Contents

1. [User-Configurable Settings](#1-user-configurable-settings)
2. [Fallback Chain for Every Component](#2-fallback-chain)
3. [Graceful Degradation Matrix](#3-graceful-degradation-matrix)
4. [Error Recovery Strategies](#4-error-recovery-strategies)

---

## 1. User-Configurable Settings

### Configuration File

```yaml
# ~/.memory/config.yml (or config.json)

# ==========================================
# MODE
# ==========================================
mode: hybrid                    # local | cloud | hybrid
                                # User chooses on first setup

# ==========================================
# SERVER
# ==========================================
server:
  port: 3000                    # Which port to run on
  host: 127.0.0.1              # Bind address (localhost only by default)
  cors_origins:                 # Allowed origins for web dashboard
    - http://localhost:3000
  max_request_size: 10mb        # Max memory content size

# ==========================================
# CLOUD (only for cloud/hybrid mode)
# ==========================================
cloud:
  url: https://api.memory.dev   # Cloud API endpoint (or self-hosted URL)
  api_key: mem_sk_xxxxx         # API key for cloud auth
  sync_interval: 300            # Seconds between sync attempts (default 5 min)
  sync_on_write: true           # Immediately sync on every write? (vs batch)
  sync_on_wifi_only: false      # Only sync on WiFi (mobile consideration)

# ==========================================
# DATABASE (advanced users)
# ==========================================
database:
  # Local mode
  local:
    path: ~/.memory/data/memory.db        # SQLite database path
    wal_mode: true                         # WAL mode for better concurrency
    max_size: 10gb                         # Max local DB size

  # Cloud mode (self-hosted)
  cloud:
    url: postgresql://user:pass@host:5432/memory   # PostgreSQL connection string
    pool_size: 10                                    # Connection pool size
    ssl: true                                        # Require SSL

# ==========================================
# VECTOR SEARCH
# ==========================================
vector:
  # Which vector DB to use
  engine: auto                   # auto | qdrant | pgvector | sqlite-vec | lancedb
                                 # "auto" = sqlite-vec locally, qdrant in cloud

  # Qdrant settings (cloud mode)
  qdrant:
    url: http://localhost:6333   # Qdrant URL
    api_key: null                # Qdrant API key (cloud)
    collection: memories         # Collection name

  # pgvector settings (alternative)
  pgvector:
    enabled: false               # Use pgvector instead of Qdrant
    index_type: hnsw             # hnsw | ivfflat

# ==========================================
# EMBEDDINGS
# ==========================================
embeddings:
  # Which model to use
  provider: local                # local | openai | cohere | ollama | custom

  # Local model settings
  local:
    model: bge-small-en-v1.5     # Model name
    runtime: fastembed            # fastembed | sentence-transformers | onnx
    device: auto                  # auto | cpu | cuda | mps (Apple Silicon)
    batch_size: 32                # Batch size for embedding

  # OpenAI settings (if provider: openai)
  openai:
    api_key: sk-xxx              # OpenAI API key
    model: text-embedding-3-small
    dimensions: 768              # Can reduce from 1536 for cost savings

  # Cohere settings
  cohere:
    api_key: xxx
    model: embed-english-v3.0

  # Ollama settings
  ollama:
    url: http://localhost:11434
    model: nomic-embed-text

  # Custom endpoint (any OpenAI-compatible API)
  custom:
    url: http://localhost:8080/v1/embeddings
    api_key: null
    model: custom-model

# ==========================================
# SEARCH
# ==========================================
search:
  default_mode: hybrid           # semantic | keyword | hybrid
  default_limit: 10              # Results per search
  min_relevance: 0.5             # Minimum relevance score (0-1)
  recency_boost: 0.1             # How much to boost recent memories
  access_boost: 0.05             # How much to boost frequently accessed

# ==========================================
# CATEGORIES
# ==========================================
categories:
  auto_categorize: true          # Auto-categorize new memories
  default_categories:            # Custom category list
    - architecture
    - bugs
    - api
    - deployment
    - code-patterns
    - configuration
    - security
    - performance
    - uncategorized

# ==========================================
# MEMORY MANAGEMENT
# ==========================================
memory:
  max_content_size: 100kb        # Max size per memory
  max_tags: 20                   # Max tags per memory
  max_key_length: 256            # Max key length
  auto_dedup: true               # Auto-detect duplicates
  dedup_threshold: 0.95          # Similarity threshold for dedup
  stale_detection: true          # Enable stale memory detection
  stale_days: 180                # Days without access before "stale"
  auto_archive_stale: false      # Auto-archive stale memories
  versioning: true               # Enable version history
  max_versions: 10               # Max versions to keep per memory

# ==========================================
# SYNC (hybrid mode)
# ==========================================
sync:
  conflict_resolution: lww       # lww (last-write-wins) | server-wins | manual
  compression: zstd              # zstd | gzip | none
  batch_size: 100                # Max events per sync batch
  retry_attempts: 5              # Max retry attempts on failure
  retry_backoff: exponential     # exponential | linear | fixed
  skip_embeddings: true          # Don't sync embeddings (regenerate locally)
  priority_sync: true            # Sync recently accessed memories first

# ==========================================
# NOTIFICATIONS
# ==========================================
notifications:
  websocket: true                # Real-time WebSocket notifications
  email: false                   # Email notifications
  webhook:
    enabled: false
    url: null                    # https://hooks.slack.com/xxx
    secret: null                 # Webhook signing secret
    events:                      # Which events to send
      - sync.conflict
      - quota.warning
  quiet_hours:
    enabled: false
    start: "22:00"
    end: "08:00"
    timezone: UTC

# ==========================================
# LOGGING
# ==========================================
logging:
  level: info                    # debug | info | warn | error
  format: json                   # json | pretty
  file:
    enabled: true
    path: ~/.memory/logs/memory.log
    rotation: daily              # daily | weekly | size
    max_size: 100mb              # Max per log file
    retention: 30                # Days to keep

# ==========================================
# CACHE
# ==========================================
cache:
  enabled: true
  engine: memory                 # memory (in-process LRU) | redis
  redis:
    url: redis://localhost:6379
  ttl:
    memories: 3600               # Cache TTL for memories (seconds)
    search: 300                  # Cache TTL for search results
    categories: 600              # Cache TTL for category list

# ==========================================
# SECURITY
# ==========================================
security:
  encryption_at_rest: false      # Encrypt memory content in DB
  encryption_key: null           # AES-256 key (or derive from master password)
  api_key_expiry: null           # Auto-expire API keys (days, null = never)
  rate_limit:
    enabled: true
    requests_per_minute: 60      # Override default rate limit
  allowed_ips: []                # IP whitelist (empty = allow all)

# ==========================================
# UI / DASHBOARD
# ==========================================
dashboard:
  enabled: true                  # Enable web dashboard
  theme: dark                    # dark | light | system
  language: en                   # en | zh | ja | ko | es | fr | de | pt
  page_size: 25                  # Items per page in lists
```

### Environment Variables (Override Config)

```bash
# All config values can be overridden via env vars
# Pattern: MEMORY_{SECTION}_{KEY} (uppercase, underscores)

MEMORY_MODE=hybrid
MEMORY_PORT=3000
MEMORY_CLOUD_URL=https://api.memory.dev
MEMORY_CLOUD_API_KEY=mem_sk_xxx
MEMORY_EMBEDDINGS_PROVIDER=openai
MEMORY_EMBEDDINGS_OPENAI_API_KEY=sk-xxx
MEMORY_DATABASE_CLOUD_URL=postgresql://...
MEMORY_VECTOR_ENGINE=qdrant
MEMORY_VECTOR_QDRANT_URL=http://qdrant:6333
MEMORY_LOGGING_LEVEL=debug
MEMORY_CACHE_ENGINE=redis
MEMORY_CACHE_REDIS_URL=redis://localhost:6379
```

### CLI Config Commands

```bash
# View current config
memory config list

# Set individual values
memory config set mode hybrid
memory config set embeddings.provider openai
memory config set embeddings.openai.api_key sk-xxx
memory config set cloud.url https://api.memory.dev
memory config set logging.level debug

# Reset to defaults
memory config reset

# Validate config
memory config validate
```

---

## 2. Fallback Chain for Every Component

### Embedding Model Fallbacks

```
User's configured provider
    |
    v
[Primary: configured model]
    |-- Success → use embedding
    |-- Fail (API down, quota, timeout) ↓
    v
[Fallback 1: local model (always available)]
    BGE-small-en-v1.5 via FastEmbed (bundled)
    |-- Success → use embedding (lower quality, but works)
    |-- Fail (model not downloaded yet) ↓
    v
[Fallback 2: keyword-only search]
    Skip embedding entirely, use PostgreSQL tsvector only
    |-- Always works (no ML dependency)
    |-- Quality degraded but functional
```

| Configured Provider | Fallback 1 | Fallback 2 | Fallback 3 |
|-------------------|------------|------------|------------|
| OpenAI API | Local BGE-small | Ollama (if running) | Keyword-only |
| Cohere API | Local BGE-small | Ollama (if running) | Keyword-only |
| Ollama | Local BGE-small | FastEmbed ONNX | Keyword-only |
| Local (FastEmbed) | sentence-transformers | Keyword-only | — |
| Custom endpoint | Local BGE-small | Keyword-only | — |

### Vector Database Fallbacks

```
[Primary: configured vector engine]
    |
    +-- Qdrant (cloud/self-hosted)
    |     |-- Down? → Fallback to pgvector (if PostgreSQL available)
    |     |-- pgvector down? → Fallback to brute-force SQL LIKE search
    |
    +-- pgvector (PostgreSQL extension)
    |     |-- Down? → Fallback to keyword search (tsvector)
    |
    +-- sqlite-vec (local mode)
    |     |-- Corrupt? → Rebuild from memories table
    |     |-- Too many vectors? → Switch to keyword-only + warn user
    |
    +-- LanceDB (local alternative)
          |-- Corrupt? → Rebuild from memories table
```

| Primary | Fallback 1 | Fallback 2 | Fallback 3 |
|---------|-----------|-----------|-----------|
| Qdrant Cloud | Qdrant local | pgvector | Keyword-only |
| Qdrant local | pgvector | sqlite-vec | Keyword-only |
| pgvector | sqlite-vec | Keyword-only | — |
| sqlite-vec | Keyword-only | — | — |

### Database Fallbacks

```
Cloud mode:
  [PostgreSQL primary]
      |-- Down? → Read from read replica
      |-- Replica down? → Return cached (Redis) + queue writes
      |-- Redis down? → Return stale from CDN/edge cache
      |-- Everything down? → 503 with retry-after header

Local mode:
  [SQLite]
      |-- Corrupt? → Auto-recover from WAL
      |-- WAL corrupt? → Restore from last backup (~/.memory/backups/)
      |-- No backup? → Start fresh, notify user

Hybrid mode:
  [Local SQLite] ← always works
      |-- Cloud sync fails? → Queue changes, retry later
      |-- Queue full? → Warn user, keep writing locally
```

### Cache Fallbacks

```
[Redis / Valkey]
    |-- Down? → Fall through to database (slower but works)
    |-- Slow? → Set shorter timeout (100ms), fall through on timeout

[In-process LRU cache]
    |-- Always available (in-memory)
    |-- Process restart → cold start, cache warms gradually
```

| Cache Layer | Fallback | Impact |
|-------------|----------|--------|
| Cloudflare CDN | Origin server | +50-200ms latency |
| Redis | PostgreSQL direct | +5-20ms latency |
| In-process LRU | Redis or DB | +1-5ms latency |
| All caches down | Database direct | Still works, just slower |

### Hosting Fallbacks

```
[Fly.io / Vercel / AWS]
    |-- Region down? → Auto-failover to another region (if multi-region)
    |-- Provider outage? → DNS failover to backup provider
    |-- No failover configured? → User gets downtime (single region risk)
```

| Primary Host | Fallback | Setup |
|-------------|----------|-------|
| Fly.io | Fly multi-region | `fly regions add` |
| AWS EC2 | AWS ALB + multi-AZ | Auto-scaling group |
| Vercel | Vercel edge (automatic) | Built-in |
| Self-hosted | Manual failover | User's responsibility |

### Blob Storage Fallbacks

```
[Cloudflare R2 / AWS S3]
    |-- Down? → Serve from CDN cache (if recently accessed)
    |-- Upload fails? → Queue for retry (BullMQ)
    |-- S3-compatible, so R2 ↔ S3 switch is config change only
```

| Primary | Fallback | Migration |
|---------|----------|-----------|
| Cloudflare R2 | AWS S3 | Change endpoint URL (S3-compatible) |
| AWS S3 | Cloudflare R2 | Change endpoint URL |
| MinIO (self-hosted) | S3 or R2 | Change endpoint URL |
| Local filesystem | S3/R2 | `memory migrate-blobs --to s3` |

### Notification Fallbacks

```
[WebSocket]
    |-- Connection dropped? → Auto-reconnect with exponential backoff
    |-- Server down? → Fall back to polling (/api/v1/notifications)

[Email (Resend)]
    |-- Resend down? → Queue for retry (3 attempts)
    |-- All retries fail? → Log as missed, show in dashboard

[Webhook]
    |-- Target down? → Retry 3x with exponential backoff
    |-- All retries fail? → Mark as failed, log, show in dashboard
    |-- Can't reach target? → Disable webhook after 10 consecutive failures
```

### Sync Fallbacks

```
[Cloud sync]
    |-- Internet down? → Queue locally, sync when back
    |-- Cloud API down? → Queue locally, retry with backoff
    |-- Conflict? → Apply conflict_resolution strategy from config
    |-- Queue too large (>10K events)? → Warn user, suggest full sync
    |-- Full sync fails? → Incremental sync from last checkpoint
```

### Logging Fallbacks

```
[Axiom / Grafana Loki]
    |-- Down? → Log to local file (always enabled as fallback)
    |-- File system full? → Rotate + delete oldest logs
    |-- Can't write? → Log to stderr (last resort)
```

---

## 3. Graceful Degradation Matrix

What works when things break:

| Component Down | Impact | User Experience |
|---------------|--------|-----------------|
| **Qdrant** | No semantic search | Keyword search still works. Auto-fallback. |
| **PostgreSQL** | No writes, stale reads | Read from cache. Writes queued. Critical alert. |
| **Redis** | No cache, no sessions | Slower reads (+10ms). Sessions use JWT fallback. |
| **Embedding API (OpenAI)** | No new embeddings | Local model fallback. Existing embeddings work. |
| **Internet** (hybrid mode) | No cloud sync | 100% local functionality. Sync queued. |
| **Blob storage (S3/R2)** | No large file access | Small memories still work. Uploads queued. |
| **Email service** | No email notifications | WebSocket + in-app notifications still work. |
| **WebSocket server** | No real-time updates | Dashboard polls for updates. |
| **Background queue (BullMQ)** | No async processing | Embeddings generated synchronously (slower). |
| **CDN (Cloudflare)** | Slower global access | Direct to origin. +100-200ms for distant users. |
| **Logging (Axiom)** | No centralized logs | Local file logging continues. |
| **All cloud down** | No cloud features | Local mode fully operational. |

### Key Design Principle

```
NOTHING breaks the local experience.

Every cloud feature has a local fallback.
Every API has a local alternative.
Every sync failure queues for later.

User should NEVER see "service unavailable" for core memory operations.
```

---

## 4. Error Recovery Strategies

### Automatic Recovery

| Scenario | Auto-Recovery |
|----------|--------------|
| SQLite corrupt | Auto-repair via `.recover` command |
| Vector index corrupt | Rebuild from memories table |
| Cache stale | TTL expiry + write-through invalidation |
| Sync queue stuck | Exponential backoff, max 5 retries, then alert |
| Embedding model OOM | Reduce batch size, retry |
| API rate limited | Respect Retry-After header, backoff |
| WebSocket disconnected | Auto-reconnect (1s, 2s, 4s... max 60s) |
| Background job failed | Retry 3x, then dead-letter queue |

### Manual Recovery

```bash
# Check system health
memory doctor

# Output:
# [OK] SQLite database: healthy (12,456 memories, 234 MB)
# [OK] Vector index: healthy (12,456 vectors)
# [WARN] Cloud sync: 23 events pending (last sync: 2 hours ago)
# [OK] Embedding model: loaded (BGE-small, 120 MB)
# [OK] Cache: 89% hit rate
# [ERR] Qdrant: connection refused (localhost:6333)
#       → Fallback: using keyword search only
#       → Fix: start Qdrant or run `memory config set vector.engine pgvector`

# Rebuild vector index
memory rebuild-vectors

# Force sync
memory sync --force

# Repair database
memory repair

# Backup now
memory backup

# Check config validity
memory config validate
```

### Health Check Endpoint

```json
// GET /api/v1/health
{
  "status": "degraded",     // healthy | degraded | unhealthy
  "components": {
    "database": { "status": "healthy", "latency_ms": 3 },
    "vector_db": { "status": "unhealthy", "error": "connection refused" },
    "cache": { "status": "healthy", "hit_rate": 0.89 },
    "embeddings": { "status": "healthy", "model": "bge-small-en-v1.5" },
    "sync": { "status": "degraded", "pending_events": 23 },
    "blob_storage": { "status": "healthy" }
  },
  "fallbacks_active": [
    "vector_search → keyword_only (qdrant down)"
  ],
  "uptime_seconds": 86400
}
```
