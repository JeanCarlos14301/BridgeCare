import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import App from "./App";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("App", () => {
  it("shows API readiness and an explicit mock badge", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(url.endsWith("health")
        ? { status: "ok", provider_mode: "mock" }
        : { status: "ready", provider_mode: "mock", detail: "Mock provider is ready" }),
    })));
    const rootElement = document.createElement("div");
    document.body.appendChild(rootElement);
    const root = createRoot(rootElement);
    await act(async () => root.render(<App />));
    expect(document.body.textContent).toContain("MOCK");
    expect(document.body.textContent).toContain("Online");
    expect(document.body.textContent).toContain("Mock provider is ready");
    root.unmount();
  });
});

