/**
 * openhands-import-command — `FailSafe: Import OpenHands Run (observe)` (#105,
 * #477). The operator picks an exported run; FailSafe maps its events
 * (observe-only, version-gated), asks for confirmation and, only then, saves
 * them as signed historical timeline evidence (openhands-import.ts). This is a
 * record of a past run: nothing is executed and no live run is intercepted.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { observeOpenHandsRun } from '../integrations/agent-observe/openhands-observer';
import { persistOpenHandsObservations, type OpenHandsImportResult } from '../integrations/agent-observe/openhands-import';
import { getOpenHandsEvidenceKeys, SECRET_STORAGE_REFUSAL, type EvidenceKeyHolder } from '../integrations/agent-observe/openhands-signing';
import { healthFromOpenHandsImport, type OpenHandsImportHealth } from '../integrations/agent-observe/agent-observe-health';
import { recordIntegrationHealth } from '../integrations/catalog/integration-health';

export const MAX_EXPORT_BYTES = 20 * 1024 * 1024;
export const MAX_EXPORT_EVENTS = 10_000;

export interface OpenHandsImportUi {
  pickFile(): Promise<string | undefined>;
  confirm(message: string, detail: string): Promise<boolean>;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface OpenHandsImportDeps {
  workspaceRoot: string;
  enabled: boolean;
  /** `failsafe.integrations.openhands.version`, used only when the export declares none. */
  settingVersion?: string;
  ui: OpenHandsImportUi;
  keys: EvidenceKeyHolder | null;
  fsx?: { statSync(p: string): { size: number }; readFileSync(p: string): Buffer };
  now?: () => Date;
}

export type OpenHandsImportOutcome =
  | { kind: 'imported'; result: OpenHandsImportResult }
  | { kind: 'refused' | 'dismissed' | 'unreadable' | 'unsupported-version' | 'storage' };

function finish(health: OpenHandsImportHealth, outcome: OpenHandsImportOutcome): OpenHandsImportOutcome {
  recordIntegrationHealth('openhands', ...healthFromOpenHandsImport(health));
  return outcome;
}

export async function runOpenHandsImport(deps: OpenHandsImportDeps): Promise<OpenHandsImportOutcome | undefined> {
  const { ui } = deps;
  if (!deps.enabled) {
    ui.warn('OpenHands observer is disabled. Enable `failsafe.integrations.openhands.enabled`.');
    return undefined;
  }
  const file = await ui.pickFile();
  if (!file) return undefined;
  const fsx = deps.fsx ?? fs;

  let bytes: Buffer;
  try {
    if (fsx.statSync(file).size > MAX_EXPORT_BYTES) {
      ui.warn(`OpenHands import refused: the export is larger than ${MAX_EXPORT_BYTES / 1024 / 1024} MB. Nothing was written.`);
      return { kind: 'refused' };
    }
    bytes = fsx.readFileSync(file);
  } catch (e) {
    ui.error(`OpenHands import: cannot read the file: ${e instanceof Error ? e.message : String(e)}`);
    return finish({ kind: 'unreadable' }, { kind: 'unreadable' });
  }
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch (e) {
    ui.error(`OpenHands import: the file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return finish({ kind: 'unreadable' }, { kind: 'unreadable' });
  }
  // A bare events array or a { version, events } envelope.
  const env = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  const events = env && Array.isArray(env.events) ? env.events : parsed;
  const exportVersion = env && typeof env.version === 'string' ? env.version : undefined;
  const version = exportVersion ?? (deps.settingVersion || undefined);

  const observed = observeOpenHandsRun(events, version);
  if (!observed.supported) {
    ui.warn(`OpenHands import: ${observed.degraded} Nothing was written.`);
    return finish({ kind: 'unsupported-version' }, { kind: 'unsupported-version' });
  }
  if (observed.records.length > MAX_EXPORT_EVENTS) {
    ui.warn(`OpenHands import refused: the export has ${observed.records.length} events; the limit is ${MAX_EXPORT_EVENTS}. Nothing was written.`);
    return { kind: 'refused' };
  }
  const high = observed.records.filter((r) => r.riskHint === 'high').length;
  const ok = await ui.confirm(
    `Import ${observed.records.length} events (${high} high-risk) from ${path.basename(file)} as historical evidence?`,
    'This records a past run; it is not live enforcement. Each event keeps only its kind, tool name, risk hint and time. '
      + 'The events are saved in this workspace (.failsafe/logs/openhands-imports.jsonl), signed for this install, and the transparency log gets one summary line.',
  );
  if (!ok) return finish({ kind: 'dismissed' }, { kind: 'dismissed' });
  if (!deps.keys) {
    ui.error(`OpenHands import NOT saved: ${SECRET_STORAGE_REFUSAL}.`);
    return finish({ kind: 'storage' }, { kind: 'storage' });
  }

  let result: OpenHandsImportResult;
  try {
    result = await persistOpenHandsObservations(deps.workspaceRoot, file, bytes, observed.records, { keys: deps.keys, now: deps.now });
  } catch (error) {
    ui.error(`OpenHands import NOT saved: ${error instanceof Error ? error.message : String(error)}`);
    return finish({ kind: 'storage' }, { kind: 'storage' });
  }
  const notes = [
    result.unverified ? `${result.unverified} records in this file could not be verified and were ignored.` : '',
    result.summaryWritten ? '' : 'The events were saved but the transparency summary line was not.',
  ].filter(Boolean).join(' ');
  ui.info(`OpenHands historical import: saved ${result.imported} event(s), skipped ${result.duplicates} duplicate(s). Not live interception.${notes ? ` ${notes}` : ''}`);
  return finish({ kind: 'imported', versionDeclaredByExport: exportVersion !== undefined }, { kind: 'imported', result });
}

function vscodeOpenHandsUi(): OpenHandsImportUi {
  const IMPORT = 'Import';
  return {
    pickFile: async () => {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Import OpenHands run', filters: { 'OpenHands run (JSON)': ['json'] } });
      return picked?.[0]?.fsPath;
    },
    confirm: async (message, detail) => (await vscode.window.showWarningMessage(message, { modal: true, detail }, IMPORT)) === IMPORT,
    info: (m) => { void vscode.window.showInformationMessage(m); },
    warn: (m) => { void vscode.window.showWarningMessage(m); },
    error: (m) => { void vscode.window.showErrorMessage(m); },
  };
}

/** The registered handler body: settings, the VS Code UI and the installed evidence key. */
export function openHandsImportFromVscode(workspaceRoot: string): Promise<OpenHandsImportOutcome | undefined> {
  const cfg = vscode.workspace.getConfiguration('failsafe');
  return runOpenHandsImport({
    workspaceRoot,
    enabled: cfg.get<boolean>('integrations.openhands.enabled', false),
    settingVersion: cfg.get<string>('integrations.openhands.version', ''),
    ui: vscodeOpenHandsUi(),
    keys: getOpenHandsEvidenceKeys(),
  });
}
