import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import type { Revision, SourceDocument } from "../api";
import { attentionKeys, listFields } from "../lib/caseStats";
import { type FieldFilter, FieldsPanel } from "./FieldsPanel";
import { GatePanel } from "./GatePanel";
import { chipId, type SelectField, type Selection } from "./selection";
import { SourcePanel } from "./SourcePanel";

type Tab = "source" | "fields" | "review";
const TABS: { id: Tab; label: string }[] = [
  { id: "source", label: "Source" },
  { id: "fields", label: "Fields" },
  { id: "review", label: "Review" },
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

function fieldCard(fieldKey: string) {
  const cards = document.querySelectorAll<HTMLElement>("[data-field-key]");
  return [...cards].find((card) => card.dataset.fieldKey === fieldKey) ?? null;
}

/**
 * Review workspace: source pages, extracted fields, and a review rail (overview, gate, decision,
 * patient sheet) side by side on desktop, or three tabs below 1024 px. Fields, chips, gate reasons,
 * and the citation map all link both ways.
 */
export function CitationInspector(props: {
  documents: SourceDocument[];
  revision: Revision;
  approved?: boolean;
  decision?: ReactNode;
  after?: ReactNode;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<Tab>("fields");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const wide = useIsWide();
  const fields = useMemo(() => listFields(props.revision), [props.revision]);
  const attention = useMemo(() => attentionKeys(fields, props.revision.gate), [fields, props.revision.gate]);
  // Open on what needs a decision; when nothing does, show everything.
  const [filter, setFilter] = useState<FieldFilter>(() => (attention.size ? "attention" : "all"));
  const ensureVisible = (fieldKey: string) => {
    if (!attention.has(fieldKey)) setFilter("all");
  };

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const select: SelectField = (fieldKey, citations, index, state) => {
    setSelection((current) => ({ fieldKey, citations, index, state, nonce: (current?.nonce ?? 0) + 1 }));
    setTab("source");
  };

  /** Bring a field card into view and flash it, without leaving the pane the reviewer is in. */
  const showField = (fieldKey: string, focus: boolean) => {
    window.clearTimeout(flashTimer.current);
    setFlashKey(fieldKey);
    flashTimer.current = window.setTimeout(() => setFlashKey(null), 1200);
    window.requestAnimationFrame(() => {
      const card = fieldCard(fieldKey);
      if (!card) return;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (typeof card.scrollIntoView === "function") {
        card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      }
      if (focus) card.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });
  };

  const selectQuietly = (fieldKey: string, index: number) => {
    const field = fields.find((candidate) => candidate.key === fieldKey);
    ensureVisible(fieldKey);
    if (!field?.citations[index]) return;
    setSelection((current) => ({
      fieldKey,
      citations: field.citations,
      index,
      state: field.state,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  };

  // From the gate: select the field's first quote and move to the field itself.
  const goToField = (fieldKey: string) => {
    selectQuietly(fieldKey, 0);
    setTab("fields");
    showField(fieldKey, true);
  };

  // From the citation map: select that quote and, on wide screens, reveal its field card.
  const pickTrace = (fieldKey: string, index: number) => {
    selectQuietly(fieldKey, index);
    if (wide) showField(fieldKey, false);
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
    const position = TABS.findIndex((item) => item.id === tab);
    const keys: Record<string, Tab> = {
      ArrowLeft: TABS[(position + TABS.length - 1) % TABS.length].id,
      ArrowRight: TABS[(position + 1) % TABS.length].id,
      Home: TABS[0].id,
      End: TABS[TABS.length - 1].id,
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
  const labelOf = (fieldKey: string) => fields.find((field) => field.key === fieldKey)?.label ?? null;

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
        fields={fields}
        onBack={backToField}
        onPickTrace={pickTrace}
        {...paneProps("source")}
      />
      <div id="pane-fields" className="inspector-pane pane-fields" {...paneProps("fields")}>
        <FieldsPanel
          revision={props.revision}
          selection={selection}
          flashKey={flashKey}
          attention={attention}
          filter={filter}
          onFilterChange={setFilter}
          onSelect={select}
        />
      </div>
      <div id="pane-review" className="inspector-pane pane-review" {...paneProps("review")}>
        <div className="card review-card">
          <GatePanel
            gate={props.revision.gate}
            approved={props.approved}
            fieldLabel={labelOf}
            onGoToField={goToField}
          />
          {props.decision}
        </div>
        {props.after}
      </div>
    </div>
  );
}
