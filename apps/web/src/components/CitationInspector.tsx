import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useState } from "react";

import type { Revision, SourceDocument } from "../api";
import { FieldsPanel } from "./FieldsPanel";
import { chipId, type SelectField, type Selection } from "./selection";
import { SourcePanel } from "./SourcePanel";

type Tab = "source" | "fields";
const TABS: { id: Tab; label: string }[] = [
  { id: "fields", label: "Fields" },
  { id: "source", label: "Source" },
];

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * Dual-pane inspector: source pages on the left, fields on the right (>= 1024 px), or two tabs on
 * smaller screens. Selecting a field or chip scrolls the source to the exact quote.
 */
export function CitationInspector(props: {
  documents: SourceDocument[];
  revision: Revision;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<Tab>("fields");

  const select: SelectField = (fieldKey, citations, index, state) => {
    setSelection((current) => ({ fieldKey, citations, index, state, nonce: (current?.nonce ?? 0) + 1 }));
    setTab("source");
  };

  // `[` and `]` cycle through the citations of the selected field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "[" && event.key !== "]") return;
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      setSelection((current) => {
        if (!current || current.citations.length < 2) return current;
        const step = event.key === "]" ? 1 : -1;
        const index = (current.index + step + current.citations.length) % current.citations.length;
        return { ...current, index, nonce: current.nonce + 1 };
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const backToField = () => {
    setTab("fields");
    if (selection) {
      const chip = chipId(selection.fieldKey, selection.index);
      window.requestAnimationFrame(() => document.getElementById(chip)?.focus());
    }
  };

  const onTabKey = (event: ReactKeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const next = tab === "fields" ? "source" : "fields";
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <div className="inspector" data-tab={tab}>
      <div className="inspector-tabs" role="tablist" aria-label="Workspace view">
        {TABS.map((item) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            type="button"
            role="tab"
            className="segment"
            aria-selected={tab === item.id}
            aria-controls={`pane-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={onTabKey}
          >
            {item.label}
          </button>
        ))}
      </div>
      <SourcePanel
        id="pane-source"
        className="inspector-pane pane-source"
        documents={props.documents}
        selection={selection}
        onBack={backToField}
      />
      <div id="pane-fields" className="workspace-side inspector-pane pane-fields">
        {props.before}
        <FieldsPanel revision={props.revision} selection={selection} onSelect={select} />
        {props.after}
      </div>
    </div>
  );
}
