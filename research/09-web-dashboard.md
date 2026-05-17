# 09 — Web Dashboard

## Overview

PonderDB includes a built-in web dashboard served at `http://127.0.0.1:7437` alongside the REST API. Local-first — runs wherever the server runs, no separate deployment needed.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | React 19 | Lightweight, component-based |
| Build | Vite 6 | Fast builds, HMR, proxying |
| Styling | Vanilla CSS (custom properties) | No dependency, full control |
| API | Fetch → REST API | Same-origin, no CORS issues |
| Serving | Hono `serveStatic` | Single port, zero config |

## Architecture

```
packages/dashboard/
├── index.html              — Vite entry
├── vite.config.ts          — Build config + dev proxy
├── tsconfig.json           — TypeScript config
├── package.json            — Dependencies
└── src/
    ├── main.tsx            — React root
    ├── App.tsx             — Router + top-level state
    ├── api.ts              — REST API client functions
    ├── components/
    │   ├── Layout.tsx      — Sidebar + navigation
    │   ├── Stats.tsx       — Memory count display
    │   ├── MemoryList.tsx  — Paginated memory table
    │   ├── MemoryDetail.tsx — Single memory view
    │   ├── Search.tsx      — Semantic search interface
    │   └── ApiKeys.tsx     — API key management
    └── styles/
        └── global.css      — Full stylesheet
```

### Serving Strategy

Dashboard builds to static files in `packages/dashboard/dist/`. Server detects this directory at startup and serves it:

```typescript
// In app.ts — after API routes, before error handler
const dashboardDist = resolve(__dirname, "../../dashboard/dist");
if (existsSync(dashboardDist)) {
  app.use("/*", serveStatic({ root: dashboardDist }));
  // SPA fallback
  app.get("*", serveStatic({ root: dashboardDist, rewriteRequestPath: () => "/index.html" }));
}
```

Route priority: `/api/*` and `/mcp` handled first, everything else falls through to static files. SPA fallback ensures client-side routing works.

### Development

```bash
# Terminal 1: API server
npm run dev --workspace=@ponderdb/server

# Terminal 2: Dashboard with HMR
npm run dev --workspace=@ponderdb/dashboard
# Vite proxies /api/* and /mcp to localhost:7437
```

## Current Features

### 1. Memory Browser (`MemoryList.tsx`)

- Paginated table (20 per page)
- Category filter dropdown
- Sortable by `updatedAt` (desc)
- Click row → detail view
- Columns: Key, Category, Importance, Tags, Updated

### 2. Memory Detail (`MemoryDetail.tsx`)

- Full content display (pre-formatted)
- Category + importance badges
- Tags display
- Metadata grid: ID, project, created/updated/accessed dates, access count, version
- Delete action with confirmation

### 3. Semantic Search (`Search.tsx`)

- Text input for natural language queries
- Results show: key, match type (vector/keyword), relevance score (%)
- Category + importance badges per result
- Content preview (300 chars)

### 4. API Key Management (`ApiKeys.tsx`)

- Create new keys (name input)
- New key displayed once with copy button
- Table: name, prefix, created, last used
- Revoke action with confirmation

### 5. Stats Bar (`Stats.tsx`)

- Total memory count

### 6. API Key Input

- Persistent (localStorage)
- Password-masked input in top bar
- Required for all API calls

## Design System

### Theme: Dark

```css
--bg: #0a0a0f;           /* Deep dark background */
--bg-surface: #12121a;    /* Card/panel background */
--bg-hover: #1a1a26;      /* Hover state */
--border: #2a2a3a;        /* Subtle borders */
--text: #e0e0e8;          /* Primary text */
--text-dim: #8888a0;      /* Secondary text */
--accent: #6c5ce7;        /* Purple accent */
--danger: #e74c3c;        /* Red for destructive */
--success: #2ecc71;       /* Green for success */
```

### Category Colors

Each memory category has a distinct background + text color:
- `architecture` → blue
- `bug` → red
- `pattern` → green
- `config` → orange
- `decision` → purple
- `snippet` → pink
- `debug` → yellow
- `workflow` → cyan
- `dependency` → coral
- `custom` → gray

### Importance Colors

- `low` → green
- `medium` → orange
- `high` → coral
- `critical` → red

### Typography

- UI: Inter / system sans-serif
- Code/keys: JetBrains Mono / Fira Code

## API Client (`api.ts`)

Typed fetch wrappers for all REST endpoints:

| Function | Method | Endpoint |
|----------|--------|----------|
| `fetchHealth()` | GET | `/health` |
| `listMemories()` | GET | `/api/memories?...` |
| `searchMemories()` | POST | `/api/memories/search` |
| `getMemory()` | GET | `/api/memories/:key` |
| `deleteMemory()` | DELETE | `/api/memories/:key` |
| `listApiKeys()` | GET | `/api/auth/keys` |
| `createApiKey()` | POST | `/api/auth/keys` |
| `revokeApiKey()` | DELETE | `/api/auth/keys/:id` |

All functions take `apiKey` as first parameter, set `Authorization: Bearer` header.

## Build Output

```
dist/index.html                   0.47 kB
dist/assets/index-*.css           6.82 kB  (gzip: 1.82 kB)
dist/assets/index-*.js          205.19 kB  (gzip: 63.85 kB)
```

Total: ~212 kB raw, ~66 kB gzipped. React 19 dominates the JS bundle.

## Future Enhancements

### High Priority
- [ ] Memory create/edit form (currently read-only + delete)
- [ ] Real-time updates (WebSocket or polling)
- [ ] Import/export memories (JSON, CSV)
- [ ] Bulk operations (multi-select delete, re-categorize)
- [ ] Category and tag analytics charts

### Medium Priority
- [ ] Memory version history viewer
- [ ] Project filter/switcher
- [ ] Keyboard shortcuts (j/k navigation, / for search)
- [ ] Responsive mobile layout
- [ ] Dark/light theme toggle
- [ ] Memory diff viewer (version comparison)

### Low Priority
- [ ] Memory graph visualization (relationships)
- [ ] Usage analytics (API calls, popular memories)
- [ ] User preferences (default filters, page size)
- [ ] Export as CLAUDE.md / .cursorrules
- [ ] Drag-and-drop memory organization
- [ ] Collaborative editing (multi-user)

## Design Decisions

### Why not a UI framework (Tailwind, shadcn, etc.)?

- Dashboard is small (~6 components)
- Vanilla CSS with custom properties is sufficient
- Zero dependency overhead
- Full control over dark theme
- 6.8 kB CSS total — a framework would be larger

### Why serve from same port?

- Zero extra config for users
- No CORS setup needed
- Single process to manage
- `npm run dev` → everything works
- Dashboard is optional — if dist doesn't exist, server still works

### Why localStorage for API key?

- Simple persistence without backend sessions
- Dashboard is local-only (localhost), so security risk is minimal
- No cookies to manage
- User controls when to clear it

### Why no client-side routing library?

- Only 3 views — state-based switching is simpler
- No URL routing needed (it's a dashboard, not a web app)
- Avoids react-router dependency
- Could add hash-based routing later if needed
