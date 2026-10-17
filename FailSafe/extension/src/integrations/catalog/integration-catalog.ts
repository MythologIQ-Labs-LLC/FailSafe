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

/**
 * The catalog. Ordered by category for a stable, grouped render. Only
 * integrations WITHOUT a dedicated sub-view appear here; Bicameral, Open
 * Design, MCP Catalog, and AGT are intentionally excluded (they have richer
 * first-class surfaces). Slack is included alongside Teams — it is a shipped,
 * previously-unsurfaced config integration with the identical shape, so omitting
 * it would re-create the very gap #167 closes.
 */
export const INTEGRATION_CATALOG: readonly IntegrationDescriptor[] = [
  {
    id: 'continue',
    label: 'Continue',
    category: 'Agent CLI',
    summary: 'Continue CLI run in a disposable git worktree; its changes reach the workspace only when you apply them. Not a process sandbox: direct writes to the repository are detected, not prevented, and writes outside it are not detected.',
    enabledKey: 'failsafe.integrations.continue.enabled',
    // The API key is optional: Continue can use its own login (#482).
    requiredKeys: [],
    docsId: 'continue',
    configHint: 'Enable under Settings → Integrations → Continue. An API key is optional; store one with "FailSafe: Set Integration Credential".',
    capabilities: ['isolated-run'],
    evidenceKind: 'process',
  },
  {
    id: 'aider',
    label: 'Aider',
    category: 'Agent CLI',
    summary: 'Aider CLI run in a disposable git worktree with auto-commit off; its changes reach the workspace only when you apply them. Not a process sandbox: direct writes to the repository are detected, not prevented, and writes outside it are not detected.',
    enabledKey: 'failsafe.integrations.aider.enabled',
    requiredKeys: [],
    docsId: 'aider',
    configHint: 'Enable under Settings → Integrations → Aider; uses your ambient model credentials.',
    capabilities: ['isolated-run'],
    evidenceKind: 'process',
  },
  {
    id: 'openhands',
    label: 'OpenHands',
    category: 'Agent Observe',
    summary: 'Imports an exported OpenHands run, after you confirm, as historical timeline evidence (deduplicated). Observe-only: not live interception.',
    enabledKey: 'failsafe.integrations.openhands.enabled',
    requiredKeys: [],
    docsId: 'openhands',
    configHint: 'Enable under Settings → Integrations → OpenHands (observe-only; pin a version if needed).',
    capabilities: ['timeline-evidence'],
    evidenceKind: 'file',
  },
  {
    id: 'agent-audit',
    label: 'Cline / Roo / Kilo',
    category: 'Agent Observe',
    summary: 'Read-only MCP & tool-policy auditor for Cline/Roo/Kilo — flags auto-approve and unscoped tool grants.',
    enabledKey: 'failsafe.integrations.agentAudit.enabled',
    requiredKeys: [],
    docsId: 'agent-observe',
    configHint: 'Enable under Settings → Integrations → Agent Audit (reads the agent MCP config, no writes).',
    capabilities: ['policy-audit', 'risk-ingest'],
    evidenceKind: 'file',
  },
  {
    id: 'linear',
    label: 'Linear',
    category: 'Issue Tracker',
    summary: 'Fetches one Linear issue for review; creates a governed intent draft only when you approve. No sync.',
    enabledKey: 'failsafe.integrations.linear.enabled',
    requiredKeys: ['failsafe.integrations.linear.apiKey'],
    docsId: 'linear',
    configHint: 'Enable under Settings → Integrations → Linear, then store the Linear API key with "FailSafe: Set Integration Credential".',
    capabilities: ['issue-preview', 'intent-draft'],
    evidenceKind: 'service',
  },
  {
    id: 'jira',
    label: 'Jira',
    category: 'Issue Tracker',
    summary: 'Fetches one Jira issue for review; creates a governed intent draft only when you approve. No sync.',
    enabledKey: 'failsafe.integrations.jira.enabled',
    requiredKeys: [
      'failsafe.integrations.jira.baseUrl',
      'failsafe.integrations.jira.email',
      'failsafe.integrations.jira.apiToken',
    ],
    docsId: 'jira',
    configHint: 'Enable and set base URL and email under Settings → Integrations → Jira, then store the API token with "FailSafe: Set Integration Credential".',
    capabilities: ['issue-preview', 'intent-draft'],
    evidenceKind: 'service',
  },
  {
    id: 'github-checks',
    label: 'GitHub Checks',
    category: 'CI / Checks',
    summary: 'Publishes neutral operator advisories only; verified SHIELD PASS is disabled pending native attestation.',
    enabledKey: 'failsafe.integrations.github.enabled',
    requiredKeys: ['failsafe.integrations.github.token'],
    docsId: 'github-checks',
    configHint: 'Enable under Settings → Integrations → GitHub, then store a token (checks:write) with "FailSafe: Set Integration Credential".',
    capabilities: ['check-publish'],
    evidenceKind: 'service',
  },
  {
    id: 'sarif',
    label: 'SARIF Import',
    category: 'Security Scanning',
    summary: 'Imports SARIF 2.1.0 scanner output (Semgrep, CodeQL, ...) as governed risk records. Fully offline.',
    enabledKey: 'failsafe.integrations.sarif.enabled',
    requiredKeys: [],
    docsId: 'sarif',
    configHint: 'Enable, then run `FailSafe: Import SARIF Findings` and pick a .sarif/.json file.',
    capabilities: ['risk-ingest'],
    evidenceKind: 'file',
  },
  {
    id: 'sentry',
    label: 'Sentry',
    category: 'Error Monitoring',
    summary: 'Pulls Sentry issues into the risk register so production errors inform governance.',
    enabledKey: 'failsafe.integrations.sentry.enabled',
    requiredKeys: [
      'failsafe.integrations.sentry.token',
      'failsafe.integrations.sentry.org',
      'failsafe.integrations.sentry.project',
    ],
    docsId: 'sentry',
    configHint: 'Enable and set org and project under Settings → Integrations → Sentry, then store the auth token with "FailSafe: Set Integration Credential".',
    capabilities: ['risk-ingest'],
    evidenceKind: 'service',
  },
  {
    id: 'teams',
    label: 'Microsoft Teams',
    category: 'Notifications',
    summary: 'Posts governance notifications (verdicts, drift, releases) to a Teams channel.',
    enabledKey: 'failsafe.integrations.teams.enabled',
    requiredKeys: ['failsafe.integrations.teams.webhookUrl'],
    docsId: 'teams',
    configHint: 'Enable under Settings → Integrations → Teams, then store the Incoming Webhook URL with "FailSafe: Set Integration Credential".',
    capabilities: ['notify'],
    evidenceKind: 'service',
  },
  {
    id: 'slack',
    label: 'Slack',
    category: 'Notifications',
    summary: 'Posts governance notifications to a Slack channel via an Incoming Webhook.',
    enabledKey: 'failsafe.integrations.slack.enabled',
    requiredKeys: ['failsafe.integrations.slack.webhookUrl'],
    docsId: 'slack',
    configHint: 'Enable under Settings → Integrations → Slack, then store the Incoming Webhook URL with "FailSafe: Set Integration Credential".',
    capabilities: ['notify'],
    evidenceKind: 'service',
  },
];

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
  const enabled = snapshot[descriptor.enabledKey] === true;
  const missingKeys = descriptor.requiredKeys.filter((k) => snapshot[k] !== true);
  const configured = enabled && missingKeys.length === 0;
  const lastResult = sanitizeEvidence(health[descriptor.id]);
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
