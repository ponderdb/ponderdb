import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { StorageAdapter, EmbeddingProvider } from "@ponderdb/core";
import { createMcpServer } from "./mcp.js";

interface McpHttpDeps {
  store: StorageAdapter;
  embedder: EmbeddingProvider;
}

export function mcpHttpRouter(deps: McpHttpDeps) {
  const router = new Hono();
  const { store, embedder } = deps;

  // Map of session ID -> transport for stateful sessions
  const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

  router.all("/", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    // For existing sessions, route to stored transport
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      return transport.handleRequest(c.req.raw);
    }

    // For DELETE on unknown session, 404
    if (c.req.method === "DELETE") {
      return c.json({ error: "Session not found" }, 404);
    }

    // New session: create transport + MCP server
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    const mcpServer = createMcpServer(store, embedder);
    await mcpServer.connect(transport);

    return transport.handleRequest(c.req.raw);
  });

  return router;
}
