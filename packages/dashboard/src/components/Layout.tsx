import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import type { ProjectInfo } from "../api";

type View = "dashboard" | "memories" | "categories" | "keys" | "projects";

interface LayoutProps {
  children: ReactNode;
  view: View;
  onViewChange: (v: View) => void;
  apiKey: string;
  healthy: boolean;
  projects: ProjectInfo[];
  projectId: string;
  onProjectChange: (id: string) => void;
  onLogout: () => void;
}

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
  { id: "memories", label: "Memories", icon: "M4 6h16M4 12h16M4 18h7" },
  { id: "categories", label: "Categories", icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" },
  { id: "projects", label: "Projects", icon: "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" },
  { id: "keys", label: "API Keys", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

function ProjectDropdown({
  projects,
  projectId,
  onProjectChange,
  onManage,
}: {
  projects: ProjectInfo[];
  projectId: string;
  onProjectChange: (id: string) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = projects.find((p) => p.slug === projectId);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="sidebar-project-selector" ref={ref}>
      <button
        className={`project-dropdown-btn ${open ? "project-dropdown-open" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
        <span className="project-dropdown-name">{current?.name || "No project"}</span>
        {current?.memoryCount !== undefined && (
          <span className="project-dropdown-count">{current.memoryCount}</span>
        )}
        <svg className={`project-dropdown-chevron ${open ? "chevron-up" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="project-dropdown-menu">
          {projects.map((p) => (
            <button
              key={p.slug}
              className={`project-dropdown-item ${p.slug === projectId ? "project-dropdown-item-active" : ""}`}
              onClick={() => { onProjectChange(p.slug); setOpen(false); }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
              <span className="project-dropdown-item-name">{p.name}</span>
              {p.memoryCount !== undefined && (
                <span className="project-dropdown-item-count">{p.memoryCount}</span>
              )}
              {p.slug === projectId && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
          <div className="project-dropdown-divider" />
          <button
            className="project-dropdown-item project-dropdown-manage"
            onClick={() => { onManage(); setOpen(false); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <span>Manage projects</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout({ children, view, onViewChange, apiKey, healthy, projects, projectId, onProjectChange, onLogout }: LayoutProps) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <img src="/ponder-icon.svg" alt="PonderDB" className="logo-icon" />
          <div className="logo-text">
            <h1>PonderDB</h1>
            <span className="version">v0.2.0</span>
          </div>
        </div>

        <ProjectDropdown
          projects={projects}
          projectId={projectId}
          onProjectChange={onProjectChange}
          onManage={() => onViewChange("projects")}
        />

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

        <div className="sidebar-bottom">
          <a href="https://github.com/ponderdb/ponderdb#readme" target="_blank" rel="noopener noreferrer" className="sidebar-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Documentation</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>

          <div className="sidebar-divider" />

          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {apiKey.slice(5, 7).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">Local User</span>
              <span className="sidebar-user-status">
                <span className={`status-dot ${healthy ? "" : "offline"}`} />
                {healthy ? "Connected" : "Offline"}
              </span>
            </div>
            <button className="sidebar-settings-btn" onClick={onLogout} title="Logout">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
            <button className="sidebar-settings-btn" onClick={() => onViewChange("keys")} title="API Keys">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
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
