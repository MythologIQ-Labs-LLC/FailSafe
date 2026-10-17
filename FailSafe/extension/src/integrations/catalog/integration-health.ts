// integration-health — evidence-backed status for the Integrations catalog
// (#479). The catalog used to infer health from configuration alone; this
// module records the result of the last real call each adapter made, so a card
// can say "Verified", "Failing" or "Stale" only from what actually happened.
//
// SECRET SAFETY (hard constraint): only closed vocabularies are stored — a known
// integration id, a result, a failure category and an ISO time. No provider
// text, error message or token can enter the store, by construction: the
// sanitizer drops anything else on both write and read.
//
// Storage is a Memento (VS Code workspaceState in production), which belongs to
// the extension, not to the workspace folder, so a cloned repository cannot ship
// forged "verified" evidence.

export const INTEGRATION_IDS = [
  'continue', 'aider', 'openhands', 'agent-audit', 'linear', 'jira',
  'github-checks', 'sarif', 'sentry', 'teams', 'slack',
] as const;
export type IntegrationId = typeof INTEGRATION_IDS[number];

export const HEALTH_RESULTS = ['contract-verified', 'connected', 'failing'] as const;
export type HealthResult = typeof HEALTH_RESULTS[number];

export const FAILURE_CATEGORIES = [
  'auth', 'rate_limited', 'network', 'not_found', 'http', 'contract',
  'unsupported_version', 'not_installed', 'storage', 'refused', 'config',
] as const;
export type FailureCategory = typeof FAILURE_CATEGORIES[number];

export interface HealthEvidence {
  result: HealthResult;
  category?: FailureCategory;
  checkedAt: string;
}

/**
 * What an adapter's `healthFrom<Adapter>` returns: nothing (the attempt says
 * nothing about health — cancelled, dismissed, never started), a success
 * result, or `failing` with its category. Spread into `recordIntegrationHealth`.
 */
export type HealthMapping =
  | []
  | ['contract-verified']
  | ['connected']
  | ['failing', FailureCategory];

/** Evidence older than this is shown as stale. */
export const HEALTH_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** workspaceState key of the evidence snapshot. */
export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';

export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isId(v: unknown): v is IntegrationId {
  return typeof v === 'string' && (INTEGRATION_IDS as readonly string[]).includes(v);
}

/** Rebuild one evidence record from closed sets, or undefined when any part is out of set. */
export function sanitizeEvidence(raw: unknown): HealthEvidence | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.result !== 'string' || !(HEALTH_RESULTS as readonly string[]).includes(r.result)) return undefined;
  if (typeof r.checkedAt !== 'string' || !ISO_RE.test(r.checkedAt) || Number.isNaN(Date.parse(r.checkedAt))) return undefined;
  const result = r.result as HealthResult;
  if (result === 'failing') {
    if (typeof r.category !== 'string' || !(FAILURE_CATEGORIES as readonly string[]).includes(r.category)) return undefined;
    return { result, category: r.category as FailureCategory, checkedAt: r.checkedAt };
  }
  return { result, checkedAt: r.checkedAt };
}

/** Sanitize a whole snapshot: unknown ids and malformed records are dropped. */
export function sanitizeSnapshot(raw: unknown): Record<string, HealthEvidence> {
  const out: Record<string, HealthEvidence> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isId(id)) continue;
    const ev = sanitizeEvidence(value);
    if (ev) out[id] = ev;
  }
  return out;
}

export class IntegrationHealthStore {
  constructor(
    private readonly memento: MementoLike,
    private readonly now: () => number = () => Date.now(),
  ) {}

  snapshot(): Record<string, HealthEvidence> {
    return sanitizeSnapshot(this.memento.get(HEALTH_STATE_KEY));
  }

  /** Record the result of one real attempt. An empty mapping records nothing. */
  record(id: string, ...mapping: HealthMapping): void {
    if (!isId(id) || mapping.length === 0) return;
    const [result, category] = mapping as [HealthResult, FailureCategory?];
    const ev = sanitizeEvidence({ result, category, checkedAt: new Date(this.now()).toISOString() });
    if (!ev) return;
    this.write({ ...this.snapshot(), [id]: ev });
  }

  /** Forget the evidence of these integrations (their configuration changed). */
  clear(ids: readonly string[]): void {
    const snap = this.snapshot();
    let changed = false;
    for (const id of ids) {
      if (snap[id]) { delete snap[id]; changed = true; }
    }
    if (changed) this.write(snap);
  }

  private write(snap: Record<string, HealthEvidence>): void {
    try {
      void Promise.resolve(this.memento.update(HEALTH_STATE_KEY, snap)).catch(() => undefined);
    } catch {
      // Evidence is advisory; a failing state write must never break an import.
    }
  }
}

let current: IntegrationHealthStore | null = null;

/** Install the store the commands and the catalog route use (null to unset). */
export function setIntegrationHealthStore(store: IntegrationHealthStore | null): void {
  current = store;
}

export function getIntegrationHealthStore(): IntegrationHealthStore | null {
  return current;
}

/** Record one attempt's result. A no-op until a store is installed. */
export function recordIntegrationHealth(id: string, ...mapping: HealthMapping): void {
  current?.record(id, ...mapping);
}

/** The current evidence snapshot ({} until a store is installed). */
export function integrationHealthSnapshot(): Record<string, HealthEvidence> {
  return current ? current.snapshot() : {};
}
