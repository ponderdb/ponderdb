import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { StorageAdapter, EmbeddingProvider } from "@ponderdb/core";
import { PonderError } from "@ponderdb/core";
import { memoriesRouter } from "./routes/memories.js";
import { authRouter } from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";
import { mcpHttpRouter } from "./mcp-http.js";

export interface AppDeps {
  store: StorageAdapter;
  embedder: EmbeddingProvider;
  apiKeyRequired: boolean;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use("*", cors());
  app.use("*", logger());

  if (deps.apiKeyRequired) {
    app.use("/api/*", authMiddleware(deps.store));
  }

  // Health check
  app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

  // MCP over HTTP (no API key auth — MCP has its own session management)
  app.route("/mcp", mcpHttpRouter(deps));

  // API routes
  app.route("/api/memories", memoriesRouter(deps));
  app.route("/api/auth", authRouter(deps));

  // Error handler
  app.onError((err, c) => {
    if (err instanceof PonderError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.statusCode as 400);
    }
    console.error("Unhandled error:", err);
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, 500);
  });

  return app;
}
