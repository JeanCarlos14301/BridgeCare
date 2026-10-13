import { useEffect, useState } from "react";

import {
  api,
  type CaseView,
  type Citation,
  type Fixture,
  isConflict,
  postJson,
  type ProviderMode,
  type Role,
} from "./api";
import { AppShell } from "./components/AppShell";
import { CaseHeader } from "./components/CaseHeader";
import { FieldsPanel } from "./components/FieldsPanel";
import { FixturePicker } from "./components/FixturePicker";
import { GatePanel } from "./components/GatePanel";
import { LoginDialog } from "./components/LoginDialog";
import { PatientSheet } from "./components/PatientSheet";
import { ProviderPill } from "./components/ProviderPill";
import { ReviewBar } from "./components/ReviewBar";
import { SourcePanel } from "./components/SourcePanel";

type Session = { role: Role };

export default function App() {
  const [providerMode, setProviderMode] = useState<ProviderMode | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [selected, setSelected] = useState<Citation | null>(null);
  const [role, setRole] = useState<Role>("visitor");
  const [resolutionNote, setResolutionNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The MOCK badge must be visible before any case is processed (B-12.1).
    api<{ provider_mode: ProviderMode }>("/health")
      .then((health) => setProviderMode(health.provider_mode))
      .catch(() => setProviderMode(null));
    // The fixture list needs the session cookie, so it waits for the session to exist.
    api<Session>("/session", { method: "POST" })
      .then(async (session) => {
        setRole(session.role);
        setFixtures(await api<Fixture[]>("/fixtures"));
      })
      .catch(() => setMessage("The session or fixture list could not be loaded."));
  }, []);

  const createAndProcess = async (fixtureId: string) => {
    setBusy(true);
    setMessage("Processing case…");
    try {
      const created = await postJson<CaseView>("/cases/from-fixture", { fixture_id: fixtureId });
      const processed = await api<CaseView>(`/cases/${created.case_id}/process`, { method: "POST" });
      setCaseView(processed);
      setSelected(null);
      setResolutionNote("");
      setMessage(null);
    } catch (error) {
      setMessage(isConflict(error) ? "This case is already processing." : "The case could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  const login = async (password: string) => {
    try {
      const session = await postJson<Session>("/session/login", { password });
      setRole(session.role);
      setMessage(null);
      return true;
    } catch {
      return false;
    }
  };

  const logout = async () => {
    try {
      await api<void>("/session/logout", { method: "POST" });
    } finally {
      // Clear the case view on logout so the next person does not see it (B-12.6).
      setRole("visitor");
      setCaseView(null);
      setSelected(null);
      setResolutionNote("");
      setMessage("Logged out.");
    }
  };

  const review = async (decision: "approve" | "reject") => {
    const revision = caseView?.revision;
    if (!caseView || !revision) return;
    const { gate } = revision;
    const noteMissing = gate.requires_resolution_note && resolutionNote.trim().length < 10;
    if (decision === "approve" && (!gate.approvable || noteMissing)) {
      setMessage(
        gate.requires_resolution_note
          ? "A resolution note of at least 10 characters is required."
          : "Approval is blocked by the current gate.",
      );
      return;
    }
    setBusy(true);
    try {
      const updated = await postJson<CaseView>(`/cases/${caseView.case_id}/review`, {
        revision_id: revision.revision_id,
        content_hash: revision.content_hash,
        decision,
        resolution_note: resolutionNote || null,
      });
      setCaseView(updated);
      setMessage(decision === "approve" ? "Revision approved." : "Revision rejected.");
    } catch (error) {
      setMessage(
        isConflict(error)
          ? "Review conflict: this revision is stale or blocked. Reload and review the current revision."
          : "The review could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const revision = caseView?.revision ?? null;
  const session =
    role === "reviewer" ? (
      <>
        <span className="pill pill-role">Reviewer</span>
        <button type="button" className="button button-sm" onClick={logout}>
          Log out
        </button>
      </>
    ) : (
      <LoginDialog onLogin={login} />
    );

  return (
    <AppShell status={<ProviderPill mode={providerMode} revision={revision} />} session={session}>
      <section className="case-strip" aria-labelledby="strip-title">
        <p className="eyebrow">Synthetic discharge documents</p>
        <h1 id="strip-title">
          Review. Verify. <span className="brand-text">Approve.</span>
        </h1>
        <p className="lede">
          Pick a fixture. Every extracted value links to its quote in the source, and only a reviewer can approve.
        </p>
        <FixturePicker
          fixtures={fixtures}
          activeId={caseView?.fixture_id ?? null}
          busy={busy}
          onPick={createAndProcess}
        />
        {caseView && <CaseHeader caseView={caseView} />}
      </section>

      <div className="live-region" role="status" aria-live="polite">
        {message && <p className="notice">{message}</p>}
      </div>

      {caseView &&
        (revision ? (
          <div className="workspace">
            <SourcePanel documents={caseView.source_documents} selected={selected} />
            <div className="workspace-side">
              <GatePanel gate={revision.gate} />
              <FieldsPanel revision={revision} selected={selected} onSelect={setSelected} />
              <ReviewBar
                role={role}
                revision={revision}
                review={caseView.review}
                note={resolutionNote}
                onNoteChange={setResolutionNote}
                onDecide={review}
                busy={busy}
              />
              <PatientSheet key={`${revision.revision_id}-${caseView.status}`} caseId={caseView.case_id} />
            </div>
          </div>
        ) : (
          <p className="alert">Processing did not produce a reviewable revision.</p>
        ))}
    </AppShell>
  );
}
