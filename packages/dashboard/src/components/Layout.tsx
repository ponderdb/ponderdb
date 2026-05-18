import type { ReactNode } from "react";

type View = "dashboard" | "memories" | "categories" | "keys";

interface LayoutProps {
  children: ReactNode;
  view: View;
  onViewChange: (v: View) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  healthy: boolean;
}

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
  { id: "memories", label: "Memories", icon: "M4 6h16M4 12h16M4 18h7" },

  { id: "categories", label: "Categories", icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" },
  { id: "keys", label: "API Keys", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

export function Layout({ children, view, onViewChange, apiKey, onApiKeyChange, healthy }: LayoutProps) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <h1>PonderDB</h1>
          <span className="version">v0.1.0</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-btn ${view === n.id ? "active" : ""}`}
              onClick={() => onViewChange(n.id)}
            >
              <NavIcon path={n.icon} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="connection-status">
          <span className={`status-dot ${healthy ? "" : "offline"}`} />
          {healthy ? "Connected" : "Disconnected"}
        </div>
        <div className="sidebar-footer">
          <div className="api-key-input">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="pndr_..."
            />
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="page-content">
          {children}
        </div>
      </main>
    </div>
  );
}
