# Pricing, Capacity Planning & Performance

---

## Table of Contents

1. [Pricing Plans](#1-pricing-plans)
2. [Competitor Analysis](#2-competitor-analysis)
3. [Capacity Planning](#3-capacity-planning)
4. [Performance Optimization](#4-performance-optimization)
5. [Security Architecture](#5-security-architecture)
6. [Cost Analysis (Infrastructure)](#6-cost-analysis)

---

## 1. Pricing Plans

### Plan Structure

| Feature | Free | Pro ($12/mo) | Team ($25/seat/mo) | Enterprise (Custom) |
|---------|------|-------------|-------------------|-------------------|
| **Memories** | 1,000 | 100,000 | 500,000/seat | Unlimited |
| **Storage** | 100 MB | 10 GB | 50 GB/seat | Unlimited |
| **Projects** | 1 | 10 | Unlimited | Unlimited |
| **API calls/month** | 10,000 | 500,000 | 2,000,000 | Unlimited |
| **Searches/month** | 1,000 | 50,000 | 200,000 | Unlimited |
| **Categories** | 5 | Unlimited | Unlimited | Unlimited |
| **API keys** | 1 | 5 | 20/seat | Unlimited |
| **MCP tools** | All | All | All | All |
| **Semantic search** | Yes | Yes | Yes | Yes |
| **Hybrid search** | No | Yes | Yes | Yes |
| **Local mode** | Yes | Yes | Yes | Yes |
| **Cloud sync** | No | Yes | Yes | Yes |
| **Team sharing** | No | No | Yes | Yes |
| **Memory versioning** | No | Yes (10 versions) | Yes (unlimited) | Yes (unlimited) |
| **Webhooks** | No | 1 | 10 | Unlimited |
| **Priority support** | No | Email | Email + Chat | Dedicated |
| **SSO / SAML** | No | No | No | Yes |
| **Audit logs** | No | No | 90 days | Custom retention |
| **SLA** | No | 99.5% | 99.9% | 99.99% |
| **Data retention** | 30 days after delete | 90 days | 1 year | Custom |
| **Export** | JSON | JSON, CSV, Markdown | All formats | All + API |
| **Self-hosted** | No | No | No | Yes |

### Why These Price Points

| Reference | Product | Free | Pro | Team |
|-----------|---------|------|-----|------|
| Notion | Notes/docs | Yes | $10/mo | $18/seat |
| Obsidian Sync | Note sync | N/A | $8/mo | N/A |
| Pinecone | Vector DB | Yes | $70/mo | Custom |
| Mem.ai | AI memory | Yes | $15/mo | $30/seat |
| 1Password | Secrets | N/A | $3/mo | $8/seat |
| Linear | Project mgmt | Yes | $8/seat | $14/seat |

**Our positioning:** Premium dev tool. $12/mo Pro is between Notion ($10) and specialized AI tools ($15-20). Team at $25/seat competitive with dev tooling market.

### Revenue Model

```
Year 1 Target:
  Free users: 10,000
  Pro conversions (5%): 500 × $12/mo = $6,000/mo
  Team (early adopters): 20 teams × 5 seats × $25 = $2,500/mo
  Total MRR: ~$8,500/mo = ~$102K ARR

Year 2 Target:
  Free users: 50,000
  Pro (5%): 2,500 × $12 = $30,000/mo
  Team: 100 teams × 8 seats × $25 = $20,000/mo
  Enterprise: 5 × $2,000/mo = $10,000/mo
  Total MRR: ~$60,000/mo = ~$720K ARR
```

---

## 2. Competitor Analysis

### Mem0 (mem0.ai)

| Aspect | Details |
|--------|---------|
| **What** | Memory layer for AI agents and apps |
| **Focus** | Agent memory (LLM conversations), not dev tool memory |
| **Pricing** | Open source (self-host) + Cloud (beta pricing) |
| **Scale** | Cloud-first, managed vector DB |
| **Integrations** | Python SDK, REST API, LangChain, CrewAI |
| **Weakness** | No MCP support, no IDE integrations, not dev-focused |
| **Differentiation** | We target developers + IDE + MCP. They target AI agents. |

### Zep (zep.ai)

| Aspect | Details |
|--------|---------|
| **What** | Long-term memory for AI assistants |
| **Focus** | Conversation history + facts extraction for chatbots |
| **Pricing** | Open source + Zep Cloud (free tier + paid) |
| **Scale** | Temporal knowledge graphs |
| **Integrations** | Python SDK, LangChain, LlamaIndex |
| **Weakness** | Chatbot-focused, no dev tool integrations |
| **Differentiation** | We're dev-first, MCP-native, cross-tool. They're chatbot memory. |

### LangChain Memory

| Aspect | Details |
|--------|---------|
| **What** | Memory modules within LangChain framework |
| **Focus** | In-framework memory (conversation buffer, entity, summary) |
| **Pricing** | Free (open source) |
| **Weakness** | Framework-locked (LangChain only), no persistence across tools |
| **Differentiation** | We're framework-agnostic, cross-tool, persistent. |

### Rewind.ai / Recall.ai

| Aspect | Details |
|--------|---------|
| **What** | Screen recording + search for personal memory |
| **Focus** | Record everything on screen, search later |
| **Pricing** | $20-25/mo |
| **Weakness** | General purpose, not dev-focused, no AI tool integration |
| **Differentiation** | We're structured dev memory, not screen recording. |

### Letta (formerly MemGPT)

| Aspect | Details |
|--------|---------|
| **What** | Infinite context via memory management for agents |
| **Focus** | Research-origin; fine-grained memory management in agents |
| **Pricing** | Open source; limited cloud offering |
| **Weakness** | Complex research-oriented API; not production-grade SaaS yet |
| **Differentiation** | We're production-ready, MCP-native, simpler API |

### Motorhead (Metal.io)

| Aspect | Details |
|--------|---------|
| **What** | Stateless memory service for LLMs (conversation history + summarization) |
| **Status** | Largely abandoned (Metal.io pivoted) |
| **Differentiation** | Vacated space — opportunity to fill |

### Competitive Moat

```
Our unique position: CROSS-TOOL DEVELOPER MEMORY

Nobody else does ALL of these:
  1. MCP-native (works with Claude, Cursor, Windsurf, Copilot, ChatGPT, Gemini CLI, JetBrains)
  2. Developer-specific (code patterns, bugs, architecture, not chat history)
  3. Cross-tool (same memory in ALL AI tools via single MCP server)
  4. Local-first (works offline, syncs when online)
  5. Team memory (shared project knowledge)
  6. Auto-categorized for dev workflow
  7. Zero-knowledge encryption option (Enterprise)
```

---

## 3. Capacity Planning

### Single Server Capacity

| Component | Capacity (single node) | Bottleneck |
|-----------|----------------------|------------|
| PostgreSQL (16 vCPU, 64 GB) | ~50M memories, 5K QPS | Disk I/O |
| Qdrant (8 vCPU, 32 GB) | ~20M vectors (768d) | RAM |
| Redis (4 GB) | ~500K cached memories | RAM |
| API Server (4 vCPU) | ~10K req/sec | CPU |
| WebSocket Server | ~50K connections | RAM + FDs |

### Users Per Server

| Setup | Concurrent Users | Total Users | Monthly Cost |
|-------|-----------------|-------------|-------------|
| Single Fly.io (2 vCPU) + Neon free | 100 | 1,000 | $0-20 |
| 2x Fly.io + Neon Pro + Qdrant free | 500 | 5,000 | $50-100 |
| 4x Fly.io + Neon Scale + Qdrant starter | 2,000 | 20,000 | $200-400 |
| Auto-scale + managed everything | 10,000 | 100,000 | $1,000-3,000 |
| Multi-region + sharded | 50,000+ | 1,000,000+ | $5,000-20,000 |

### Resource Per User (Average)

| Resource | Free User | Pro User | Team User |
|----------|-----------|----------|-----------|
| Memories | 200 | 10,000 | 30,000 |
| Storage | 5 MB | 500 MB | 1.5 GB |
| Vectors (768d) | 200 × 3 KB = 600 KB | 10K × 3 KB = 30 MB | 30K × 3 KB = 90 MB |
| API calls/day | 30 | 500 | 2,000 |
| DB connections | 0.01 (pooled) | 0.05 | 0.1 |

### Scaling Milestones

| Milestone | Action | Trigger |
|-----------|--------|---------|
| 1K users | Add read replica | DB CPU > 70% |
| 5K users | Add Qdrant dedicated | Vector search > 100ms p99 |
| 10K users | PgBouncer | Connection count > 100 |
| 20K users | Horizontal API servers | API latency > 200ms p99 |
| 50K users | Shard by user_id | DB storage > 500 GB |
| 100K users | Multi-region | Latency requirements |
| 500K users | Dedicated Kubernetes cluster | Operational complexity |

### Database Sharding Strategy

```
Phase 1 (< 50K users): Single PostgreSQL, partitioned by user_id hash
Phase 2 (50K-500K): Citus extension (distributed PostgreSQL)
Phase 3 (500K+): Application-level sharding by user_id range

Shard key: user_id (ensures all user's memories on same shard)
Number of shards: start with 8, double as needed
Rebalancing: online, no downtime with Citus
```

### Connection Pooling

```
                 App Instances (N)
                      |
                 PgBouncer
                 (transaction mode)
                      |
            Pool size: 25 per server
            Max DB connections: 100
                      |
                 PostgreSQL
                 max_connections = 150
                 (100 app + 50 admin/monitoring)
```

Config:
```ini
# pgbouncer.ini
[databases]
memory = host=localhost dbname=memory

[pgbouncer]
pool_mode = transaction
max_client_conn = 10000
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3
```

---

## 4. Performance Optimization

### Lightweight System Design

Goal: Minimal resource usage on user machines and servers.

#### Client Side (Local Mode)

| Optimization | Impact |
|-------------|--------|
| SQLite (not PostgreSQL) | 0 MB overhead vs 200+ MB |
| FastEmbed (ONNX) | 120 MB vs 2+ GB for PyTorch |
| Lazy model loading | Model loaded on first search, not startup |
| Single binary (Bun) | ~80 MB vs ~200 MB (Node + deps) |
| No background processes | Server starts on demand, sleeps after idle |
| Compressed storage (zstd) | 60-80% disk savings |
| Memory-mapped vectors | Vectors read from disk, not loaded to RAM |

#### Server Side (Cloud Mode)

| Optimization | Impact | Implementation |
|-------------|--------|----------------|
| **Edge caching** | <10ms reads globally | Cloudflare Workers KV |
| **CDN** | Static asset delivery | Cloudflare CDN (free) |
| **Connection pooling** | 100x more connections | PgBouncer |
| **Query result caching** | 90% cache hit rate | Redis (5-min TTL) |
| **Lazy embeddings** | Non-blocking writes | BullMQ background job |
| **Cursor pagination** | Constant time listing | Keyset pagination |
| **Partial responses** | Less data transfer | Field selection in API |
| **Batch operations** | Fewer round trips | Bulk API endpoints |
| **zstd compression** | 60-80% transfer savings | On API responses |
| **HTTP/3** | Faster connections | Cloudflare proxy |
| **Streaming** | Lower TTFB | Server-Sent Events |
| **Index-only scans** | No table access for counts | PostgreSQL covering indexes |
| **Materialized views** | Pre-computed stats | Refresh hourly |

### Rate Limiting

```
Algorithm: Sliding window (Redis)

Limits per plan:
  Free:       60 req/min,   20 searches/min,  10 writes/min
  Pro:        300 req/min,  100 searches/min,  50 writes/min
  Team:       1000 req/min, 300 searches/min,  150 writes/min
  Enterprise: Custom

Response on throttle:
  HTTP 429 Too Many Requests
  Headers:
    X-RateLimit-Limit: 60
    X-RateLimit-Remaining: 0
    X-RateLimit-Reset: 1714742460
    Retry-After: 30
```

### Caching Strategy

```
Layer 1: Edge (Cloudflare Workers KV)
  - Immutable memory content (by version hash)
  - TTL: 24 hours
  - Hit rate: ~60% for reads

Layer 2: Redis/Valkey (in-memory)
  - Hot memories (recently accessed)
  - Search result cache (5-min TTL)
  - User session data
  - Rate limit counters
  - Hit rate: ~80% for repeated reads

Layer 3: Application (in-process)
  - LRU cache (100 items per process)
  - Category list cache (10-min TTL)
  - Embedding model (loaded once)
  - Config/settings cache

Cache Invalidation:
  - Write-through: update cache on write
  - Publish invalidation event via Redis Pub/Sub
  - All instances evict stale entries
```

### Background Job Queue

```typescript
// BullMQ (Redis-backed, lightweight)
import { Queue, Worker } from 'bullmq';

// Queues
const embeddingQueue = new Queue('embeddings', { connection: redis });
const syncQueue = new Queue('sync', { connection: redis });
const notifyQueue = new Queue('notifications', { connection: redis });
const cleanupQueue = new Queue('cleanup', { connection: redis });

// Workers
new Worker('embeddings', async (job) => {
  const { memoryId, content } = job.data;
  const embedding = await embedModel.encode(content);
  await qdrant.upsert(memoryId, embedding);
}, { connection: redis, concurrency: 5 });

new Worker('sync', async (job) => {
  const { userId, events } = job.data;
  await syncService.pushToCloud(userId, events);
}, { connection: redis, concurrency: 10 });
```

### Query Optimization

```sql
-- Covering index for common list query (index-only scan)
CREATE INDEX idx_memories_list ON memories
  (user_id, created_at DESC)
  INCLUDE (key, category_id, tags, byte_size, source);

-- Partial index for non-deleted memories
CREATE INDEX idx_memories_active ON memories (user_id, key)
  WHERE is_deleted = false;

-- Materialized view for dashboard stats
CREATE MATERIALIZED VIEW user_stats AS
SELECT
  user_id,
  COUNT(*) as total_memories,
  SUM(byte_size) as total_bytes,
  COUNT(DISTINCT category_id) as categories_used,
  MAX(created_at) as last_memory_at
FROM memories
WHERE is_deleted = false
GROUP BY user_id;

-- Refresh hourly
CREATE OR REPLACE FUNCTION refresh_stats() RETURNS void AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats;
$$ LANGUAGE sql;
```

### Compression

| Data | Method | Ratio | When |
|------|--------|-------|------|
| Memory content (DB) | zstd | ~70% | On write (large memories > 1KB) |
| API responses | brotli | ~75% | HTTP Content-Encoding |
| Sync payloads | zstd | ~70% | On sync |
| Vectors (Qdrant) | Scalar quantization | ~75% | Index time |
| Backups | zstd | ~80% | On export |
| Log files | gzip | ~90% | On rotation |

---

## 5. Security Architecture

### Authentication Flow

```
Web Login:
  User → NextAuth.js → OAuth (GitHub/Google) → Session cookie

API Access:
  Client → Bearer token (mem_sk_xxx) → Validate hash → RLS context

MCP Access:
  MCP client → API key from env → Same as API access
```

### API Key Security

```
Generation:
  1. Generate 32 random bytes
  2. Encode as base62 → mem_sk_{random}
  3. Hash with bcrypt (work factor 12) → store hash
  4. Return plaintext key once (never stored)

Validation:
  1. Extract prefix from key
  2. Lookup by prefix in DB
  3. bcrypt.compare(key, stored_hash)
  4. Check expiry, scopes, rate limits
```

### Encryption

| Layer | What | How | Key Management |
|-------|------|-----|---------------|
| Transit | All traffic | TLS 1.3 | Let's Encrypt / Cloudflare |
| Database | Disk encryption | AES-256 | Cloud provider managed |
| Backups | Backup files | AES-256-GCM | App-managed key |
| API keys | Stored hashes | bcrypt | N/A (one-way) |
| Passwords | Stored hashes | Argon2id | N/A (one-way) |
| E2E (optional) | Memory content | AES-256-GCM | Client-side key |

### Zero-Knowledge Option (Enterprise)

```
Client encrypts memory content before upload:
  1. User has master password → derive key via PBKDF2/Argon2
  2. Each memory encrypted with AES-256-GCM
  3. Server stores ciphertext — cannot read content
  4. Search: client-side vector generation before encryption
  5. Trade-off: server-side search degraded (can only search metadata)
```

### GDPR Compliance

| Requirement | Implementation |
|------------|---------------|
| Right to access | `GET /api/v1/export` — download all data |
| Right to delete | `DELETE /api/v1/account` — full data wipe |
| Data portability | Export in JSON/CSV/Markdown |
| Consent | Explicit opt-in for cloud features |
| Data processing | Documented in privacy policy |
| Breach notification | Automated alerting + email |
| DPO | Required for enterprise |

### Row-Level Security

```sql
-- Every query automatically filtered by user
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Personal memories: user can only see own
CREATE POLICY user_memories ON memories
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::UUID);

-- Team memories: team members can see
CREATE POLICY team_memories ON memories
  FOR SELECT
  USING (
    team_id IS NOT NULL AND
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = current_setting('app.current_user_id')::UUID
    )
  );

-- Team write: only admins and owners
CREATE POLICY team_write ON memories
  FOR INSERT
  USING (
    team_id IS NULL OR  -- personal
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = current_setting('app.current_user_id')::UUID
        AND role IN ('owner', 'admin')
    )
  );
```

---

## 6. Cost Analysis (Infrastructure)

### What's Free

| Component | Free Option | Limit |
|-----------|------------|-------|
| API Server runtime | Fly.io free tier | 3 shared VMs, 256 MB each |
| PostgreSQL | Neon free | 512 MB storage, 1 project |
| Vector DB | Qdrant Cloud free | 1 GB RAM, 1 cluster |
| Redis | Upstash free | 10K commands/day |
| Object Storage | Cloudflare R2 free | 10 GB + 10M req/mo |
| CDN | Cloudflare free | Unlimited |
| SSL | Let's Encrypt / Cloudflare | Free |
| Email | Resend free | 3K emails/mo |
| Error tracking | Sentry free | 5K events/mo |
| Monitoring | Grafana Cloud free | 10K metrics, 50 GB logs |
| CI/CD | GitHub Actions | 2K min/mo |
| Domain | N/A | ~$12/yr |

**Total MVP cost with free tiers: ~$1/mo (domain only)**

### Cost at Scale

| Scale | Compute | Database | Vector DB | Cache | Storage | Total |
|-------|---------|----------|-----------|-------|---------|-------|
| **1K users** | $15 | $19 | $0 | $0 | $0 | **~$35/mo** |
| **5K users** | $30 | $40 | $25 | $10 | $5 | **~$110/mo** |
| **10K users** | $60 | $80 | $50 | $20 | $10 | **~$220/mo** |
| **50K users** | $200 | $300 | $200 | $50 | $50 | **~$800/mo** |
| **100K users** | $500 | $700 | $400 | $100 | $100 | **~$1,800/mo** |
| **500K users** | $2,000 | $3,000 | $1,500 | $300 | $500 | **~$7,300/mo** |
| **1M users** | $4,000 | $6,000 | $3,000 | $500 | $1,000 | **~$14,500/mo** |

### Unit Economics

| Plan | Revenue/user/mo | Infra cost/user/mo | Gross Margin |
|------|----------------|-------------------|-------------|
| Free | $0 | $0.02 | -$0.02 |
| Pro ($12) | $12 | $0.10 | 99.2% |
| Team ($25) | $25 | $0.20 | 99.2% |

At 100K users (5% pro, 2% team):
```
Revenue: 5,000 × $12 + 2,000 × $25 = $110,000/mo
Infra:   $1,800/mo
Gross margin: $108,200/mo (98.4%)
```

Very favorable unit economics — typical for SaaS with shared infrastructure.

### Cost Optimization Strategies

| Strategy | Savings | When |
|----------|---------|------|
| Serverless DB (Neon) | Scale to zero idle | Low usage periods |
| Spot instances (compute) | 60-80% | Non-critical workloads |
| Reserved instances | 30-50% | Stable baseline load |
| R2 instead of S3 | No egress fees | All blob storage |
| Compression (zstd) | 70% storage | Always |
| Cold storage tier | 80% | Memories not accessed 90+ days |
| Edge caching | Reduce origin load | All reads |
| Free tier limits | Control costs | Prevent abuse |
