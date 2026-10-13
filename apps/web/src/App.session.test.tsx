import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { CaseView } from "./api";

const failedCase: CaseView = {
  case_id: "case-1",
  fixture_id: "fx06_provider_failure",
  status: "failed",
  failure_reason: "provider_error",
  created_at: "2026-10-12T00:00:00Z",
  updated_at: "2026-10-12T00:00:00Z",
  source_documents: [],
  revision: null,
  review: null,
};

type Route = (init?: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stubApi(routes: Record<string, Route>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "")}`;
      calls.push(key);
      const route = routes[key];
      return Promise.resolve(route ? route(init) : new Response("not found", { status: 404 }));
    }),
  );
  return calls;
}

const baseRoutes: Record<string, Route> = {
  "GET /health": () => json({ status: "ok", provider_mode: "mock" }),
  "POST /session": () => json({ role: "reviewer" }),
  "GET /fixtures": () =>
    json([{ id: "fx06_provider_failure", title: "Provider timeout", scenario: "provider_failure", description: "" }]),
  "POST /cases/from-fixture": () => json(failedCase),
};

async function renderApp() {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(<App />));
  return { node, root };
}

const button = (node: HTMLElement, text: string) =>
  [...node.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(text)) as HTMLButtonElement;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("session handling", () => {
  it("keeps the reviewer role but clears the case when logout fails", async () => {
    stubApi({
      ...baseRoutes,
      "POST /cases/case-1/process": () => json(failedCase),
      "POST /session/logout": () => new Response("down", { status: 503 }),
    });
    const view = await renderApp();
    await act(async () => button(view.node, "Provider timeout").click());
    expect(view.node.querySelector(".case-header")).not.toBeNull();

    await act(async () => button(view.node, "Log out").click());

    expect(view.node.querySelector(".case-header")).toBeNull();
    expect(view.node.querySelector(".pill-role")?.textContent).toBe("Reviewer");
    expect(view.node.textContent).toContain("Logout failed");
    view.root.unmount();
  });

  it("drops a response that arrives after logout and starts a visitor session", async () => {
    let finishProcessing: (response: Response) => void = () => {};
    let sessionCalls = 0;
    const calls = stubApi({
      ...baseRoutes,
      "POST /session": () => json({ role: sessionCalls++ === 0 ? "reviewer" : "visitor" }),
      "POST /cases/case-1/process": () => new Promise<Response>((resolve) => (finishProcessing = resolve)),
      "POST /session/logout": () => new Response(null, { status: 204 }),
    });
    const view = await renderApp();
    await act(async () => button(view.node, "Provider timeout").click());

    await act(async () => button(view.node, "Log out").click());
    await act(async () => finishProcessing(json(failedCase)));

    expect(view.node.querySelector(".case-header")).toBeNull();
    expect(button(view.node, "Reviewer login")).toBeDefined();
    expect(calls.filter((call) => call === "POST /session")).toHaveLength(2);
    view.root.unmount();
  });
});

describe("provider pill", () => {
  it("still shows MOCK from the revision when /health is unavailable", async () => {
    const mockCase: CaseView = {
      ...failedCase,
      status: "needs_review",
      failure_reason: null,
      revision: {
        revision_id: "rev-1",
        number: 1,
        origin: "model",
        content_hash: "hash",
        created_at: "2026-10-12T00:00:00Z",
        model: "mock-model",
        prompt_version: "extraction-v2",
        provider_mode: "mock",
        timings: { model_ms: null, total_ms: 1 },
        source_documents: [],
        patient_draft: { summary: null },
        uncertainties: [],
        gate: { approvable: true, requires_resolution_note: false, blocking_reasons: [] },
        extracted_fields: {
          medications: [],
          follow_up: [],
          warning_signs: [],
          activity: { text: null, evidence_state: "missing", citations: [] },
          diet: { text: null, evidence_state: "missing", citations: [] },
        },
      },
    };
    stubApi({
      ...baseRoutes,
      "GET /health": () => new Response("down", { status: 503 }),
      "POST /cases/case-1/process": () => json(mockCase),
    });
    const view = await renderApp();
    expect(view.node.querySelector(".pill-mock")).toBeNull();

    await act(async () => button(view.node, "Provider timeout").click());

    expect(view.node.querySelector(".pill-mock")?.textContent).toContain("MOCK");
    view.root.unmount();
  });
});

describe("server measurements and limits", () => {
  it("shows the server's quota message when processing returns 429", async () => {
    stubApi({
      ...baseRoutes,
      "POST /session": () => json({ role: "visitor" }),
      "POST /cases/case-1/process": () =>
        json({ detail: "Visitor processing limit reached (maximum 3 runs per session)." }, 429),
    });
    const view = await renderApp();
    await act(async () => button(view.node, "Provider timeout").click());
    expect(view.node.textContent).toContain("Visitor processing limit reached (maximum 3 runs per session).");
    view.root.unmount();
  });

  it("reads the processed case as a reviewer so the server starts the review timer", async () => {
    const needsReview: CaseView = { ...failedCase, status: "needs_review", failure_reason: null };
    const calls = stubApi({
      ...baseRoutes,
      "POST /cases/case-1/process": () => json(needsReview),
      "GET /cases/case-1": () => json(needsReview),
    });
    const view = await renderApp();
    await act(async () => button(view.node, "Provider timeout").click());
    expect(calls).toContain("GET /cases/case-1");
    expect(calls.indexOf("GET /cases/case-1")).toBeGreaterThan(calls.indexOf("POST /cases/case-1/process"));
    view.root.unmount();
  });
});

describe("reusing processed cases", () => {
  const caseFor = (fixtureId: string, caseId: string): CaseView => ({
    ...failedCase,
    case_id: caseId,
    fixture_id: fixtureId,
    status: "needs_review",
    failure_reason: null,
  });
  const twoFixtures: Route = () =>
    json([
      { id: "fx_a", title: "Document A", scenario: "clear", description: "" },
      { id: "fx_b", title: "Document B", scenario: "clear", description: "" },
    ]);
  const routes = (): Record<string, Route> => ({
    ...baseRoutes,
    "POST /session": () => json({ role: "visitor" }),
    "GET /fixtures": twoFixtures,
    "POST /cases/from-fixture": (init) => {
      const fixtureId = JSON.parse(String(init?.body)).fixture_id as string;
      return json(caseFor(fixtureId, fixtureId === "fx_a" ? "case-a" : "case-b"));
    },
    "POST /cases/case-a/process": () => json(caseFor("fx_a", "case-a")),
    "POST /cases/case-b/process": () => json(caseFor("fx_b", "case-b")),
    "GET /cases/case-a": () => json(caseFor("fx_a", "case-a")),
  });

  it("reopens a document already processed in this session without calling the model again", async () => {
    const calls = stubApi(routes());
    const view = await renderApp();
    await act(async () => button(view.node, "Document A").click());
    await act(async () => button(view.node, "Document B").click());
    await act(async () => button(view.node, "Document A").click());

    expect(calls.filter((call) => call === "POST /cases/case-a/process")).toHaveLength(1);
    expect(calls.filter((call) => call === "POST /cases/from-fixture")).toHaveLength(2);
    expect(calls.at(-1)).toBe("GET /cases/case-a");
    expect(view.node.querySelector(".case-title h1")?.textContent).toBe("Document A");
    view.root.unmount();
  });

  it("restores this session's processed cases on load and can still run the model again", async () => {
    const calls = stubApi({
      ...routes(),
      "GET /cases": () =>
        json([{ case_id: "case-a", fixture_id: "fx_a", status: "approved", updated_at: "2026-10-13T00:00:00Z" }]),
    });
    const view = await renderApp();
    await act(async () => button(view.node, "Document A").click());
    expect(calls).not.toContain("POST /cases/from-fixture");
    expect(calls).toContain("GET /cases/case-a");

    await act(async () => button(view.node, "Run again").click());
    expect(calls).toContain("POST /cases/from-fixture");
    expect(calls).toContain("POST /cases/case-a/process");
    view.root.unmount();
  });
});

