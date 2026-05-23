/** OAuth provider configuration */
export interface OAuthConfig {
  google?: {
    clientId: string;
    clientSecret: string;
  };
  github?: {
    clientId: string;
    clientSecret: string;
  };
  /** Base URL for callbacks (e.g. http://localhost:7437) */
  baseUrl: string;
}

export interface OAuthUserInfo {
  email: string;
  name: string;
  provider: "google" | "github";
  providerId: string;
}

export function getOAuthConfig(): OAuthConfig {
  return {
    google: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
      : undefined,
    github: process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET }
      : undefined,
    baseUrl: process.env.PONDER_BASE_URL || `http://${process.env.PONDER_HOST || "127.0.0.1"}:${process.env.PONDER_PORT || "7437"}`,
  };
}

// ── Google OAuth ──

export function googleAuthUrl(config: OAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.google!.clientId,
    redirect_uri: `${config.baseUrl}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string, config: OAuthConfig): Promise<OAuthUserInfo> {
  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      client_id: config.google!.clientId,
      client_secret: config.google!.clientSecret,
      redirect_uri: `${config.baseUrl}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${body}`);
  }

  const tokens = await tokenRes.json() as { access_token: string };

  // Fetch user info
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) throw new Error("Failed to fetch Google user info");

  const user = await userRes.json() as { id: string; email: string; name: string };

  return {
    email: user.email,
    name: user.name || user.email.split("@")[0],
    provider: "google",
    providerId: user.id,
  };
}

// ── GitHub OAuth ──

export function githubAuthUrl(config: OAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.github!.clientId,
    redirect_uri: `${config.baseUrl}/auth/github/callback`,
    scope: "user:email",
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeGithubCode(code: string, config: OAuthConfig): Promise<OAuthUserInfo> {
  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: config.github!.clientId,
      client_secret: config.github!.clientSecret,
      code,
    }),
  });

  if (!tokenRes.ok) throw new Error("GitHub token exchange failed");

  const tokens = await tokenRes.json() as { access_token: string };

  // Fetch user info
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!userRes.ok) throw new Error("Failed to fetch GitHub user info");

  const user = await userRes.json() as { id: number; login: string; name: string | null; email: string | null };

  // Email may be private — fetch from emails endpoint
  let email = user.email;
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (emailRes.ok) {
      const emails = await emailRes.json() as { email: string; primary: boolean; verified: boolean }[];
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email || emails[0]?.email || null;
    }
  }

  if (!email) throw new Error("Could not get email from GitHub");

  return {
    email,
    name: user.name || user.login,
    provider: "github",
    providerId: String(user.id),
  };
}
