import { useEffect, useState } from "react";

type ProviderMode = "mock" | "openai_compatible";

type Health = {
  status: "ok";
  provider_mode: ProviderMode;
};

type Ready = {
  status: "ready" | "not_ready";
  provider_mode: ProviderMode;
  detail: string;
};

type ViewState = {
  health?: Health;
  ready?: Ready;
  error?: string;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const data = (await response.json()) as T;
  if (!response.ok && response.status !== 503) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return data;
}

export default function App() {
  const [state, setState] = useState<ViewState>({});

  useEffect(() => {
    Promise.all([getJson<Health>("/api/health"), getJson<Ready>("/api/ready")])
      .then(([health, ready]) => setState({ health, ready }))
      .catch(() => setState({ error: "The API status could not be loaded." }));
  }, []);

  const providerMode = state.ready?.provider_mode ?? state.health?.provider_mode;

  return (
    <main>
      <section className="status-card" aria-labelledby="status-title">
        <p className="eyebrow">carepath-bridge</p>
        <div className="title-row">
          <h1 id="status-title">Development status</h1>
          {providerMode === "mock" && <span className="badge">MOCK</span>}
        </div>
        <p className="intro">
          Phase A provides local infrastructure only. No health workflow is active.
        </p>

        {state.error ? (
          <p className="error" role="alert">{state.error}</p>
        ) : (
          <dl className="status-grid" aria-live="polite">
            <div>
              <dt>API</dt>
              <dd>{state.health ? "Online" : "Checking…"}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{providerMode ?? "Checking…"}</dd>
            </div>
            <div>
              <dt>Readiness</dt>
              <dd>{state.ready?.status ?? "Checking…"}</dd>
            </div>
          </dl>
        )}
        {state.ready && <p className="detail">{state.ready.detail}</p>}
      </section>
    </main>
  );
}

