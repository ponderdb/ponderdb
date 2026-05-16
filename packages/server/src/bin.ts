import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SqliteStore } from "@ponderdb/sqlite-store";
import { expandPath, DEFAULT_CONFIG } from "@ponderdb/core";
import { createApp } from "./app.js";
import { createMcpServer } from "./mcp.js";
import { LocalEmbeddingProvider } from "./embedder/local.js";

const mode = process.argv[2] ?? "http";

async function main() {
  const dataDir = expandPath(process.env.PONDER_DATA_DIR ?? DEFAULT_CONFIG.dataDir);
  const port = Number(process.env.PONDER_PORT ?? DEFAULT_CONFIG.port);
  const host = process.env.PONDER_HOST ?? DEFAULT_CONFIG.host;

  // Initialize storage
  const store = new SqliteStore(dataDir);
  await store.init();

  // Initialize embedder (local placeholder for MVP)
  const embedder = new LocalEmbeddingProvider();

  if (mode === "mcp") {
    // MCP stdio mode — used by Claude, Cursor, Copilot, etc.
    // No auth needed — stdio is process-local, only the parent can talk to it.
    const mcpServer = createMcpServer(store, embedder);
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error("PonderDB MCP server running on stdio");
  } else {
    // HTTP mode — REST API with auth
    const apiKeyRequired = process.env.PONDER_API_KEY_REQUIRED !== "false";

    // Auto-generate API key on first start
    if (apiKeyRequired) {
      const keyCount = await store.countApiKeys();
      if (keyCount === 0) {
        const { rawKey } = await store.createApiKey("default");
        console.log("\n  ┌─────────────────────────────────────────────────────┐");
        console.log("  │                                                     │");
        console.log("  │  Your API key (save this — shown only once):        │");
        console.log(`  │  ${rawKey}  │`);
        console.log("  │                                                     │");
        console.log("  │  Use: Authorization: Bearer <key>                   │");
        console.log("  │  Or:  PONDER_API_KEY=<key> in .env                  │");
        console.log("  │                                                     │");
        console.log("  └─────────────────────────────────────────────────────┘\n");
      }
    }

    const app = createApp({ store, embedder, apiKeyRequired });

    const server = serve({ fetch: app.fetch, port, hostname: host }, () => {
      console.log(`PonderDB server running at http://${host}:${port}`);
      console.log(`Data directory: ${dataDir}`);
      console.log(`Auth: ${apiKeyRequired ? "enabled" : "disabled"}`);
    });

    // Graceful shutdown — close HTTP server then DB
    const shutdown = () => {
      console.log("\nShutting down...");
      server.close(async () => {
        await store.close();
        process.exit(0);
      });
      // Force exit after 3s if server won't close
      setTimeout(() => process.exit(0), 3000);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  // Graceful shutdown for MCP mode
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      await store.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error("Failed to start PonderDB:", err);
  process.exit(1);
});
