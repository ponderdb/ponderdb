import { useState, useEffect, useCallback } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { MemoryList } from "./components/MemoryList";
import { Categories } from "./components/Categories";
import { ApiKeys } from "./components/ApiKeys";
import { Projects } from "./components/Projects";
import { fetchHealth, listProjects, listApiKeys } from "./api";
import type { Memory, ProjectInfo } from "./api";

type View = "dashboard" | "memories" | "categories" | "keys" | "projects";

interface AuthProviders {
  google: boolean;
  github: boolean;
  local: boolean;
}

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

function LoginScreen() {
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/auth/providers")
      .then((r) => r.json())
      .then((p) => setProviders(p as AuthProviders))
      .catch(() => setProviders({ google: false, github: false, local: true }));

    // Check for auth errors from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      setError(authError === "google_denied" ? "Google login was cancelled" :
               authError === "github_denied" ? "GitHub login was cancelled" :
               "Login failed. Please try again.");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  if (!providers) return <div className="loading">Loading...</div>;

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <img src="/ponder-icon.svg" alt="PonderDB" className="setup-logo" />
        <h1>Welcome to PonderDB</h1>
        <p>Sign in to access your AI memory dashboard.</p>

        <div className="login-buttons">
          {providers.google && (
            <a href="/auth/google" className="login-btn login-btn-google">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </a>
          )}

          {providers.github && (
            <a href="/auth/github" className="login-btn login-btn-github">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Continue with GitHub
            </a>
          )}

          {!providers.google && !providers.github && (
            <p className="setup-hint">
              No OAuth providers configured. Set <code>GOOGLE_CLIENT_ID</code> or <code>GITHUB_CLIENT_ID</code> in your <code>.env</code> file.
            </p>
          )}
        </div>

        {error && <div className="setup-error">{error}</div>}

        <p className="setup-hint">
          Your data is stored securely and scoped to your account.
        </p>
      </div>
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [projectId, setProjectId] = useState<string>(
    () => localStorage.getItem("ponderdb_project") || "",
  );

  // Check health
  useEffect(() => {
    fetchHealth()
      .then(() => setHealthy(true))
      .catch(() => setHealthy(false));
  }, []);

  // Check auth session (JWT cookie)
  useEffect(() => {
    if (!healthy) return;
    fetch("/auth/me")
      .then((r) => r.json())
      .then(async (data) => {
        if (data.authenticated && data.user) {
          setUser(data.user);
          // Fetch user's first API key to use for API calls
          try {
            const keysRes = await listApiKeys();
            if (keysRes.keys.length > 0) {
              // We have keys but not the raw key — use cookie auth (empty apiKey)
              setApiKey("");
            }
          } catch {
            // Cookie auth will handle it
          }
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, [healthy]);

  useEffect(() => {
    localStorage.setItem("ponderdb_project", projectId);
  }, [projectId]);

  const handleLogout = useCallback(async () => {
    try { await fetch("/auth/logout", { method: "POST" }); } catch {}
    setUser(null);
    setApiKey("");
    setProjectId("");
    setProjects([]);
    localStorage.removeItem("ponderdb_project");
  }, []);

  const loadProjects = useCallback(() => {
    if (!user) { setProjects([]); return; }
    // Use cookie auth (no apiKey needed)
    listProjects()
      .then((r) => {
        setProjects(r.projects);
        if (r.projects.length > 0) {
          const currentExists = r.projects.some((p) => p.slug === projectId);
          if (!projectId || !currentExists) {
            setProjectId(r.projects[0].slug);
          }
        }
      })
      .catch((e) => {
        if (e.message?.includes("401")) handleLogout();
        setProjects([]);
      });
  }, [user, projectId, handleLogout]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleSelectMemory = useCallback((memory: Memory) => {
    setSelectedMemory(memory);
    setView("memories");
  }, []);

  const handleViewChange = useCallback((v: View) => {
    setSelectedMemory(null);
    setView(v);
  }, []);

  if (healthy === null) return <div className="loading">Connecting to PonderDB...</div>;
  if (healthy === false)
    return (
      <div className="error-page">
        <h1>Cannot connect to PonderDB</h1>
        <p>Make sure server is running on port 7437</p>
      </div>
    );

  if (!authChecked) return <div className="loading">Checking session...</div>;

  // Not logged in — show login screen
  if (!user) {
    return <LoginScreen />;
  }

  // Logged in but no projects — force project creation
  if (projects.length === 0) {
    return (
      <Layout
        view="projects"
        onViewChange={handleViewChange}
        apiKey={apiKey}
        healthy={true}
        projects={projects}
        projectId={projectId}
        onProjectChange={setProjectId}
        onLogout={handleLogout}
      >
        <Projects apiKey={apiKey} currentProjectId={projectId} onProjectsChanged={loadProjects} />
      </Layout>
    );
  }

  return (
    <Layout
      view={view}
      onViewChange={handleViewChange}
      apiKey={apiKey}
      healthy={true}
      projects={projects}
      projectId={projectId}
      onProjectChange={setProjectId}
      onLogout={handleLogout}
    >
      {view === "dashboard" && <Dashboard apiKey={apiKey} projectId={projectId} onSelectMemory={handleSelectMemory} />}
      {view === "memories" && (
        <MemoryList
          apiKey={apiKey}
          projectId={projectId}
          initialMemory={selectedMemory}
          onMemoryConsumed={() => setSelectedMemory(null)}
        />
      )}
      {view === "categories" && <Categories apiKey={apiKey} projectId={projectId} onSelectMemory={handleSelectMemory} />}
      {view === "keys" && <ApiKeys apiKey={apiKey} onApiKeyChange={setApiKey} />}
      {view === "projects" && <Projects apiKey={apiKey} currentProjectId={projectId} onProjectsChanged={loadProjects} />}
    </Layout>
  );
}
