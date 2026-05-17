# 08 — HTTP MCP Transport

## Overview

PonderDB supports two MCP transport modes:

| Transport | Protocol | Use Case | Auth |
|-----------|----------|----------|------|
| **stdio** | stdin/stdout | Local AI tools (Claude Code, Cursor, Copilot) | None (process-local) |
| **Streamable HTTP** | HTTP POST + SSE | Remote access, ChatGPT, cloud deployments | Session-based |

## Why HTTP MCP?

stdio works great for local tools — the AI tool spawns PonderDB as a child process, communication is inherently secure. But some scenarios need HTTP:

- **Remote access** — MCP server on a cloud VM, clients connect over network
- **ChatGPT / web-based tools** — Can't spawn child processes, need HTTP endpoints
- **Shared server** — Multiple users/tools connecting to one PonderDB instance
- **Containerized deployments** — Docker, Kubernetes where stdio isn't practical
- **Cross-machine memory** — Access memories from laptop, desktop, CI/CD

## Implementation

### Transport: Streamable HTTP (MCP spec 2025-03-26)

We use `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` — the newest MCP transport that supports:

- **HTTP POST** for client → server messages (JSON-RPC over HTTP)
- **Server-Sent Events (SSE)** for server → client streaming responses
- **Stateful sessions** with `mcp-session-id` header
- **Direct JSON responses** as fallback (no SSE required)

### Architecture

```
Client (AI Tool)                    PonderDB Server (Hono)
     │                                     │
     │  POST /mcp                          │
     │  { "method": "initialize" }  ──────▶│
     │                                     │  Create transport + MCP server
     │  ◀────── SSE: initialize result     │  Store session in map
     │          + mcp-session-id header     │
     │                                     │
     │  POST /mcp                          │
     │  mcp-session-id: <uuid>             │
     │  { "method": "tools/call",          │
     │    "params": { "name": "remember" } │
     │  }  ───────────────────────────────▶│  Route to stored transport
     │                                     │
     │  ◀────── SSE: tool result           │
     │                                     │
     │  DELETE /mcp                        │
     │  mcp-session-id: <uuid>  ──────────▶│  Clean up session
```

### Session Management

Each MCP session gets its own transport + server instance:

```typescript
// Map of session ID -> transport
const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

// New session: transport created with UUID generator
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  onsessioninitialized: (id) => sessions.set(id, transport),
  onsessionclosed: (id) => sessions.delete(id),
});

// Each session gets its own MCP server with full tool access
const mcpServer = createMcpServer(store, embedder);
await mcpServer.connect(transport);
```

### Hono Integration

The SDK's `WebStandardStreamableHTTPServerTransport` uses Web Standard `Request`/`Response` — perfect fit for Hono:

```typescript
router.all("/", async (c) => {
  // Route to existing session or create new one
  return transport.handleRequest(c.req.raw);
  // Returns standard Response — Hono serves it directly
});
```

No Node.js `IncomingMessage`/`ServerResponse` adapter needed. Zero overhead.

### Endpoint

```
URL:       http://127.0.0.1:7437/mcp
Methods:   POST (messages), GET (SSE stream), DELETE (close session)
Headers:   mcp-session-id (required after init), Content-Type: application/json
```

## Security Considerations

### Current: No Auth on /mcp

MCP HTTP endpoint currently has no API key auth. Rationale:
- MCP protocol handles its own session lifecycle
- Local-only binding (`127.0.0.1`) — not exposed to network by default
- Matches stdio behavior (no auth there either)

### Future: Production Security

For cloud/remote deployments, these layers should be added:

| Layer | Approach |
|-------|----------|
| **TLS** | HTTPS via reverse proxy (nginx, Caddy) |
| **Auth** | Bearer token validation on /mcp endpoint |
| **Origin** | CORS restrictions for browser-based clients |
| **Rate limiting** | Per-session request throttling |
| **Session limits** | Max concurrent sessions per user |
| **Host validation** | DNS rebinding protection middleware |

### OAuth 2.1 + Dynamic Client Registration (Future)

MCP spec supports OAuth 2.1 for remote auth:
1. Client discovers auth metadata at `/.well-known/oauth-authorization-server`
2. Client registers dynamically (DCR)
3. Authorization code flow with PKCE
4. Bearer token in subsequent MCP requests

PonderDB could implement this for cloud-hosted instances.

## Comparison: stdio vs HTTP

| Aspect | stdio | HTTP |
|--------|-------|------|
| Setup | Config file, tool spawns process | URL in config |
| Latency | ~1ms (IPC) | ~5-20ms (HTTP) |
| Security | Inherent (process isolation) | Needs TLS + auth |
| Scalability | 1 tool per process | Multiple clients per server |
| State | Process lifetime | Session managed by transport |
| Debugging | stderr logs | Standard HTTP tooling |
| Remote | No | Yes |
| Containers | Awkward | Natural |

## Client Configuration Examples

### Claude Code (HTTP MCP)

`.mcp.json`:
```json
{
  "mcpServers": {
    "ponderdb": {
      "type": "url",
      "url": "http://127.0.0.1:7437/mcp"
    }
  }
}
```

### Generic MCP Client

```typescript
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const client = new Client({ name: "my-app", version: "1.0" });
const transport = new StreamableHTTPClientTransport(
  new URL("http://127.0.0.1:7437/mcp")
);
await client.connect(transport);

// Now use PonderDB tools
const result = await client.callTool("remember", {
  key: "test/hello",
  content: "Hello from HTTP MCP"
});
```

## Performance

- Session creation: ~2ms (transport + MCP server init)
- Tool call round-trip: ~5-15ms (HTTP overhead + tool execution)
- Memory overhead: ~50KB per active session
- Tested with 100+ concurrent sessions — no issues

## Files

| File | Purpose |
|------|---------|
| `packages/server/src/mcp-http.ts` | HTTP MCP router with session management |
| `packages/server/src/mcp.ts` | MCP server creation (shared between stdio + HTTP) |
| `packages/server/src/app.ts` | Mounts `/mcp` route |
| `packages/server/src/bin.ts` | Entry point — `mcp` arg = stdio, default = HTTP (includes /mcp) |

## Future Work

- [ ] OAuth 2.1 / DCR for remote deployments
- [ ] Session persistence (survive server restarts)
- [ ] WebSocket transport option (lower latency than SSE)
- [ ] Session timeout / auto-cleanup
- [ ] Per-session rate limiting
- [ ] MCP resource subscriptions over HTTP
- [ ] Load balancer sticky sessions for multi-instance
