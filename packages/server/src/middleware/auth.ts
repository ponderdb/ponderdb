import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { StorageAdapter } from "@ponderdb/core";
import { AuthenticationError } from "@ponderdb/core";
import { verifyToken } from "../auth/jwt.js";

const SESSION_COOKIE = "ponderdb_session";

/**
 * Auth middleware — accepts API key (Bearer) OR JWT session cookie.
 * API key: for MCP, SDK, CLI integrations
 * JWT cookie: for dashboard web sessions (set by OAuth login)
 */
export function authMiddleware(store: StorageAdapter): MiddlewareHandler {
  return async (c, next) => {
    // Try API key first (Bearer token)
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (!token.startsWith("pndr_")) {
        throw new AuthenticationError("Invalid API key format");
      }

      const apiKey = await store.validateApiKey(token);
      if (!apiKey) {
        throw new AuthenticationError("Invalid or expired API key");
      }

      c.set("userId", apiKey.userId);
      c.set("apiKeyId", apiKey.id);
      return next();
    }

    // Try JWT session cookie (dashboard)
    const sessionToken = getCookie(c, SESSION_COOKIE);
    if (sessionToken) {
      const payload = await verifyToken(sessionToken);
      if (payload) {
        c.set("userId", payload.userId);
        c.set("apiKeyId", "session");
        return next();
      }
    }

    throw new AuthenticationError();
  };
}
