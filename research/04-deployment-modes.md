# Deployment Modes, Offline Sync, Notifications & Logging

---

## Table of Contents

1. [Local Mode (No Internet)](#1-local-mode)
2. [Cloud Mode](#2-cloud-mode)
3. [Hybrid Mode (Local + Cloud)](#3-hybrid-mode)
4. [Offline-First Architecture](#4-offline-first-architecture)
5. [Sync Protocol Deep Dive](#5-sync-protocol-deep-dive)
6. [Notification System](#6-notification-system)
7. [Logging & Observability](#7-logging--observability)
8. [Installation Methods](#8-installation-methods)

---

## 1. Local Mode

### What Works Without Internet

Everything. Full memory CRUD, search, categories, dashboard — all local.

### Architecture

```
+---------------------------------------------+
|              USER'S MACHINE                  |
|                                              |
|  +------------------+  +------------------+  |
|  | CLI + MCP Server |  | Web Dashboard    |  |
|  | (stdio or local  |  | (localhost:3000) |  |
|  |  HTTP)           |  |                  |  |
|  +--------+---------+  +--------+---------+  |
|           |                      |           |
|  +--------v----------------------v---------+ |
|  |          Local API Server               | |
|  |          (Bun / Node.js)                | |
|  +--------+------------------+-------------+ |
|           |                  |               |
|  +--------v--------+  +-----v-----------+   |
|  |   SQLite         |  | sqlite-vec       |  |
|  |  (memories,      |  | (vector search,  |  |
|  |   users, logs)   |  |  < 1M vectors)   |  |
|  +------------------+  +------------------+  |
|                                              |
|  +------------------+                        |
|  | Embedding Model  |                        |
|  | BGE-small-en     |                        |
|  | (120 MB, CPU)    |                        |
|  +------------------+                        |
+----------------------------------------------+
```

### System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | Any modern (x64/ARM64) | Apple M1+ / 4-core x64 |
| RAM | 512 MB | 2 GB |
| Disk | 500 MB (app + model) | 2 GB+ |
| OS | macOS 12+, Ubuntu 20+, Windows 10+ | Latest |
| GPU | Not needed | Not needed |
| Network | Not needed | Not needed |

### Storage Capacity (Local)

| Memories | Avg Size | SQLite DB | Vector DB | Total |
|----------|----------|-----------|-----------|-------|
| 1,000 | 500 bytes | ~2 MB | ~3 MB | ~5 MB |
| 10,000 | 500 bytes | ~20 MB | ~30 MB | ~50 MB |
| 100,000 | 500 bytes | ~200 MB | ~300 MB | ~500 MB |
| 1,000,000 | 500 bytes | ~2 GB | ~3 GB | ~5 GB |

### Local Vector DB Options (Beyond sqlite-vec)

| Option | Type | Notes |
|--------|------|-------|
| **sqlite-vec** | SQLite extension | Zero deps, brute-force, best for <100K vectors |
| **LanceDB** | Embedded columnar | Rust-based, zero-copy Arrow format, excellent M1 perf, supports versioning |
| **Qdrant local** | Standalone binary | Single Rust binary, ~50 MB RAM idle, best ANN quality locally |
| **DuckDB + VSS** | Analytical embedded | HNSW extension, good for analytical queries over memories |

**LanceDB** is a strong alternative — handles both structured + vector data in one file, no separate vector DB needed.

### Local Embedding Options

| Model | Runtime | RAM | Speed (CPU) | Quality | Install |
|-------|---------|-----|-------------|---------|---------|
| all-MiniLM-L6-v2 (ONNX) | ONNX Runtime | 100 MB | ~5ms/sent on M1 | Good | `pip install onnxruntime` |
| BGE-small-en-v1.5 (ONNX) | ONNX Runtime | 120 MB | ~8K sent/sec | Better | `pip install fastembed` |
| nomic-embed-text Q4 | llama.cpp | 200 MB | ~200-500 tok/sec | Best | `ollama pull nomic-embed-text` |
| BGE-small-en-v1.5 | sentence-transformers | 120 MB | 10K sent/sec | Better | `pip install sentence-transformers` |
| FastEmbed (ONNX) | ONNX Runtime | 120 MB | 8K sent/sec | Better | `pip install fastembed` |

> **Mac M1+:** ONNX Runtime auto-uses CoreML execution provider for ~3x speedup. All models work without GPU.

**Recommendation:** FastEmbed with BGE-small — fast, lightweight, ONNX runtime, no Python ML deps.

### Local Mode Limitations

- Search quality limited by sqlite-vec (brute-force, no ANN)
- No team features (no server to coordinate)
- No backup unless user manually copies DB file
- Embedding model adds 120-540 MB to install size

---

## 2. Cloud Mode

### Architecture

```
Internet
    |
+---v-------------------------------------------------+
|  Cloudflare (CDN + DDoS + SSL)                       |
+---+-------------------------------------------------+
    |
+---v-------------------------------------------------+
|  Load Balancer (Fly.io / Railway / Vercel)           |
+---+-------------------------------------------------+
    |
+---v-----------+  +----------+  +-----------+
| API Server(s) |  | MCP SSE  |  | WebSocket |
| (Node/Bun)    |  | Server   |  | Server    |
+---+-----------+  +----+-----+  +-----+-----+
    |                   |              |
+---v-------------------v--------------v---+
|           Service Layer                    |
+---+------------------+------------------+-+
    |                  |                  |
+---v--------+  +------v------+  +-------v----+
| PostgreSQL |  | Qdrant      |  | Redis      |
| (Neon /    |  | Cloud       |  | (Upstash)  |
| Supabase)  |  |             |  |            |
+---+--------+  +-------------+  +------------+
    |
+---v--------+
| S3 / R2    |
| (blobs)    |
+------------+
```

### Cloud Provider Comparison

#### Compute (API Server)

| Provider | Free Tier | Pro Cost | Auto-Scale | Region |
|----------|-----------|----------|------------|--------|
| **Fly.io** | 3 shared VMs | ~$5-15/mo | Yes | Global |
| **Railway** | $5 credit/mo | ~$5-20/mo | Yes | US/EU |
| **Render** | 750 hrs/mo | ~$7/mo | Yes | US/EU |
| **Vercel** | 100GB bw/mo | ~$20/mo | Yes (edge) | Global |
| **AWS ECS Fargate** | 12 months free | ~$30+/mo | Yes | Global |
| **Hetzner** | None | ~$4/mo (VPS) | Manual | EU |
| **DigitalOcean** | $200 credit | ~$6/mo | Yes | Global |

**Recommendation:** Fly.io for MVP (generous free tier, global edge, easy deploy).

#### PostgreSQL (Managed)

| Provider | Free Tier | Pro Cost | Max Storage | Branching | Edge |
|----------|-----------|----------|-------------|-----------|------|
| **Neon** | 512 MB, 1 project | $19/mo | 50 GB+ | Yes | Yes |
| **Supabase** | 500 MB, 2 projects | $25/mo | 8 GB+ | No | No |
| **PlanetScale** | Discontinued free | $39/mo | 10 GB+ | Yes | Yes |
| **CockroachDB** | 10 GiB | $0.50/vCPU-hr | Unlimited | No | Yes |
| **AWS RDS** | 12 months | ~$15+/mo | Unlimited | No | No |
| **Fly Postgres** | Included | ~$7/mo | Varies | No | Yes |

**Recommendation:** Neon (serverless, branching, auto-scales to zero, pgvector built-in).

#### Vector Database (Managed)

| Provider | Free Tier | Pro Cost | Vectors (free) |
|----------|-----------|----------|----------------|
| **Qdrant Cloud** | 1 GB RAM | $25+/mo | ~1M (quantized) |
| **Pinecone** | 100K vectors | $70+/mo | 100K |
| **Weaviate Cloud** | 14-day sandbox | $25+/mo | Limited |
| **Zilliz (Milvus)** | 2 CU, 2 GB | $65+/mo | ~500K |

**Recommendation:** Qdrant Cloud (best free tier, good perf, cheaper).

#### Redis / Cache

| Provider | Free Tier | Pro Cost |
|----------|-----------|----------|
| **Upstash** | 10K commands/day | $10+/mo |
| **Redis Cloud** | 30 MB | $7+/mo |
| **Fly Redis** | Included | ~$5/mo |
| **Momento** | 50 GB transfer/mo | Pay per use |

**Recommendation:** Upstash (serverless, pay-per-request, generous free).

#### Object Storage

| Provider | Free Tier | Cost/GB/mo |
|----------|-----------|------------|
| **Cloudflare R2** | 10 GB + 10M requests | $0.015/GB |
| **AWS S3** | 5 GB (12 months) | $0.023/GB |
| **Backblaze B2** | 10 GB | $0.006/GB |
| **MinIO** | Self-hosted (free) | $0 |

**Recommendation:** Cloudflare R2 (no egress fees, cheapest for reads).

### Cloud Cost Estimates

| Scale | Users | Memories | Monthly Cost |
|-------|-------|----------|-------------|
| Dev | 1-10 | <10K | **$0** (free tiers) |
| Startup | 100-1K | 100K-1M | **$50-100/mo** |
| Growth | 1K-10K | 1M-10M | **$200-500/mo** |
| Scale | 10K-100K | 10M-100M | **$1,000-3,000/mo** |
| Large | 100K-1M | 100M-1B | **$5,000-15,000/mo** |

---

## 3. Hybrid Mode (Local + Cloud)

### How It Works

```
LOCAL (always available)          CLOUD (when online)
+---------------------+          +---------------------+
| SQLite (full copy    |  sync   | PostgreSQL (master)  |
|  of user's memories) |<------->| Qdrant (full index)  |
| sqlite-vec (vectors) |         | Redis (cache)        |
+---------------------+          +---------------------+

Write: LOCAL first → queue → sync to CLOUD
Read:  LOCAL first → fallback CLOUD if stale
Search: LOCAL (fast, limited) or CLOUD (full power)
```

### Sync Strategy

| Data | Direction | Frequency | Method |
|------|-----------|-----------|--------|
| Memories (own) | Bidirectional | Real-time (when online) | Delta sync |
| Team memories | Cloud → Local | Periodic (5 min) | Pull |
| Categories | Bidirectional | Real-time | Full sync |
| Vectors | Not synced | N/A | Regenerate locally |
| Settings | Bidirectional | On change | Full sync |
| Logs | Local → Cloud | Batch (hourly) | Append |

### Conflict Resolution

```
Scenario: Same memory edited on laptop (offline) and web dashboard

1. Detect: checksum mismatch on sync
2. Compare: server_updated_at vs local_updated_at
3. Strategy:
   a. Different fields changed → Auto-merge
   b. Same field changed → Last-write-wins (configurable)
   c. Critical conflict → Create conflict copy, notify user
4. Log: All conflicts recorded in conflict_log table
5. UI: Dashboard shows conflict history with diff view
```

### Bandwidth Optimization

| Technique | Savings | How |
|-----------|---------|-----|
| Delta sync | 80-95% | Send only changed fields, not full memory |
| zstd compression | 60-80% | Compress sync payloads |
| Batch sync | 50% overhead reduction | Bundle 10-100 changes per request |
| Skip embeddings | 90% vector traffic | Regenerate vectors locally |
| Dedup detection | Variable | Skip if content hash unchanged |
| Priority queue | N/A | Sync recently accessed first |

---

## 4. Offline-First Architecture

### Core Principle

App works 100% offline. Cloud is an enhancement, not a requirement.

### State Machine

```
                    +----------+
                    |  ONLINE  |
                    +----+-----+
                         |
              internet detected
                         |
              +----------v----------+
              | Sync pending queue  |
              | Pull remote changes |
              | Resolve conflicts   |
              +----------+----------+
                         |
              sync complete / internet lost
                         |
                    +----v-----+
                    |  OFFLINE |
                    +----+-----+
                         |
                    all ops work
                    writes queued
                         |
                    +----v----------+
                    | SYNC_PENDING  |
                    | (N changes    |
                    |  queued)      |
                    +---------------+
```

### Internet Detection

```typescript
// Connectivity monitor
class ConnectivityMonitor {
  private online = false;
  private checkInterval = 30_000; // 30 sec

  async check(): Promise<boolean> {
    try {
      // HEAD request to our API (lightweight)
      const res = await fetch(`${API_URL}/health`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      this.online = res.ok;
    } catch {
      this.online = false;
    }
    return this.online;
  }

  onOnline(callback: () => void) {
    // Trigger sync when internet returns
  }
}
```

### Sync Queue (SQLite)

```sql
CREATE TABLE sync_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT NOT NULL,      -- CREATE, UPDATE, DELETE
    memory_key  TEXT NOT NULL,
    payload     TEXT NOT NULL,       -- JSON
    checksum    TEXT NOT NULL,       -- SHA-256 of content
    created_at  TEXT DEFAULT (datetime('now')),
    attempts    INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'pending'  -- pending, syncing, synced, failed
);

CREATE INDEX idx_sync_status ON sync_queue(status);
```

### Local-First Database Options

| Library | Approach | Maturity | Best For |
|---------|----------|----------|----------|
| **Custom (SQLite + queue)** | Event sourcing | N/A | Full control, our choice |
| CR-SQLite | CRDTs on SQLite | Alpha | Auto-merge (experimental) |
| ElectricSQL | Postgres → SQLite sync | Beta | If already on Postgres |
| PowerSync | Managed sync service | Production | If want managed solution |
| PouchDB/CouchDB | Document-level sync | Mature | If using document DB |

**Our choice:** Custom SQLite + event queue. Simple, debuggable, no vendor lock-in.

---

## 5. Sync Protocol Deep Dive

### Push Protocol

```
Client                              Server
  |                                    |
  |  POST /api/v1/sync/push           |
  |  {                                 |
  |    client_id: "laptop-001",        |
  |    last_sync: "2025-05-03T10:00Z", |
  |    events: [                       |
  |      {                             |
  |        type: "CREATE",             |
  |        key: "auth/jwt",            |
  |        content: "...",             |
  |        checksum: "abc123",         |
  |        timestamp: "...T10:05Z"     |
  |      },                            |
  |      {                             |
  |        type: "UPDATE",             |
  |        key: "deploy/process",      |
  |        content: "...",             |
  |        checksum: "def456",         |
  |        timestamp: "...T10:07Z"     |
  |      }                             |
  |    ]                               |
  |  }                                 |
  | ---------------------------------> |
  |                                    |  Process events
  |                                    |  Detect conflicts
  |                                    |
  |  Response:                         |
  |  {                                 |
  |    accepted: ["auth/jwt"],         |
  |    conflicts: [{                   |
  |      key: "deploy/process",        |
  |      server_version: { ... },      |
  |      client_version: { ... },      |
  |      resolution: "server_wins"     |
  |    }],                             |
  |    server_changes: [               |
  |      { type: "CREATE",            |
  |        key: "team/standup-notes",  |
  |        ... }                       |
  |    ],                              |
  |    sync_token: "sync_xyz789"       |
  |  }                                 |
  | <--------------------------------- |
  |                                    |
  |  Apply server_changes locally      |
  |  Mark synced events as done        |
  |  Handle conflicts (show UI or LWW) |
```

### Pull Protocol

```
Client                              Server
  |                                    |
  |  GET /api/v1/sync/pull             |
  |  ?since=sync_xyz789                |
  |  &limit=100                        |
  | ---------------------------------> |
  |                                    |
  |  Response:                         |
  |  {                                 |
  |    changes: [ ... ],               |
  |    has_more: false,                |
  |    sync_token: "sync_abc012"       |
  |  }                                 |
  | <--------------------------------- |
```

### Sync Tokens

Opaque cursors representing sync position. Better than timestamps (no clock skew issues).

```
sync_token = base64(JSON.stringify({
  user_id: "...",
  sequence: 12345,      // monotonic counter
  timestamp: "...",
  partition: 0
}))
```

---

## 6. Notification System

### Architecture

```
Event Sources                    Event Bus              Delivery Channels
+-----------+                   +---------+             +-------------+
| Memory    |                   |         |------------>| WebSocket   |
| Service   |------------------>|  Redis  |             | (real-time) |
+-----------+                   |  Pub/   |             +-------------+
+-----------+                   |  Sub    |             +-------------+
| Sync      |------------------>|         |------------>| In-App      |
| Service   |                   |         |             | (dashboard) |
+-----------+                   |         |             +-------------+
+-----------+                   |         |             +-------------+
| System    |------------------>|         |------------>| Email       |
| Events    |                   |         |             | (Resend)    |
+-----------+                   +---------+             +-------------+
                                                        +-------------+
                                                        | Webhook     |
                                                        | (external)  |
                                                        +-------------+
```

### Notification Events

| Event | WebSocket | In-App | Email | Webhook |
|-------|-----------|--------|-------|---------|
| memory.created | Yes | Yes | No | Optional |
| memory.updated | Yes | Yes | No | Optional |
| memory.deleted | Yes | Yes | No | Optional |
| memory.conflict | Yes | Yes | Yes | Yes |
| sync.completed | Yes | Yes | No | No |
| sync.failed | Yes | Yes | Yes | Yes |
| quota.warning (80%) | Yes | Yes | Yes | No |
| quota.exceeded | Yes | Yes | Yes | Yes |
| team.memory_added | Yes | Yes | No | Optional |
| team.member_joined | Yes | Yes | Yes | No |
| api_key.created | No | Yes | Yes | No |
| api_key.used_first_time | No | Yes | No | No |
| security.suspicious | No | Yes | Yes | Yes |
| system.maintenance | Yes | Yes | Yes | No |
| export.ready | Yes | Yes | Yes | No |

### User Preferences

```json
{
  "notifications": {
    "channels": {
      "websocket": true,
      "email": true,
      "webhook": false
    },
    "email_frequency": "instant",  // instant, daily_digest, weekly_digest
    "quiet_hours": {
      "enabled": true,
      "start": "22:00",
      "end": "08:00",
      "timezone": "America/New_York"
    },
    "filters": {
      "memory_crud": false,       // too noisy for email
      "sync_events": true,
      "security": true,
      "team": true,
      "quota": true
    },
    "webhook_url": "https://hooks.slack.com/xxx"
  }
}
```

### Implementation: WebSocket

```typescript
// Using native WebSocket (no Socket.io — lighter)
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const connections = new Map<string, Set<WebSocket>>(); // userId → connections

wss.on('connection', (ws, req) => {
  const userId = authenticateWebSocket(req);
  if (!userId) { ws.close(4001, 'Unauthorized'); return; }

  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId)!.add(ws);

  ws.on('close', () => connections.get(userId)?.delete(ws));

  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

// Heartbeat interval (detect dead connections)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Send notification
function notify(userId: string, event: NotificationEvent) {
  const userWs = connections.get(userId);
  if (!userWs) return;
  const payload = JSON.stringify(event);
  userWs.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

// Subscribe to Redis Pub/Sub for events
import Redis from 'ioredis';
const sub = new Redis();
sub.subscribe('notifications');
sub.on('message', (channel, message) => {
  const { userId, event } = JSON.parse(message);
  notify(userId, event);
});
```

### Implementation: Email (Resend)

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendNotificationEmail(userId: string, event: NotificationEvent) {
  const user = await db.users.findById(userId);
  if (!user?.email) return;

  // Check preferences
  const prefs = await db.preferences.get(userId);
  if (!prefs.notifications.channels.email) return;
  if (isQuietHours(prefs)) {
    await queueForDigest(userId, event);
    return;
  }

  await resend.emails.send({
    from: 'Universal Memory <notify@memory.dev>',
    to: user.email,
    subject: getEmailSubject(event),
    html: renderEmailTemplate(event),
  });
}
```

### Email Service Costs

| Service | Free Tier | Pro Cost |
|---------|-----------|----------|
| **Resend** | 3,000 emails/mo | $20/mo (50K) |
| **SendGrid** | 100 emails/day | $20/mo (50K) |
| **Postmark** | 100 emails/mo | $15/mo (10K) |
| **AWS SES** | 62K emails/mo (from EC2) | $0.10/1K |
| **Mailgun** | 100 emails/day | $35/mo (50K) |

**Recommendation:** Resend (great DX, React email templates, generous free).

### Webhook Delivery

```typescript
// Webhook with retry + signing
async function deliverWebhook(userId: string, event: NotificationEvent) {
  const webhook = await db.webhooks.get(userId);
  if (!webhook?.url) return;

  const payload = JSON.stringify(event);
  const signature = crypto
    .createHmac('sha256', webhook.secret)
    .update(payload)
    .digest('hex');

  const response = await fetch(webhook.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Memory-Signature': signature,
      'X-Memory-Event': event.type,
    },
    body: payload,
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    // Retry with exponential backoff (3 attempts)
    await webhookRetryQueue.add('deliver', { userId, event }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}
```

---

## 7. Logging & Observability

### Logging Stack

```
Application Code
      |
      v
  Pino (structured JSON logger)
      |
      +---> stdout (dev: pretty print)
      +---> File (local mode: rotating files)
      +---> Grafana Loki (cloud: log aggregation)
      +---> Sentry (errors only)
```

### Pino Setup

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
  serializers: {
    req: pino.stdSerializers.req,
    err: pino.stdSerializers.err,
  },
  redact: ['req.headers.authorization', 'apiKey'], // Hide sensitive data
});

// Usage
logger.info({ memoryKey: 'auth/jwt', userId: '...', action: 'memory.create' }, 'Memory created');
logger.warn({ userId: '...', remaining: 50 }, 'Quota approaching limit');
logger.error({ err, memoryKey: 'auth/jwt' }, 'Failed to create memory');
```

### What to Log

| Category | Events | Level | Retention |
|----------|--------|-------|-----------|
| **API Requests** | method, path, status, latency, user_id | info | 30 days |
| **Memory CRUD** | action, key, user_id, source, size | info | 90 days |
| **Search** | query, results_count, latency, mode | info | 30 days |
| **Auth** | login, logout, key_create, failed_auth | info/warn | 1 year |
| **Sync** | push, pull, conflict, resolution | info/warn | 90 days |
| **Errors** | stack_trace, context, user_id | error | 1 year |
| **Performance** | slow_query, high_memory, GC pause | warn | 30 days |
| **Rate Limits** | throttled, user_id, endpoint | warn | 30 days |
| **Background Jobs** | start, complete, fail, duration | info/error | 30 days |
| **Audit (enterprise)** | all user actions, admin actions | info | 7 years |

### Log Format (JSON)

```json
{
  "level": 30,
  "time": 1714742400000,
  "msg": "Memory created",
  "req_id": "req_abc123",
  "user_id": "550e8400-...",
  "action": "memory.create",
  "memory_key": "auth/jwt-config",
  "category": "architecture",
  "source": "claude-cli",
  "byte_size": 156,
  "latency_ms": 12,
  "ip": "192.168.1.1"
}
```

### Observability Stack

```
+-------------------+     +-------------------+     +------------------+
|  Application      |     |  Grafana Loki     |     |  Grafana         |
|  (Pino logs)      |---->|  (log storage)    |---->|  (dashboards)    |
+-------------------+     +-------------------+     +------------------+
|  Application      |     |  Prometheus       |     |                  |
|  (metrics)        |---->|  (metrics store)  |---->|                  |
+-------------------+     +-------------------+     +------------------+
|  Application      |     |  Sentry           |
|  (errors)         |---->|  (error tracking) |
+-------------------+     +-------------------+
```

### Observability Tools — Free vs Paid

| Tool | Purpose | Free | Paid |
|------|---------|------|------|
| **Pino** | Structured logging | Free (MIT) | - |
| **Grafana** | Dashboards | Free (self-host) | Cloud: $0 (10K metrics) |
| **Grafana Loki** | Log aggregation | Free (self-host) | Cloud: $0 (50GB/mo) |
| **Prometheus** | Metrics | Free (self-host) | Cloud: varies |
| **OpenTelemetry** | Tracing + metrics | Free (CNCF) | - |
| **Axiom** | Log aggregation + query | **500 GB/mo free!** | $25/mo (1 TB) |
| **Sentry** | Error tracking | 5K events/mo free | $26/mo (50K) |
| **BetterStack** | Logs + uptime | 1GB/mo free | $25/mo |
| **Datadog** | Full observability | None | $15/host/mo |
| **New Relic** | Full observability | 100GB/mo free | $0.35/GB |

**MVP Stack (free):** Pino → stdout → **Axiom** (500GB/mo free, columnar storage, SQL-like queries) + Sentry free.

> **Axiom** is the best-value logging option discovered — 500 GB/mo free tier is 10x more generous than alternatives. Columnar storage, unlimited queries, excellent DX.

### Key Metrics to Track

```
# API
http_requests_total{method, path, status}
http_request_duration_seconds{method, path}
http_active_connections

# Memory Operations
memory_operations_total{action, source}
memory_search_duration_seconds{mode}
memory_search_results_count{mode}

# Storage
storage_bytes_total{user_id}
memories_count_total{user_id}

# Sync
sync_events_total{type, status}
sync_duration_seconds
sync_queue_depth

# System
process_cpu_seconds_total
process_memory_bytes
nodejs_event_loop_lag_seconds
db_connection_pool_size
db_query_duration_seconds{query_type}
```

### Log Rotation (Local Mode)

```typescript
// Using pino-roll for file rotation
const transport = pino.transport({
  target: 'pino-roll',
  options: {
    file: '~/.memory/logs/memory.log',
    frequency: 'daily',
    limit: { count: 30 },  // Keep 30 days
    mkdir: true,
  }
});
```

### Audit Logs (Enterprise)

```sql
-- Immutable, append-only table
CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id     UUID NOT NULL,
    team_id     UUID,
    action      TEXT NOT NULL,
    resource    TEXT NOT NULL,
    old_value   JSONB,
    new_value   JSONB,
    ip_address  INET,
    user_agent  TEXT,
    request_id  TEXT
);

-- Partition by month for performance
CREATE TABLE audit_logs_2025_05 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

-- No UPDATE or DELETE policies
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
```

---

## 8. Installation Methods

### Method 1: npm (Cross-platform)

```bash
# Install globally
npm install -g @universalmemory/server

# Start
memory start

# With config
memory start --mode local --port 3000

# With cloud sync
memory start --mode hybrid --api-key mem_sk_xxx
```

**Requires:** Node.js 20+
**Size:** ~50 MB (excluding embedding model)

### Method 2: Single Binary (Bun compile)

```bash
# macOS
curl -fsSL https://memory.dev/install.sh | sh

# Linux
wget -qO- https://memory.dev/install.sh | sh

# Windows
irm https://memory.dev/install.ps1 | iex

# Binary is self-contained, no runtime needed
memory start
```

**Requires:** Nothing (self-contained)
**Size:** ~80 MB (including Bun runtime)

### Method 3: Docker

```bash
docker run -d \
  --name memory \
  -p 3000:3000 \
  -v ~/.memory:/data \
  -e MEMORY_MODE=local \
  universalmemory/server:latest
```

**Requires:** Docker
**Size:** ~200 MB image

### Method 4: Homebrew (macOS)

```bash
brew install universal-memory
memory start
```

### Method 5: pip (Python users)

```bash
pip install universal-memory
memory-server start
```

### Method 6: Docker Compose (Full stack, cloud-like local)

```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    image: universalmemory/server
    ports: ["3000:3000"]
    environment:
      - DATABASE_URL=postgresql://memory:memory@postgres:5432/memory
      - QDRANT_URL=http://qdrant:6333
      - REDIS_URL=redis://redis:6379
    depends_on: [postgres, qdrant, redis]

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: memory
      POSTGRES_USER: memory
      POSTGRES_PASSWORD: memory
    volumes: ["pgdata:/var/lib/postgresql/data"]

  qdrant:
    image: qdrant/qdrant
    volumes: ["qdrant_data:/qdrant/storage"]

  redis:
    image: redis:7-alpine
    volumes: ["redis_data:/data"]

volumes:
  pgdata:
  qdrant_data:
  redis_data:
```

### Auto-Download Embedding Model

```bash
# First start auto-downloads model
$ memory start
Downloading embedding model (BGE-small-en-v1.5, 120 MB)...
[████████████████████████] 100%
Starting server on http://localhost:3000
MCP server available via stdio
Dashboard: http://localhost:3000/dashboard
```

### Configuration File

```yaml
# ~/.memory/config.yml
mode: hybrid           # local | cloud | hybrid
port: 3000

# Cloud settings (hybrid/cloud mode)
cloud:
  url: https://api.memory.dev
  api_key: mem_sk_xxxxx
  sync_interval: 300   # seconds

# Local settings
local:
  db_path: ~/.memory/data/memory.db
  embedding_model: bge-small-en-v1.5
  max_memories: 1000000

# Search
search:
  default_limit: 10
  min_relevance: 0.5

# Notifications
notifications:
  websocket: true
  email: false
  webhook_url: null

# Logging
logging:
  level: info          # debug | info | warn | error
  file: ~/.memory/logs/memory.log
  rotation: daily
  retention: 30        # days

# Auto features
auto:
  categorize: true
  dedup: true
  stale_detection: true
  stale_days: 365
```
