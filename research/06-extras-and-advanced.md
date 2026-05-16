# Advanced Features & Extras

## Things You Might Have Forgotten

---

## Table of Contents

1. [Memory Versioning & History](#1-memory-versioning--history)
2. [Memory Quality & Decay](#2-memory-quality--decay)
3. [Deduplication](#3-deduplication)
4. [Import / Export / Migration](#4-import--export--migration)
5. [Team Collaboration](#5-team-collaboration)
6. [SDK & Client Libraries](#6-sdk--client-libraries)
7. [Webhook Integrations](#7-webhook-integrations)
8. [Plugin System](#8-plugin-system)
9. [Analytics Dashboard](#9-analytics-dashboard)
10. [Backup & Disaster Recovery](#10-backup--disaster-recovery)
11. [Multi-Language Support](#11-multi-language-support)
12. [Browser Extension](#12-browser-extension)
13. [Mobile Considerations](#13-mobile-considerations)
14. [Memory Marketplace](#14-memory-marketplace)
15. [AI-Powered Features](#15-ai-powered-features)
16. [Developer Experience](#16-developer-experience)
17. [Onboarding Flow](#17-onboarding-flow)

---

## 1. Memory Versioning & History

### Git-Like History for Memories

Every update creates a version. Users can view, diff, and restore.

```
Memory: "auth/jwt-config"
  v1 (2025-01-15): "JWT uses HS256..."
  v2 (2025-03-20): "JWT uses RS256..." ← changed algorithm
  v3 (2025-05-01): "JWT uses RS256, 15min expiry..." ← added detail
```

### Schema

```sql
CREATE TABLE memory_versions (
    id          UUID PRIMARY KEY,
    memory_id   UUID NOT NULL REFERENCES memories(id),
    version     INTEGER NOT NULL,
    content     TEXT NOT NULL,
    diff        TEXT,                -- unified diff from previous
    changed_by  TEXT,                -- user/tool that made change
    change_type TEXT,                -- create, update, restore, auto-merge
    metadata    JSONB,
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

### API

```
GET  /api/v1/memories/:key/versions          → list versions
GET  /api/v1/memories/:key/versions/:version  → get specific version
GET  /api/v1/memories/:key/diff?v1=2&v2=3    → diff between versions
POST /api/v1/memories/:key/restore/:version   → restore to version
```

### Plan Limits

| Plan | Max Versions |
|------|-------------|
| Free | No versioning |
| Pro | 10 per memory |
| Team | 100 per memory |
| Enterprise | Unlimited |

---

## 2. Memory Quality & Decay

### Problem

Memories become stale. Code changes, patterns evolve, bugs get fixed. Old memories can mislead AI tools.

### Confidence Score

Each memory has a confidence score (0-1):

```
Initial: 1.0 (fresh memory)
Decay: -0.01 per week without access
Boost: +0.1 per access (max 1.0)
Manual: User can set confidence
Threshold: Memories below 0.3 flagged as "stale"
```

### Auto-Stale Detection

```typescript
// Daily cron job
async function detectStaleMemories() {
  const stale = await db.query(`
    SELECT * FROM memories
    WHERE confidence < 0.3
      AND last_accessed < now() - interval '90 days'
      AND is_deleted = false
    ORDER BY confidence ASC
    LIMIT 100
  `);

  for (const memory of stale) {
    // Notify user
    await notify(memory.user_id, {
      type: 'memory.stale',
      key: memory.key,
      message: `Memory "${memory.key}" hasn't been accessed in 90+ days. Review or archive?`,
    });
  }
}
```

### Stale Memory Actions

| Action | Effect |
|--------|--------|
| **Keep** | Reset confidence to 0.7 |
| **Update** | Edit content, reset to 1.0 |
| **Archive** | Move to archive, exclude from search |
| **Delete** | Soft delete |
| **Auto-archive** | After 180 days stale, auto-archive |

---

## 3. Deduplication

### Problem

User stores similar/duplicate memories from different tools.

### Detection Methods

| Method | When | Accuracy |
|--------|------|----------|
| Exact key match | On create | 100% |
| Content hash (SHA-256) | On create | 100% (exact only) |
| Vector similarity > 0.95 | Background job | Good |
| Fuzzy key match | On create | Medium |

### Dedup Flow

```
New memory arrives:
  1. Check exact key → if exists, treat as update
  2. Check content hash → if exists, skip (exact duplicate)
  3. Generate embedding → check similarity > 0.95
  4. If similar memory found:
     a. Auto-merge if same category + key pattern
     b. Notify user: "Similar memory exists: {key}. Merge?"
  5. If no duplicate, create normally
```

### Merge Strategy

```
When merging memories A and B:
  - Key: keep most descriptive
  - Content: combine (newer content takes priority)
  - Tags: union of both
  - Category: keep from newer
  - Metadata: deep merge
  - Version: create merge version
```

---

## 4. Import / Export / Migration

### Import Sources

| Source | Format | Command |
|--------|--------|---------|
| Claude CLAUDE.md | Markdown | `memory import claude.md --from claude` |
| Cursor .cursorrules | Text | `memory import .cursorrules --from cursor` |
| Copilot instructions | Markdown | `memory import .github/copilot-instructions.md --from copilot` |
| JSON file | JSON | `memory import data.json` |
| CSV file | CSV | `memory import data.csv` |
| Notion export | Markdown/JSON | `memory import notion-export/ --from notion` |
| Obsidian vault | Markdown | `memory import vault/ --from obsidian` |
| Environment vars | Key=Value | `memory import .env --from env` |
| Git history | Commits | `memory import --from git-log --limit 100` |

### Export Formats

```bash
# JSON (full data)
memory export --format json > memories.json

# CSV
memory export --format csv > memories.csv

# Markdown (human-readable)
memory export --format markdown > MEMORIES.md

# Claude CLAUDE.md format
memory export --format claude > CLAUDE.md

# Cursor rules format
memory export --format cursorrules --category code-patterns > .cursorrules

# Copilot instructions format
memory export --format copilot > .github/copilot-instructions.md

# Filtered export
memory export --category architecture --format markdown
memory export --tags auth,security --format json
memory export --since 2025-01-01 --format json
```

### Migration from Other Tools

```bash
# From Mem0
memory migrate --from mem0 --api-key xxx

# From Zep
memory migrate --from zep --url http://localhost:8000

# From LangChain ChromaDB
memory migrate --from langchain-chroma --path ./chroma_db

# From plain text files
memory import ./docs/ --recursive --format auto
```

---

## 5. Team Collaboration

### Team Memory Model

```
Team "Backend Team"
  |
  +-- Shared memories (visible to all members)
  |     +-- architecture/*
  |     +-- deployment/*
  |     +-- api-docs/*
  |
  +-- Member memories (personal, not shared)
  |     +-- alice/debug-notes/*
  |     +-- bob/shortcuts/*
  |
  +-- Roles
        +-- Owner (full control)
        +-- Admin (manage members, edit shared)
        +-- Member (read shared, write own)
        +-- Viewer (read only)
```

### Team Features

| Feature | How |
|---------|-----|
| **Shared memories** | Memories with team_id visible to all members |
| **@mentions** | Tag team members in memory notes |
| **Memory reviews** | Propose changes, team approves |
| **Activity feed** | See who added/changed what |
| **Onboarding pack** | Auto-inject key memories for new members |
| **Memory ownership** | Track who created/last-edited |
| **Conflict alerts** | When two members edit same memory |

### Team Sync

```
Personal memories: sync to personal cloud storage
Team memories: sync to team cloud storage

New team member joins:
  1. Pull all team shared memories
  2. Generate local vectors
  3. MCP server now serves team + personal memories
  4. New memories default to personal (opt-in to share)
```

---

## 6. SDK & Client Libraries

### Official SDKs

| Language | Package | Install |
|----------|---------|---------|
| TypeScript/JS | `@universalmemory/sdk` | `npm install @universalmemory/sdk` |
| Python | `universal-memory` | `pip install universal-memory` |
| Go | `github.com/universalmemory/go-sdk` | `go get ...` |
| Rust | `universal-memory` | `cargo add universal-memory` |
| Ruby | `universal_memory` | `gem install universal_memory` |

### SDK Features

```
All SDKs support:
  - remember(key, content, options)
  - recall(key)
  - search(query, options)
  - context(prompt, options)
  - forget(key)
  - update(key, changes)
  - list(filters)
  - listCategories()
  - bulkRemember(memories)
  - export(options)
  - import(data)
  - stats()

Advanced:
  - Streaming search results
  - Batch operations
  - Retry with exponential backoff
  - Connection pooling
  - Type-safe (TypeScript, Go, Rust)
```

### Framework Integrations

```python
# LangChain
from universal_memory.integrations import LangChainMemory
memory = LangChainMemory(client=mem_client)
chain = ConversationChain(memory=memory)

# LlamaIndex
from universal_memory.integrations import LlamaIndexStorage
storage = LlamaIndexStorage(client=mem_client)

# CrewAI
from universal_memory.integrations import CrewAIMemory
```

---

## 7. Webhook Integrations

### Outgoing Webhooks

Send events to external services when memories change.

```json
// Webhook payload
{
  "event": "memory.created",
  "timestamp": "2025-05-03T10:30:00Z",
  "data": {
    "key": "auth/jwt-config",
    "category": "architecture",
    "source": "claude-cli",
    "content_preview": "JWT uses RS256..."
  },
  "signature": "sha256=abc123..."
}
```

### Incoming Webhooks (Triggers)

Automatically create memories from external events.

| Source | Trigger | Memory Created |
|--------|---------|---------------|
| **GitHub** | PR merged | "Merged: {title}" with diff summary |
| **GitHub** | Issue closed | "Fixed: {title}" with resolution |
| **Slack** | Message with #remember | Store message as memory |
| **Jira** | Issue resolved | Bug fix documentation |
| **CI/CD** | Deploy success | "Deployed v{x} to {env}" |
| **Sentry** | Error resolved | "Fixed: {error}" with solution |
| **Linear** | Issue completed | Task completion notes |

### Setup

```bash
# Create webhook
memory webhooks create \
  --url https://hooks.slack.com/xxx \
  --events memory.created,memory.updated \
  --secret whsec_xxx

# GitHub incoming webhook
memory webhooks incoming create \
  --source github \
  --events push,pull_request.merged
```

---

## 8. Plugin System

### Architecture

```
Memory Server
  |
  +-- Core (memory CRUD, search, sync)
  |
  +-- Plugin Manager
        |
        +-- Built-in plugins
        |     +-- auto-categorizer
        |     +-- dedup-detector
        |     +-- stale-detector
        |
        +-- Community plugins
              +-- github-sync
              +-- slack-capture
              +-- obsidian-sync
              +-- custom-embeddings
```

### Plugin API

```typescript
// Plugin interface
interface MemoryPlugin {
  name: string;
  version: string;

  // Lifecycle hooks
  onMemoryCreate?(memory: Memory): Promise<Memory>;
  onMemoryUpdate?(memory: Memory, prev: Memory): Promise<Memory>;
  onMemoryDelete?(key: string): Promise<void>;
  onSearch?(query: string, results: SearchResult[]): Promise<SearchResult[]>;
  onContextBuild?(prompt: string, context: string): Promise<string>;

  // Background tasks
  cronJobs?: CronJob[];

  // Custom MCP tools
  mcpTools?: McpTool[];
}

// Example: Auto-tag plugin
const autoTagPlugin: MemoryPlugin = {
  name: 'auto-tagger',
  version: '1.0.0',

  async onMemoryCreate(memory) {
    const tags = extractTags(memory.content);
    return { ...memory, tags: [...memory.tags, ...tags] };
  }
};
```

---

## 9. Analytics Dashboard

### Metrics Displayed

```
Dashboard Overview:
  +--------------------------------------+
  | Total Memories: 12,456               |
  | Storage Used: 2.3 GB / 10 GB        |
  | API Calls Today: 1,234              |
  | Searches Today: 456                 |
  +--------------------------------------+

  Top Categories:     Activity Timeline:     Most Accessed:
  [pie chart]         [line chart]           [bar chart]

  +--------------------------------------+
  | Recent Activity                       |
  | - auth/jwt updated (2 min ago)       |
  | - deploy/v2.3 created (1 hour ago)   |
  | - 5 memories synced (3 hours ago)    |
  +--------------------------------------+

  +--------------------------------------+
  | Memory Health                         |
  | Fresh (>0.7): 10,234 (82%)          |
  | Aging (0.3-0.7): 1,890 (15%)        |
  | Stale (<0.3): 332 (3%)              |
  +--------------------------------------+
```

### Charts

| Chart | Data | Purpose |
|-------|------|---------|
| Memory growth | Memories over time | Track knowledge accumulation |
| Category distribution | Pie chart | See knowledge balance |
| Source distribution | Bar chart | Which tools create most memories |
| Search patterns | Top queries | Understand what's searched |
| API usage | Calls over time | Capacity planning |
| Storage trend | GB over time | Plan upgrades |
| Sync status | Success/fail ratio | Monitor health |
| Stale memories | Count over time | Memory hygiene |

---

## 10. Backup & Disaster Recovery

### Backup Strategy

| Type | Frequency | Retention | Storage |
|------|-----------|-----------|---------|
| **Full DB backup** | Daily | 30 days | S3/R2 |
| **Incremental** | Hourly | 7 days | S3/R2 |
| **WAL archiving** | Continuous | 7 days | S3/R2 |
| **Vector DB snapshot** | Daily | 7 days | S3/R2 |
| **User export** | On demand | N/A | Direct download |

### Point-in-Time Recovery

```
PostgreSQL PITR via WAL:
  - Recovery to any point in last 7 days
  - RPO: ~0 (continuous archiving)
  - RTO: ~15-30 minutes
```

### Disaster Recovery Tiers

| Plan | RPO | RTO | Strategy |
|------|-----|-----|----------|
| Free | 24 hours | 4 hours | Daily backup |
| Pro | 1 hour | 1 hour | Hourly incremental |
| Team | ~0 | 30 min | WAL archiving + standby |
| Enterprise | ~0 | <5 min | Multi-region active-active |

### User Self-Backup

```bash
# CLI backup
memory backup --output ./my-memories-backup.json.zst

# Restore
memory restore ./my-memories-backup.json.zst

# Auto-backup (local mode)
# Runs automatically on graceful shutdown
```

---

## 11. Multi-Language Support

### Memory Content

Memories can be in any language. Search works across languages with multilingual embedding models.

### Multilingual Embedding Models

| Model | Languages | Quality | Size |
|-------|-----------|---------|------|
| BGE-M3 | 100+ | Best | 2.3 GB |
| multilingual-e5-large | 100+ | Good | 1.3 GB |
| paraphrase-multilingual-MiniLM | 50+ | OK | 470 MB |

### UI Localization (Phase 2)

```
Priority languages:
  1. English (default)
  2. Chinese (Simplified)
  3. Japanese
  4. Korean
  5. Spanish
  6. French
  7. German
  8. Portuguese

Using: next-intl or similar i18n library
```

---

## 12. Browser Extension

### Features

- Right-click → "Remember this" on any text selection
- Popup: quick search, quick add
- Auto-capture from Stack Overflow (when you copy a solution)
- Save documentation snippets
- Capture from ChatGPT/Claude web conversations
- Badge showing memory count

### Build

```
Manifest V3 (Chrome + Firefox)
React popup UI
Same SDK (@universalmemory/sdk)
~200 KB extension size
```

### Priority: Phase 3

---

## 13. Mobile Considerations

### Mobile App?

**Not for MVP.** But responsive web dashboard works on mobile.

### Future Mobile Features

- Quick capture (like Apple Notes)
- Voice-to-memory
- Memory review (swipe stale: keep/archive/delete)
- Offline reading of memories
- Push notifications

### Tech (if built)

- React Native or Expo
- SQLite for offline
- Same REST API

### Priority: Phase 4+

---

## 14. Memory Marketplace (Future)

### Concept

Public/community memory packs that anyone can install.

### Examples

```
Memory Packs:
  - "React Best Practices 2025" (500 memories)
  - "AWS Architecture Patterns" (200 memories)
  - "Python Performance Tips" (150 memories)
  - "TypeScript Strict Mode Guide" (100 memories)
  - "Docker Security Checklist" (50 memories)
```

### How It Works

```
Creator:
  1. Curate memory collection
  2. Publish to marketplace
  3. Set price ($0 or paid)
  4. Earn revenue (80% creator, 20% platform)

Consumer:
  1. Browse marketplace
  2. Preview memories
  3. Install pack → merges into personal memories
  4. Auto-updates when creator updates
```

### Revenue

```
If 1% of users buy 1 pack/month at avg $5:
  10K users × 1% × $5 × 20% fee = $100/mo
  100K users × 1% × $5 × 20% fee = $1,000/mo

Small but adds ecosystem stickiness.
```

### Priority: Phase 5+

---

## 15. AI-Powered Features

### Smart Suggestions

```
When user is coding in Cursor:
  1. MCP context tool called with current code/prompt
  2. Memory server finds relevant memories
  3. Also suggests: "You might want to remember this pattern"
  4. After debugging session: "Store this fix?"
```

### Auto-Learning

```
Detect patterns from tool usage:
  - Same error fixed multiple times → suggest memory
  - Same API docs looked up → cache as memory
  - Same config searched → pin as memory

Requires: analyze search/recall patterns, suggest memories
```

### Memory Summarization

```
Weekly digest email:
  "This week you created 23 memories:
   - 12 bug fixes (auth, API, deployment)
   - 5 architecture decisions
   - 6 code patterns

   Top memory: 'auth/jwt-config' accessed 34 times
   Stale memories to review: 3"
```

### Smart Categorization

Beyond keyword matching (Phase 2):
- Use embedding similarity to category exemplars
- Learn from user's manual categorization
- Suggest new categories when cluster detected

---

## 16. Developer Experience

### First-Time Setup

```bash
# One command to get started
npx @universalmemory/create

# Interactive setup:
? Memory mode: (local / cloud / hybrid)
? Default embedding model: (bge-small / nomic-embed / custom)
? Enable MCP server for Claude? (Y/n)
? Enable MCP server for Cursor? (Y/n)
? Import existing CLAUDE.md? (Y/n)
? Import .cursorrules? (Y/n)

✓ Memory server installed
✓ MCP configured for Claude CLI
✓ MCP configured for Cursor
✓ Imported 45 memories from CLAUDE.md
✓ Dashboard: http://localhost:3000

Run 'memory help' for all commands.
```

### Error Messages

```
# Good error messages (developer-friendly)
$ memory recall "nonexistent"
Error: Memory not found: "nonexistent"
  Similar keys: "auth/nonexistent-handler" (did you mean this?)
  Run: memory search "nonexistent" to find related memories

$ memory remember (no args)
Error: Missing required arguments
  Usage: memory remember <key> <content> [--category <cat>] [--tags <t1,t2>]
  Example: memory remember "auth/jwt" "JWT uses RS256" --category architecture

$ memory sync
Error: Not connected to cloud. Running in local mode.
  To enable sync: memory config set cloud.url https://api.memory.dev
  To set API key: memory config set cloud.api_key mem_sk_xxx
```

### Documentation

```
docs/
  getting-started.md
  cli-reference.md
  api-reference.md
  mcp-setup.md
  self-hosting.md
  sdk/
    typescript.md
    python.md
    go.md
  integrations/
    claude.md
    cursor.md
    copilot.md
    chatgpt.md
  guides/
    team-setup.md
    offline-mode.md
    migration.md
    security.md
```

---

## 17. Onboarding Flow

### Web Dashboard Onboarding

```
Step 1: Welcome
  "Universal Memory — One brain for all your AI tools"
  [Get Started]

Step 2: Choose mode
  ○ Local only (offline, private)
  ○ Cloud (sync across devices)
  ○ Hybrid (local + cloud sync)

Step 3: Connect your first AI tool
  [Claude CLI] [Cursor] [Windsurf] [Other]
  → Shows copy-paste config for selected tool

Step 4: Create your first memory
  Key: [auth/jwt-config]
  Content: [JWT uses RS256 algorithm...]
  Category: [architecture ▼]
  → [Remember]

Step 5: Try searching
  Search: [how does authentication work]
  → Shows the memory you just created

Step 6: Import existing knowledge
  [Import CLAUDE.md] [Import .cursorrules] [Skip]

Step 7: Done!
  "Your AI tools now share a universal memory."
  [Go to Dashboard]
```

### CLI Onboarding

```bash
$ memory init
Welcome to Universal Memory!

? Choose mode: hybrid
? Cloud API key (get at memory.dev/keys): mem_sk_xxx
? Configure MCP for Claude CLI? Yes
  ✓ Written to ~/.claude/claude_desktop_config.json
? Configure MCP for Cursor? Yes
  ✓ Written to .cursor/mcp.json
? Import CLAUDE.md? Yes
  ✓ Imported 45 memories

Setup complete! Try:
  memory remember "test" "Hello Memory"
  memory search "test"
  memory stats
```
