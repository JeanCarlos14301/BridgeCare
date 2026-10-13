import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PatientView } from "../api";
import { PatientSheet } from "./PatientSheet";

const view = (language: "en" | "es"): PatientView => ({
  case_id: "case-1",
  revision_id: "rev-1",
  content_hash: "hash",
  approved_at: "2026-10-13T00:00:00Z",
  provider_mode: "mock",
  language,
  summary: language === "es" ? "Resumen" : "Summary",
  medications: [{ name: "Lisinopril", dose: "10", unit: "mg", route: "by mouth", frequency: null, duration: null }],
  follow_up: [],
  warning_signs: [],
  activity: null,
  diet: null,
  notice: language === "es" ? "Aviso" : "Notice",
});

function stubFetch() {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      urls.push(url);
      const language = url.includes("lang=es") ? "es" : "en";
      return Promise.resolve(new Response(JSON.stringify(view(language)), { status: 200 }));
    }),
  );
  return urls;
}

function render(element: React.ReactNode) {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  act(() => root.render(element));
  return { node, root };
}

const button = (text: string) =>
  [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(text)) ?? null;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("patient sheet", () => {
  it("lets a reviewer preview an unapproved revision in Spanish without a print option", async () => {
    const urls = stubFetch();
    const sheet = render(<PatientSheet caseId="case-1" role="reviewer" />);

    await act(async () => button("Preview before approval")?.click());
    expect(urls).toEqual(["/api/cases/case-1/preview?lang=en"]);
    expect(document.querySelector("dialog.is-preview")).not.toBeNull();
    expect(document.body.textContent).toContain("Not for the patient");
    expect(button("Print")).toBeNull();

    await act(async () => button("Español")?.click());
    expect(urls.at(-1)).toBe("/api/cases/case-1/preview?lang=es");
    expect(document.querySelector(".printable")?.getAttribute("lang")).toBe("es");
    expect(document.querySelector(".printable")?.textContent).toContain("Medicamentos");
    sheet.root.unmount();
  });

  it("opens the approved sheet with a print option and renders the dialog outside the app root", async () => {
    const urls = stubFetch();
    const sheet = render(<PatientSheet caseId="case-1" role="reviewer" approved />);

    await act(async () => button("Open patient sheet")?.click());
    expect(urls).toEqual(["/api/cases/case-1/patient-view?lang=en"]);
    expect(button("Print")).not.toBeNull();
    const dialog = document.querySelector("dialog.sheet-dialog");
    expect(dialog?.parentElement).toBe(document.body);
    expect(sheet.node.contains(dialog)).toBe(false);
    sheet.root.unmount();
  });

  it("does not offer a preview to visitors", () => {
    stubFetch();
    const sheet = render(<PatientSheet caseId="case-1" />);
    expect(button("Preview before approval")).toBeNull();
    expect(button("Open patient sheet")).not.toBeNull();
    sheet.root.unmount();
  });
});
