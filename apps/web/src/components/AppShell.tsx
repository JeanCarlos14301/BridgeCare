import { type ReactNode, useEffect, useState } from "react";

import { Icon } from "./Icon";

type Theme = "light" | "dark";

function storedTheme(): Theme {
  try {
    return window.localStorage.getItem("bridgecare-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("bridgecare-theme", theme);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this visit.
    }
  }, [theme]);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="icon-button"
      aria-pressed={dark}
      aria-label="Dark theme"
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <Icon name={dark ? "moon" : "sun"} size={16} />
    </button>
  );
}

/**
 * Desktop app frame: a fixed sidebar, a toolbar, an optional status strip, and a workspace that
 * fills the rest of the window. Panes inside the workspace scroll on their own.
 */
export function AppShell(props: {
  sidebar: ReactNode;
  sidebarFooter: ReactNode;
  toolbar: ReactNode;
  strip?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <aside className="sidebar" aria-label="Documents and session">
        <div className="sidebar-brand">
          <span className="wordmark-mark" aria-hidden="true" />
          <div>
            <p className="wordmark">BridgeCare</p>
            <p className="wordmark-tag">Discharge review</p>
          </div>
        </div>
        <div className="sidebar-scroll">{props.sidebar}</div>
        <div className="sidebar-footer">{props.sidebarFooter}</div>
      </aside>
      <div className="main">
        <header className="toolbar">{props.toolbar}</header>
        {props.strip}
        <main id="workspace" className="workspace" tabIndex={-1}>
          {props.children}
        </main>
      </div>
    </div>
  );
}
