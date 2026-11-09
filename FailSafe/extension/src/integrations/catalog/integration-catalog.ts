// integration-catalog — pure, secret-safe registry of the command/config-style
// FailSafe integrations that do NOT own a dedicated Integrations-tab sub-view
// (Bicameral / Open Design / MCP Catalog / AGT already do). GH #167: these
// nine+ integrations shipped wired in v5.5.0 but had no home in the UI, so the
// operator could not see which were enabled/configured. This catalog is the
// single source of truth the Integrations-tab "Catalog" sub-view renders from,
// keeping README / INTEGRATION_DOCS_INDEX / the tab in sync.
//
// SECRET SAFETY (hard constraint): this module never reads or returns a secret
// value. The host supplies a boolean-only snapshot (`enabledKey` → actual flag;
// each `requiredKey` → whether that setting is non-empty). Tokens, API keys, and
// webhook URLs never leave the extension host — only the booleans derived from
// them. Pure (no vscode/fs/network) so it is unit-tested deterministically.
//
// #479: configuration alone never makes a card look healthy. A configured
// integration stays `configured-unverified` until a real call records health
// evidence (integration-health.ts); only that evidence can make it `connected`,
// `contract-verified`, `failing` or `stale`.

import { AGENT_OS_CONTAINMENT_AVAILABLE } from '../agent-cli/agent-containment';
import { INTEGRATION_CATALOG } from './integration-catalog-data';
import { HEALTH_STALE_MS, sanitizeEvidence, type HealthEvidence } from './integration-health';

export type IntegrationCategory =
  | 'Agent CLI'
  | 'Agent Observe'
  | 'Issue Tracker'
  | 'CI / Checks'
  | 'Error Monitoring'
  | 'Security Scanning'
  | 'Notifications';

export interface IntegrationDescriptor {
  /** Stable id — used as the card key + docs anchor. */
  id: string;
  /** Human label shown on the card. */
  label: string;
  category: IntegrationCategory;
  /** One-line value statement (what governance signal it adds). */
  summary: string;
  /** `failsafe.*` boolean setting that turns the integration on. */
  enabledKey: string;
  /**
   * `failsafe.*` settings that must be non-empty for the integration to be
   * usable (secrets + required endpoints). Empty array → "configured" tracks
   * "enabled" (no extra config needed beyond the toggle).
   */
  requiredKeys: string[];
  /** Anchor in the per-integration README / INTEGRATION_DOCS_INDEX. */
  docsId: string;
  /** Settings-tab hint: what the operator edits to configure this. */
  configHint: string;
  /** What this adapter claims to do (#474); the conformance suite holds it to each claim. */
  capabilities: readonly IntegrationCapability[];
  /** How its evidence reads: a remote service, an imported file or a local process. */
  evidenceKind: EvidenceKind;
}

/** Closed capability vocabulary (#474). */
export type IntegrationCapability =
  | 'issue-preview' | 'intent-draft' | 'timeline-evidence' | 'policy-audit'
  | 'risk-ingest' | 'check-publish' | 'notify' | 'isolated-run';

export type EvidenceKind = 'service' | 'file' | 'process';

export type IntegrationConfigState =
  | 'disabled' | 'needs-config' | 'configured-unverified'
  | 'connected' | 'contract-verified' | 'failing' | 'stale';

export interface IntegrationStatus {
  id: string;
  label: string;
  category: IntegrationCategory;
  summary: string;
  docsId: string;
  configHint: string;
  enabled: boolean;
  configured: boolean;
  /** disabled / needs-config come from configuration and win; with configuration
   *  complete, the last recorded evidence decides (none → configured-unverified,
   *  older than HEALTH_STALE_MS → stale). */
  state: IntegrationConfigState;
  /** The last real call's result, when one was recorded. */
  lastResult?: HealthEvidence;
  capabilities: readonly IntegrationCapability[];
  evidenceKind: EvidenceKind;
  /** The required keys that are still empty — names only, never values. Lets the
   *  card tell the operator exactly what is missing without leaking secrets. */
  missingKeys: string[];
}

// The descriptor table lives in integration-catalog-data.ts (Section 4 file cap).
export { INTEGRATION_CATALOG } from './integration-catalog-data';

/**
 * Every `failsafe.*` setting key this catalog depends on (enabled flags +
 * required keys), de-duplicated. The host uses this to build the boolean-only
 * snapshot — it asks vscode config for exactly these keys and emits whether each
 * is on / non-empty, so the catalog never sees a secret value.
 */
export function catalogConfigKeys(
  catalog: readonly IntegrationDescriptor[] = INTEGRATION_CATALOG,
): string[] {
  const keys = new Set<string>();
  for (const d of catalog) {
    keys.add(d.enabledKey);
    for (const k of d.requiredKeys) keys.add(k);
  }
  return [...keys];
}

/**
 * Build the operator-facing status for one descriptor from a boolean-only
 * config snapshot. `snapshot[key]` is `true` when that setting is on (enabled
 * key) or non-empty (required key). Missing keys are treated as `false`.
 * Never reads or returns a secret value.
 */
export function buildIntegrationStatus(
  descriptor: IntegrationDescriptor,
  snapshot: Readonly<Record<string, boolean>>,
  health: Readonly<Record<string, unknown>> = {},
  now: number = Date.now(),
): IntegrationStatus {
  // #475: a legacy successful CLI receipt must not resurrect an integration
  // whose OS boundary is absent, even when its settings still say enabled.
  const containmentBlocked = !AGENT_OS_CONTAINMENT_AVAILABLE && (descriptor.id === 'aider' || descriptor.id === 'continue');
  const enabled = !containmentBlocked && snapshot[descriptor.enabledKey] === true;
  const missingKeys = descriptor.requiredKeys.filter((k) => snapshot[k] !== true);
  const configured = enabled && missingKeys.length === 0;
  const lastResult = containmentBlocked ? undefined : sanitizeEvidence(health[descriptor.id]);
  const state: IntegrationConfigState = !enabled
    ? 'disabled'
    : !configured
      ? 'needs-config'
      : !lastResult
        ? 'configured-unverified'
        : now - Date.parse(lastResult.checkedAt) > HEALTH_STALE_MS
          ? 'stale'
          : lastResult.result;
  return {
    id: descriptor.id,
    label: descriptor.label,
    category: descriptor.category,
    summary: descriptor.summary,
    docsId: descriptor.docsId,
    configHint: descriptor.configHint,
    enabled,
    configured,
    state,
    ...(lastResult ? { lastResult } : {}),
    missingKeys,
    capabilities: descriptor.capabilities,
    evidenceKind: descriptor.evidenceKind,
  };
}

/** Build the full catalog status list from a boolean-only snapshot. */
export function buildIntegrationCatalog(
  snapshot: Readonly<Record<string, boolean>>,
  catalog: readonly IntegrationDescriptor[] = INTEGRATION_CATALOG,
  health: Readonly<Record<string, unknown>> = {},
  now: number = Date.now(),
): IntegrationStatus[] {
  return catalog.map((d) => buildIntegrationStatus(d, snapshot, health, now));
}
