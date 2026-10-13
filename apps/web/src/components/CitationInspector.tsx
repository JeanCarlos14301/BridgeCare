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
const WIDE_QUERY = "(min-width: 1024px)";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/** Plain Ctrl or Alt chords are left to the browser; Ctrl+Alt is AltGr on Windows layouts. */
function isShortcutChord(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey !== event.altKey;
}

function useIsWide() {
  const query = () => typeof window.matchMedia === "function" && window.matchMedia(WIDE_QUERY).matches;
  const [wide, setWide] = useState(query);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return wide;
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
  const wide = useIsWide();

  const select: SelectField = (fieldKey, citations, index, state) => {
    setSelection((current) => ({ fieldKey, citations, index, state, nonce: (current?.nonce ?? 0) + 1 }));
    setTab("source");
  };

  // `[` and `]` cycle through the citations of the selected field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "[" && event.key !== "]") return;
      if (isShortcutChord(event) || isTypingTarget(event.target) || document.querySelector("dialog[open]")) return;
      setSelection((current) => {
        if (!current || current.citations.length < 2) return current;
        const step = event.key === "]" ? 1 : -1;
        const index = (current.index + step + current.citations.length) % current.citations.length;
        return { ...current, index, nonce: current.nonce + 1 };
      });
      setTab("source");
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
    const keys: Record<string, Tab> = {
      ArrowLeft: tab === "fields" ? "source" : "fields",
      ArrowRight: tab === "fields" ? "source" : "fields",
      Home: "fields",
      End: "source",
    };
    const next = keys[event.key];
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  // Tab semantics only exist while the tabs are shown; on wide screens both panes are regions.
  const paneProps = (id: Tab) =>
    wide ? {} : { role: "tabpanel", "aria-labelledby": `tab-${id}`, hidden: tab !== id };

  return (
    <div className="inspector">
      {!wide && (
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
      )}
      <SourcePanel
        id="pane-source"
        className="inspector-pane pane-source"
        documents={props.documents}
        selection={selection}
        onBack={backToField}
        {...paneProps("source")}
      />
      <div id="pane-fields" className="workspace-side inspector-pane pane-fields" {...paneProps("fields")}>
        {props.before}
        <FieldsPanel revision={props.revision} selection={selection} onSelect={select} />
        {props.after}
      </div>
    </div>
  );
}
