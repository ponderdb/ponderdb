import type { ReactNode } from "react";

type View = "memories" | "search" | "keys";

interface LayoutProps {
  children: ReactNode;
  view: View;
  onViewChange: (v: View) => void;
}

const NAV: { id: View; label: string }[] = [
  { id: "memories", label: "Memories" },
  { id: "search", label: "Search" },
  { id: "keys", label: "API Keys" },
];

export function Layout({ children, view, onViewChange }: LayoutProps) {
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
              {n.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
