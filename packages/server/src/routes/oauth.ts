import { Hono } from "hono";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { StorageAdapter } from "@ponderdb/core";
import { signToken } from "../auth/jwt.js";
import {
  getOAuthConfig,
  googleAuthUrl,
  exchangeGoogleCode,
  githubAuthUrl,
  exchangeGithubCode,
} from "../auth/oauth.js";
import type { OAuthUserInfo } from "../auth/oauth.js";

const SESSION_COOKIE = "ponderdb_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export function oauthRouter(store: StorageAdapter) {
  const router = new Hono();
  const config = getOAuthConfig();

  /** Find or create user from OAuth info, issue JWT, redirect to dashboard */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleOAuthUser(c: Context<any, any, any>, userInfo: OAuthUserInfo) {
    // Find existing user by email or create new one
    let user = await store.getUserByEmail(userInfo.email);

    if (!user) {
      user = await store.createUser({ email: userInfo.email, name: userInfo.name });
      // Create default API key for new user
      await store.createApiKey("default", user.id);
    }

    // Sign JWT
    const token = await signToken({ userId: user.id, email: user.email });

    // Set session cookie
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    // Redirect to dashboard
    return c.redirect("/");
  }

  // ── Available providers ──

  router.get("/providers", (c) => {
    return c.json({
      google: !!config.google,
      github: !!config.github,
      local: true,
    });
  });

  // ── Google ──

  if (config.google) {
    router.get("/google", (c) => {
      return c.redirect(googleAuthUrl(config));
    });

    router.get("/google/callback", async (c) => {
      const code = c.req.query("code");
      const error = c.req.query("error");

      if (error || !code) {
        return c.redirect("/?auth_error=google_denied");
      }

      try {
        const userInfo = await exchangeGoogleCode(code, config);
        return handleOAuthUser(c, userInfo);
      } catch (err) {
        console.error("Google OAuth error:", err);
        return c.redirect("/?auth_error=google_failed");
      }
    });
  }

  // ── GitHub ──

  if (config.github) {
    router.get("/github", (c) => {
      return c.redirect(githubAuthUrl(config));
    });

    router.get("/github/callback", async (c) => {
      const code = c.req.query("code");
      const error = c.req.query("error");

      if (error || !code) {
        return c.redirect("/?auth_error=github_denied");
      }

      try {
        const userInfo = await exchangeGithubCode(code, config);
        return handleOAuthUser(c, userInfo);
      } catch (err) {
        console.error("GitHub OAuth error:", err);
        return c.redirect("/?auth_error=github_failed");
      }
    });
  }

  // ── Session ──

  router.get("/me", async (c) => {
    // Check JWT cookie or API key
    const userId = (c.get as (key: string) => string | undefined)("userId");
    if (!userId) {
      return c.json({ authenticated: false }, 401);
    }

    const user = await store.getUserById(userId);
    if (!user) {
      return c.json({ authenticated: false }, 401);
    }

    return c.json({
      authenticated: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  });

  router.post("/logout", (c) => {
    setCookie(c, SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 0,
      path: "/",
    });
    return c.json({ ok: true });
  });

  return router;
}
