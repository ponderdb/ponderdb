# UNIVERSAL AI AGENT MEMORY SERVER — Master Research Plan

## Product: Centralized persistent memory brain for all AI tools

One install → every AI agent gets same long-term project memory.

---

## Research Documents

| # | Document | Status | Path |
|---|----------|--------|------|
| 1 | **System Design & Architecture** | Done | [01-system-design.md](./01-system-design.md) |
| 2 | **Database & Storage Layer** | Done | [02-database-storage.md](./02-database-storage.md) |
| 3 | **AI Tool Integrations** | Done | [03-ai-integrations.md](./03-ai-integrations.md) |
| 4 | **Deployment, Sync, Notifications & Logging** | Done | [04-deployment-modes.md](./04-deployment-modes.md) |
| 5 | **Pricing, Capacity & Performance** | Done | [05-pricing-capacity-performance.md](./05-pricing-capacity-performance.md) |
| 6 | **Advanced Features & Extras** | Done | [06-extras-and-advanced.md](./06-extras-and-advanced.md) |
| 7 | **User Configuration & Fallbacks** | Done | [07-configuration-and-fallbacks.md](./07-configuration-and-fallbacks.md) |

---

## Quick Reference

### Tech Stack (Recommended)

| Layer | Technology | Cost |
|-------|-----------|------|
| **Frontend** | Next.js 15 + shadcn/ui + Tailwind | Free |
| **Backend** | Next.js API Routes / Bun | Free |
| **Primary DB** | PostgreSQL + pgvector (Neon) | Free → $19/mo |
| **Vector DB** | Qdrant (self-hosted → cloud) | Free → $25/mo |
| **Cache** | Redis/Valkey (Upstash) | Free → $10/mo |
| **Blob Storage** | Cloudflare R2 / AWS S3 / MinIO | Free → $0.015/GB |
| **Embeddings** | BGE-base-en-v1.5 (768d, local) | Free |
| **Auth** | NextAuth.js | Free |
| **MCP Server** | @modelcontextprotocol/sdk | Free |
| **Local DB** | SQLite + sqlite-vec | Free |
| **Queue** | BullMQ (Redis-backed) | Free |
| **Logging** | Pino + Axiom (500GB/mo free!) | Free |
| **Email** | Resend | Free (3K/mo) |
| **Hosting** | Fly.io / Vercel (MVP) → AWS EC2 (scale) | Free → $20/mo |
| **CDN** | Cloudflare | Free |
| **Errors** | Sentry | Free (5K/mo) |

### MVP Total Infrastructure Cost: $0 (free tiers)
### Production (1K users): ~$35/mo
### Scale (100K users): ~$1,800/mo

---

### Integration Priority

| Priority | Integration | Covers |
|----------|------------|--------|
| **P0** | MCP Server | Claude, Cursor, Windsurf, Copilot (VS Code), ChatGPT, Gemini CLI, JetBrains, Continue.dev |
| **P0** | REST API | Everything (universal) |
| **P0** | CLI Tool | Terminal/scripts |
| **P1** | TypeScript + Python SDKs | Programmatic access |
| **P1** | VS Code Extension | IDE integration |
| **P2** | Aider proxy, static exports | Broader reach |
| **P3** | Browser Extension, JetBrains | Nice to have |

---

### Deployment Modes

| Mode | Best For | Requirements |
|------|----------|-------------|
| **Local** | Privacy-first, offline | 512 MB RAM, 500 MB disk |
| **Cloud** | Multi-device, team | Internet + API key |
| **Hybrid** | Best of both | Both above |

---

### Pricing Summary

| Plan | Price | Memories | Storage |
|------|-------|----------|---------|
| Free | $0 | 1,000 | 100 MB |
| Pro | $12/mo | 100,000 | 10 GB |
| Team | $25/seat/mo | 500,000/seat | 50 GB/seat |
| Enterprise | Custom | Unlimited | Unlimited |

---

### Key Differentiators vs Competitors

```
1. MCP-native (works with Claude, Cursor, Windsurf, Copilot, ChatGPT, Gemini CLI, JetBrains — ALL major tools)
2. Cross-tool (same memory across ALL AI tools via single MCP server)
3. Developer-specific (code patterns, bugs, architecture, not chat history)
4. Offline-first (works without internet, syncs when online)
5. Team memory (shared project knowledge)
6. Auto-categorized for dev workflow
7. Lightweight (<500 MB local footprint)
8. Zero-knowledge encryption option (Enterprise)
```

### MCP Adoption Status (2025)

MCP spec version `2025-11-25`. Almost every major AI coding tool now supports MCP natively:
- **Full MCP:** Claude, Copilot (VS Code - most complete), Cursor, Windsurf, Continue.dev, Gemini CLI, JetBrains
- **Remote MCP:** ChatGPT (HTTPS + OAuth required)
- **No MCP:** Aider, Cody (use proxy approach)

This means ONE MCP server covers ~95% of developer AI tool market.

---

### Build Phases

| Phase | What | Timeline |
|-------|------|----------|
| **1 — MVP** | Local server + MCP + CLI + basic web dashboard | 4-6 weeks |
| **2 — Cloud** | Cloud sync + auth + team features + pricing | 4-6 weeks |
| **3 — Polish** | VS Code ext, browser ext, SDKs, marketplace | 4-8 weeks |
| **4 — Scale** | Multi-region, enterprise, advanced analytics | Ongoing |

---

### Revenue Projection

| Metric | Year 1 | Year 2 |
|--------|--------|--------|
| Free Users | 10,000 | 50,000 |
| Paying Users | 700 | 4,500 |
| MRR | $8,500 | $60,000 |
| ARR | $102,000 | $720,000 |

---

## Document Details

### 01 — System Design (01-system-design.md)
- High-level architecture diagram
- Component breakdown (frontend, API, MCP, WebSocket)
- Data flow (write, read, search, context injection)
- Deployment modes (local/cloud/hybrid) with diagrams
- Offline & sync architecture
- API design (REST + MCP + GraphQL)
- Complete PostgreSQL schema (memories, users, teams, API keys, versions, logs)
- Qdrant collection schema
- Redis cache schema
- Search architecture (hybrid search algorithm)
- Auto-categorization
- Notification system
- Logging & observability
- Security (auth, encryption, RLS)
- Scalability design (stages, connection pooling, caching, rate limiting)

### 02 — Database & Storage (02-database-storage.md)
- PostgreSQL + pgvector (benchmarks, pricing, installation, limits)
- Qdrant (benchmarks, pricing, scale to 1B+ vectors)
- Milvus (enterprise-grade, GPU support)
- ChromaDB (lightweight, dev/prototyping)
- Weaviate (multi-tenant, GraphQL)
- SQLite + sqlite-vec (offline/local mode)
- Redis + RediSearch (caching layer)
- Embedding models comparison (paid: OpenAI, Cohere; free: BGE, nomic, MiniLM, E5, GTE)
- Dimension vs quality tradeoffs
- Local embedding inference options (sentence-transformers, Ollama, FastEmbed, llama.cpp)
- Comparative summary table
- Recommended architecture stack

### 03 — AI Integrations (03-ai-integrations.md)
- Integration matrix (all tools, methods, difficulty)
- MCP protocol deep dive (transport, implementation code)
- Claude CLI/Desktop setup
- Cursor setup
- Windsurf setup
- GitHub Copilot (instructions file, VS Code extension, Copilot Extensions)
- ChatGPT (Custom GPT Actions, API integration)
- Gemini (function calling, system prompt)
- VS Code Extension (full feature list, architecture, code)
- JetBrains Plugin
- Terminal/CLI (shell integration, scripts)
- Other tools (Aider, Continue.dev, Cody, Open Interpreter)
- Proxy approach (universal, any tool)
- SDK & client libraries
- Browser extension
- Build priority order

### 04 — Deployment & Sync (04-deployment-modes.md)
- Local mode (architecture, requirements, storage capacity, embedding options)
- Cloud mode (provider comparison for compute, DB, vector, cache, storage with pricing)
- Hybrid mode (sync strategy, conflict resolution, bandwidth optimization)
- Offline-first architecture (state machine, internet detection, sync queue)
- Sync protocol (push/pull, sync tokens, conflict resolution)
- Notification system (events, channels, user preferences, WebSocket/email/webhook impl)
- Logging & observability (Pino setup, what to log, metrics, tools comparison)
- Installation methods (npm, binary, Docker, Homebrew, pip, Docker Compose)
- Configuration file format

### 05 — Pricing & Performance (05-pricing-capacity-performance.md)
- Detailed pricing plans (Free/Pro/Team/Enterprise with all limits)
- Competitor analysis (Mem0, Zep, LangChain, Rewind)
- Competitive moat
- Capacity planning (users per server, resource per user, scaling milestones)
- Sharding strategy
- Connection pooling (PgBouncer config)
- Performance optimization (client-side, server-side, 20+ techniques)
- Rate limiting
- Caching strategy (3 layers)
- Background job queue
- Query optimization (covering indexes, materialized views)
- Compression (zstd, brotli, quantization)
- Security architecture (auth, API keys, encryption, zero-knowledge, GDPR, RLS)
- Cost analysis (what's free, cost at scale, unit economics)

### 06 — Extras & Advanced (06-extras-and-advanced.md)
- Memory versioning & history
- Memory quality & decay (confidence scoring, stale detection)
- Deduplication (detection, merge strategy)
- Import/export/migration (10+ sources, 6+ formats)
- Team collaboration (roles, shared memories, activity feed)
- SDK & client libraries (5 languages, framework integrations)
- Webhook integrations (outgoing + incoming triggers)
- Plugin system (API, hooks, community plugins)
- Analytics dashboard (metrics, charts)
- Backup & disaster recovery (strategy, PITR, user self-backup)
- Multi-language support
- Browser extension
- Mobile considerations
- Memory marketplace (future)
- AI-powered features (smart suggestions, auto-learning, summarization)
- Developer experience (setup, errors, docs)
- Onboarding flow (web + CLI)
