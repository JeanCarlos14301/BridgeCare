import type { components } from "../../../packages/contracts/openapi";

type Schemas = components["schemas"];

export type CaseView = Schemas["CaseView"];
export type Revision = NonNullable<CaseView["revision"]>;
export type Citation = Schemas["Citation"];
export type BlockingReason = Schemas["BlockingReason"];
export type EvidenceState = Schemas["Medication"]["evidence_state"];
export type Fixture = Schemas["FixtureSummary"];
export type CaseSummary = Schemas["CaseSummary"];
export type Gate = Schemas["Gate"];
export type PatientView = Schemas["PatientView"];
export type ProviderMode = Schemas["HealthResponse"]["provider_mode"];
export type SourceDocument = Schemas["SourceDocument"];
export type Role = "visitor" | "reviewer";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Health = Schemas["HealthResponse"];

export async function api<T>(path: string, init?: RequestInit, onHeaders?: (headers: Headers) => void): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: "same-origin", ...init });
  onHeaders?.(response.headers);
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** The server's `detail` text for a domain error (e.g. a 429 quota message), if it sent one. */
export function errorDetail(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  try {
    const body: unknown = JSON.parse(error.message);
    if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") return body.detail;
  } catch {
    // Not JSON; fall through.
  }
  return null;
}
