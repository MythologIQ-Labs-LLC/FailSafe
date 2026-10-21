// B340 (plan-b340-enforce-approval): shared fixtures for the intent-decision suites.
//
// A real IntentService on a temp workspace, a real anchored SOA ledger (ledgerTestKit), and an
// EnforcementEngine built the way production builds it. The new B340 modules are loaded at run
// time, so these suites compile against code that does not have them yet (the red stage) and fail
// there on an assertion that names what is missing.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { EnforcementEngine } from '../../governance/EnforcementEngine';
import { IntentService } from '../../governance/IntentService';
import { IntentHistoryLog } from '../../governance/IntentHistoryLog';
import { SessionManager } from '../../governance/SessionManager';
import type { Intent, IntentHistoryEntry, Verdict } from '../../governance/types/IntentTypes';
import type { IConfigProvider } from '../../core/interfaces/IConfigProvider';
import type { INotificationService } from '../../core/interfaces/INotificationService';
import type { FailSafeConfig } from '../../shared/types';
import type { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import type { SoaLedgerRow } from '../../qorelogic/ledger/LedgerSeal';
import { makeEnv, openLedger, rawRows, type Env } from '../qorelogic/ledgerTestKit';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
function load(rel: string): any {
  try { return require(rel); } catch { return {}; }
}
export const decisionModule = (): any => load('../../governance/intentDecision');
export const commandModule = (): any => load('../../extension/intentDecisionCommand');
export const providerModule = (): any => load('../../governance/enforcedIntentProvider');

export const DECIDED = 'INTENT_DECIDED';
export const DECISION_DID = 'did:myth:failsafe:intent-decision';

export function configFor(modeRef: { value: string }): IConfigProvider {
  return {
    getConfig: () => ({ governance: { mode: modeRef.value } } as unknown as FailSafeConfig),
    getWorkspaceRoot: () => undefined,
    getFailSafeDir: () => '',
    getLedgerPath: () => '',
    getFeedbackDir: () => '',
    getSentinelConfigPath: () => '',
    onConfigChange: () => () => undefined,
  };
}

export const quietNotifications: INotificationService = {
  showInfo: async () => undefined,
  showWarning: async () => undefined,
  showError: async () => undefined,
  showProgress: async <T>(_t: string, task: (r: (m: string) => void) => Promise<T>) => task(() => undefined),
};

export interface Confirmer {
  requests: Array<{ title: string; detail: string; approveLabel: string }>;
  answer: 'approved' | 'declined' | 'busy' | 'hang';
  fn: (req: { title: string; detail: string; approveLabel: string }) => Promise<'approved' | 'declined' | 'busy'>;
}

export function confirmer(answer: Confirmer['answer'] = 'approved'): Confirmer {
  const c: Confirmer = {
    requests: [], answer,
    fn: (req) => {
      c.requests.push(req);
      if (c.answer === 'hang') return new Promise(() => undefined);
      return Promise.resolve(c.answer);
    },
  };
  return c;
}

export interface Harness {
  env: Env;
  root: string;
  ledger: LedgerManager;
  svc: IntentService;
  mode: { value: string };
  engine: EnforcementEngine;
  intent: Intent;
  confirm: Confirmer;
  infos: string[];
}

/** The factory when it exists; on code without B340 the raw construction main used (the red stage). */
export function engineFor(svc: IntentService, root: string, mode: { value: string }): EnforcementEngine {
  const factory = providerModule().createEnforcementEngine;
  if (typeof factory === 'function') return factory(svc, root, configFor(mode), quietNotifications);
  const engine = new EnforcementEngine(svc, root, configFor(mode), quietNotifications);
  svc.setGovernanceModeGetter(() => engine.getGovernanceMode());
  return engine;
}

export function wireLedger(svc: IntentService, ledger: unknown): void {
  const set = (svc as any).setLedgerGetter;
  if (typeof set === 'function') set.call(svc, () => ledger);
}

export async function harness(opts: { files?: string[]; mode?: string } = {}): Promise<Harness> {
  const env = makeEnv();
  const root = env.root as string;
  const ledger = await openLedger(env);
  const mode = { value: opts.mode ?? 'enforce' };
  const svc = new IntentService(root, new SessionManager(root));
  const engine = engineFor(svc, root, mode);
  wireLedger(svc, ledger);
  const intent = await svc.createIntent({
    type: 'feature', purpose: 'B340 approval path', planId: 'plan-b340',
    scope: { files: opts.files ?? ['src/a.ts'], modules: [], riskGrade: 'L2' },
    metadata: { author: 'user', tags: [] },
  });
  return { env, root, ledger, svc, mode, engine, intent, confirm: confirmer(), infos: [] };
}

export function close(h: Harness | undefined): void {
  if (!h) return;
  try { h.ledger.close(); } catch { /* already closed */ }
  h.env.cleanup();
}

export async function evaluate(h: Harness, rel = 'src/a.ts', engine: EnforcementEngine = h.engine): Promise<Verdict> {
  return engine.evaluateAction({
    type: 'file_write', targetPath: path.join(h.root, rel), intentId: h.intent.id,
    proposedAt: new Date().toISOString(), proposedBy: 'vscode-user',
  });
}

export function requireCommands(): any {
  const m = commandModule();
  assert.equal(typeof m.runIntentDecisionCommand, 'function', 'B340: runIntentDecisionCommand (failsafe.intent.decide) exists');
  assert.equal(typeof m.runIntentSealCommand, 'function', 'B340: runIntentSealCommand (failsafe.intent.seal) exists');
  return m;
}

export function deps(h: Harness, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workspaceRoot: h.root, intents: h.svc, getLedger: () => h.ledger, confirm: h.confirm.fn, deadlineMs: 2000,
    ui: {
      pickVerdict: async () => (extra.verdict as string | undefined) ?? 'PASS',
      inputNote: async () => (extra.note as string | undefined) ?? '',
      info: (m: string) => { h.infos.push(m); },
    },
    ...extra,
  };
}

export async function decide(h: Harness, verdict: 'PASS' | 'VETO', extra: Record<string, unknown> = {}): Promise<any> {
  const m = requireCommands();
  return m.runIntentDecisionCommand(deps(h, { verdict, ...extra }));
}

export async function seal(h: Harness, extra: Record<string, unknown> = {}): Promise<any> {
  const m = requireCommands();
  return m.runIntentSealCommand(deps(h, extra));
}

export async function enforced(h: Harness, svc: IntentService = h.svc): Promise<any> {
  const fn = (svc as any).getEnforcedActiveIntent;
  assert.equal(typeof fn, 'function', 'B340: IntentService.getEnforcedActiveIntent exists');
  return fn.call(svc);
}

export const manifestDir = (root: string) => path.join(root, '.failsafe', 'manifest');
export const historyFile = (root: string) => path.join(manifestDir(root), 'intent_history.jsonl');
export const intentFile = (root: string) => path.join(manifestDir(root), 'active_intent.json');

export function historyEntries(root: string): IntentHistoryEntry[] {
  const text = fs.readFileSync(historyFile(root), 'utf8').trim();
  return text ? text.split('\n').map((l) => JSON.parse(l) as IntentHistoryEntry) : [];
}

/** Rewrite the history and recompute its unkeyed chain, as any local writer can. */
export function rewriteHistory(root: string, edit: (entries: IntentHistoryEntry[]) => IntentHistoryEntry[]): void {
  const log = new IntentHistoryLog(manifestDir(root));
  let prev = '0'.repeat(64);
  const lines = edit(historyEntries(root)).map((e) => {
    const { entryHash: _drop, ...rest } = e;
    const withPrev = { ...rest, previousHash: prev };
    const entryHash = log.computeEntryHash(withPrev);
    prev = entryHash;
    return JSON.stringify({ ...withPrev, entryHash });
  });
  fs.writeFileSync(historyFile(root), lines.length ? lines.join('\n') + '\n' : '', 'utf8');
}

export const isMirror = (e: IntentHistoryEntry) =>
  e.event === 'STATUS_CHANGED' && !!e.details && typeof (e.details as Record<string, unknown>).decisionId === 'string';

export function editIntentFile(root: string, edit: (intent: Record<string, any>) => void): void {
  const intent = JSON.parse(fs.readFileSync(intentFile(root), 'utf8'));
  edit(intent);
  fs.writeFileSync(intentFile(root), JSON.stringify(intent, null, 2), 'utf8');
}

export function decisionRows(ledger: LedgerManager): SoaLedgerRow[] {
  return rawRows(ledger).filter((r) => r.event_type === DECIDED);
}

/** A second sqlite connection to the ledger file (another process). */
export function attacker<T>(ledgerPath: string, fn: (db: Database.Database) => T): T {
  const db = new Database(ledgerPath);
  try { return fn(db); } finally { db.close(); }
}

export function snapshotFiles(root: string): { intent: string; history: string } {
  return { intent: fs.readFileSync(intentFile(root), 'utf8'), history: fs.readFileSync(historyFile(root), 'utf8') };
}
