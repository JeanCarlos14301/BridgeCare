import { type ReactNode, useEffect, useState } from "react";

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
  return (
    <button
      type="button"
      className="button button-ghost button-sm"
      aria-pressed={theme === "light"}
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      Light theme
    </button>
  );
}

export function AppShell(props: { status: ReactNode; session: ReactNode; children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <p className="wordmark">
            <span className="wordmark-mark" aria-hidden="true" />
            BridgeCare
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
