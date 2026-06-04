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

export type IntegrationCategory =
  | 'Agent CLI'
  | 'Agent Observe'
  | 'Issue Tracker'
  | 'CI / Checks'
  | 'Error Monitoring'
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
}

export type IntegrationConfigState = 'active' | 'needs-config' | 'disabled';

export interface IntegrationStatus {
  id: string;
  label: string;
  category: IntegrationCategory;
  summary: string;
  docsId: string;
  configHint: string;
  enabled: boolean;
  configured: boolean;
  /** Derived display state: active (on + configured) / needs-config (on + missing
   *  required keys) / disabled (off). */
  state: IntegrationConfigState;
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
    summary: 'Governed Continue CLI runs — writes pass through FailSafe enforcement before they touch disk.',
    enabledKey: 'failsafe.integrations.continue.enabled',
    requiredKeys: ['failsafe.integrations.continue.apiKey'],
    docsId: 'continue',
    configHint: 'Enable + set the Continue API key under Settings → Integrations → Continue.',
  },
  {
    id: 'aider',
    label: 'Aider',
    category: 'Agent CLI',
    summary: 'Governed Aider runs — edits/commits gated by FailSafe (allow-writes, allow-dirty, auto-commit toggles).',
    enabledKey: 'failsafe.integrations.aider.enabled',
    requiredKeys: [],
    docsId: 'aider',
    configHint: 'Enable under Settings → Integrations → Aider; uses your ambient model credentials.',
  },
  {
    id: 'openhands',
    label: 'OpenHands',
    category: 'Agent Observe',
    summary: 'Read-only OpenHands session observer — surfaces agent actions/observations into the governance timeline.',
    enabledKey: 'failsafe.integrations.openhands.enabled',
    requiredKeys: [],
    docsId: 'openhands',
    configHint: 'Enable under Settings → Integrations → OpenHands (observe-only; pin a version if needed).',
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
  },
  {
    id: 'linear',
    label: 'Linear',
    category: 'Issue Tracker',
    summary: 'Imports Linear issues as governed backlog items with traceable identifiers.',
    enabledKey: 'failsafe.integrations.linear.enabled',
    requiredKeys: ['failsafe.integrations.linear.apiKey'],
    docsId: 'linear',
    configHint: 'Enable + set the Linear API key under Settings → Integrations → Linear.',
  },
  {
    id: 'jira',
    label: 'Jira',
    category: 'Issue Tracker',
    summary: 'Imports Jira issues into the governed backlog with full key + status mapping.',
    enabledKey: 'failsafe.integrations.jira.enabled',
    requiredKeys: [
      'failsafe.integrations.jira.baseUrl',
      'failsafe.integrations.jira.email',
      'failsafe.integrations.jira.apiToken',
    ],
    docsId: 'jira',
    configHint: 'Enable + set base URL, email, and API token under Settings → Integrations → Jira.',
  },
  {
    id: 'github-checks',
    label: 'GitHub Checks',
    category: 'CI / Checks',
    summary: 'Publishes FailSafe governance verdicts as GitHub Check runs on commits/PRs.',
    enabledKey: 'failsafe.integrations.github.enabled',
    requiredKeys: ['failsafe.integrations.github.token'],
    docsId: 'github-checks',
    configHint: 'Enable + set a GitHub token (checks:write) under Settings → Integrations → GitHub.',
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
    configHint: 'Enable + set token, org, and project under Settings → Integrations → Sentry.',
  },
  {
    id: 'teams',
    label: 'Microsoft Teams',
    category: 'Notifications',
    summary: 'Posts governance notifications (verdicts, drift, releases) to a Teams channel.',
    enabledKey: 'failsafe.integrations.teams.enabled',
    requiredKeys: ['failsafe.integrations.teams.webhookUrl'],
    docsId: 'teams',
    configHint: 'Enable + set the Teams Incoming Webhook URL under Settings → Integrations → Teams.',
  },
  {
    id: 'slack',
    label: 'Slack',
    category: 'Notifications',
    summary: 'Posts governance notifications to a Slack channel via an Incoming Webhook.',
    enabledKey: 'failsafe.integrations.slack.enabled',
    requiredKeys: ['failsafe.integrations.slack.webhookUrl'],
    docsId: 'slack',
    configHint: 'Enable + set the Slack Incoming Webhook URL under Settings → Integrations → Slack.',
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
): IntegrationStatus {
  const enabled = snapshot[descriptor.enabledKey] === true;
  const missingKeys = descriptor.requiredKeys.filter((k) => snapshot[k] !== true);
  const configured = enabled && missingKeys.length === 0;
  const state: IntegrationConfigState = !enabled
    ? 'disabled'
    : configured
      ? 'active'
      : 'needs-config';
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
    missingKeys,
  };
}

/** Build the full catalog status list from a boolean-only snapshot. */
export function buildIntegrationCatalog(
  snapshot: Readonly<Record<string, boolean>>,
  catalog: readonly IntegrationDescriptor[] = INTEGRATION_CATALOG,
): IntegrationStatus[] {
  return catalog.map((d) => buildIntegrationStatus(d, snapshot));
}
