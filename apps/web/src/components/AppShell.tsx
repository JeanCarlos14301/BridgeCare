import { type ReactNode, useEffect, useState } from "react";

import { Icon } from "./Icon";

type Theme = "dark" | "light";

function storedTheme(): Theme {
  try {
    return window.localStorage.getItem("bridgecare-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("bridgecare-theme", theme);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this visit.
    }
  }, [theme]);
  const light = theme === "light";
  return (
    <button
      type="button"
      className="icon-button"
      aria-pressed={light}
      aria-label="Light theme"
      title={light ? "Switch to dark theme" : "Switch to light theme"}
      onClick={() => setTheme(light ? "dark" : "light")}
    >
      <Icon name={light ? "sun" : "moon"} size={18} />
    </button>
  );
}

export function AppShell(props: { status: ReactNode; session: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="backdrop" aria-hidden="true">
        <span className="glow glow-brand" />
        <span className="glow glow-accent" />
      </div>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <p className="wordmark">
            <span className="wordmark-mark" aria-hidden="true" />
            BridgeCare
            <span className="wordmark-tag">Discharge review</span>
          </p>
          <div className="topbar-actions">
            {props.status}
            <ThemeToggle />
            {props.session}
          </div>
        </div>
      </header>
      <main id="workspace" className="page" tabIndex={-1}>
        {props.children}
      </main>
    </>
  );
}
