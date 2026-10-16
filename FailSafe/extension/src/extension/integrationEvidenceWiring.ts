/**
 * integrationEvidenceWiring — one activation step for the v6.0.8 integration
 * evidence (#479, #480, #477): installs the health-evidence store over
 * workspaceState and clears an integration's evidence when its settings or its
 * stored credential change, so a card never keeps "Verified" for a
 * configuration it was not observed under.
 */

import * as vscode from 'vscode';
import { INTEGRATION_CATALOG } from '../integrations/catalog/integration-catalog';
import { IntegrationHealthStore, setIntegrationHealthStore } from '../integrations/catalog/integration-health';
import { CREDENTIALS, secretKey } from '../integrations/credentials/credentialRegistry';
import { workspaceIdentity } from '../integrations/credentials/vscodeCredentialAdapters';
import type { IntentService } from '../governance/IntentService';
import type { PlanManager } from '../qorelogic/planning/PlanManager';
import type { AgentTimelineService } from '../sentinel/AgentTimelineService';
import { setTrackerIntentDeps } from '../integrations/tracker-import/tracker-intent-import';
import { pickPlanIdForEnforce } from './commands';
import { EvidenceKeyHolder, setOpenHandsEvidenceKeys } from '../integrations/agent-observe/openhands-signing';
import { OpenHandsEvidenceReader } from '../integrations/agent-observe/openhands-evidence';

/** `failsafe.integrations.jira.enabled` → `failsafe.integrations.jira`. */
function sectionOf(settingKey: string): string {
  return settingKey.slice(0, settingKey.lastIndexOf('.'));
}

/** Catalog ids per settings section (each catalog entry's enabled key names its section). */
function idsBySection(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const d of INTEGRATION_CATALOG) {
    const section = sectionOf(d.enabledKey);
    map.set(section, [...(map.get(section) ?? []), d.id]);
  }
  return map;
}

export interface HealthClearingDeps {
  onDidChangeConfiguration: vscode.Event<vscode.ConfigurationChangeEvent>;
  onDidChangeSecrets: vscode.Event<vscode.SecretStorageChangeEvent>;
  workspaceIdentity: () => string | undefined;
}

/** Clear evidence on a settings or credential change for that integration. */
export function wireHealthClearing(store: IntegrationHealthStore, deps: HealthClearingDeps): vscode.Disposable[] {
  const sections = idsBySection();
  return [
    deps.onDidChangeConfiguration((e) => {
      const ids: string[] = [];
      for (const [section, sectionIds] of sections) {
        if (e.affectsConfiguration(section)) ids.push(...sectionIds);
      }
      if (ids.length) store.clear(ids);
    }),
    deps.onDidChangeSecrets((e) => {
      for (const c of CREDENTIALS) {
        const keys = [secretKey(c.id, 'user', undefined), secretKey(c.id, 'workspace', deps.workspaceIdentity())];
        if (keys.includes(e.key)) store.clear(sections.get(sectionOf(c.settingKey)) ?? []);
      }
    }),
  ];
}

export interface IntegrationEvidenceDeps {
  intentService: IntentService;
  planManager: PlanManager | undefined;
  timeline: AgentTimelineService;
}

export function wireIntegrationEvidence(context: vscode.ExtensionContext, deps: IntegrationEvidenceDeps): void {
  const store = new IntegrationHealthStore(context.workspaceState);
  setIntegrationHealthStore(store);
  context.subscriptions.push(
    { dispose: () => setIntegrationHealthStore(null) },
    ...wireHealthClearing(store, {
      onDidChangeConfiguration: vscode.workspace.onDidChangeConfiguration,
      onDidChangeSecrets: context.secrets.onDidChange,
      workspaceIdentity,
    }),
  );

  // #480: the Jira/Linear commands create intent drafts through the canonical
  // IntentService; until this runs they stay preview-only.
  setTrackerIntentDeps({
    intents: deps.intentService,
    governanceMode: () => vscode.workspace.getConfiguration('failsafe').get<string>('governance.mode', 'enforce'),
    pickPlanId: () => pickPlanIdForEnforce(deps.planManager),
  });
  context.subscriptions.push({ dispose: () => setTrackerIntentDeps(null) });

  // #477: the OpenHands evidence key (read only at activation; created by the
  // first import) and the timeline provider for imported evidence. The degraded
  // Sentinel stub has no provider slot, so imported entries are not shown there.
  const keys = new EvidenceKeyHolder(context.secrets);
  setOpenHandsEvidenceKeys(keys);
  void keys.loadKey();
  const reader = new OpenHandsEvidenceReader(keys, () =>
    (vscode.workspace.workspaceFolders ?? []).map((f) => ({ fsPath: f.uri.fsPath, name: f.name })));
  const timeline = deps.timeline as Partial<Pick<AgentTimelineService, 'setImportedEntriesProvider'>>;
  timeline.setImportedEntriesProvider?.(() => reader.read().entries);
  context.subscriptions.push({
    dispose: () => {
      timeline.setImportedEntriesProvider?.(null);
      setOpenHandsEvidenceKeys(null);
      reader.dispose();
      keys.dispose();
    },
  });
}
