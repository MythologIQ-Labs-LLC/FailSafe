// Shared fixtures for the #473 SOA ledger suites: a controllable secret store,
// a stub config provider, and the golden legacy ledger written by the real
// v6.0.5 (v1) and v6.0.6 (v2) writers.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import { genesisKey, workspaceKey } from '../../qorelogic/ledger/LedgerAnchor';
import type { HeadAnchorRecord, WorkspaceBinding } from '../../qorelogic/ledger/LedgerVerifier';
import type { SoaLedgerRow } from '../../qorelogic/ledger/LedgerSeal';
import golden from '../fixtures/soa-ledger-legacy-mixed.golden.json';

export const GOLDEN = golden as unknown as { producedBy: Record<string, string>; ledgerSecret: string; rows: SoaLedgerRow[] };

/** In-memory SecretStorage with failure injection for ledgerAnchor: keys. */
export class StubSecrets {
  readonly map: Map<string, string>;
  rejectStore: (key: string) => boolean = () => false;
  throwGet: (key: string) => boolean = () => false;
  /** When set, get() awaits it before reading. */
  getGate: ((key: string) => Promise<void>) | null = null;
  /** When set, store() awaits it before writing (delay or hang). */
  storeGate: ((key: string) => Promise<void>) | null = null;
  storeCalls: string[] = [];

  /** Pass another stub's map to model two windows sharing one SecretStorage. */
  constructor(secret?: string, shared?: Map<string, string>) {
    this.map = shared ?? new Map<string, string>();
    if (secret) { this.map.set('ledgerSecret', secret); }
  }
  async get(key: string): Promise<string | undefined> {
    if (this.getGate) { await this.getGate(key); }
    if (this.throwGet(key)) { throw new Error('keychain locked'); }
    return this.map.get(key);
  }
  async store(key: string, value: string): Promise<void> {
    this.storeCalls.push(key);
    if (this.storeGate) { await this.storeGate(key); }
    if (this.rejectStore(key)) { throw new Error('keychain write failed'); }
    this.map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  record(genesisHash: string): HeadAnchorRecord | null {
    const raw = this.map.get(genesisKey(genesisHash));
    return raw ? JSON.parse(raw) as HeadAnchorRecord : null;
  }
  binding(root: string): WorkspaceBinding | null {
    const raw = this.map.get(workspaceKey(root));
    return raw ? JSON.parse(raw) as WorkspaceBinding : null;
  }
}

export const isAnchorKey = (key: string) => key.startsWith('ledgerAnchor:');

export interface Env {
  dir: string;
  ledgerPath: string;
  root: string | undefined;
  secrets: StubSecrets;
  cleanup: () => void;
}

export function makeEnv(options: { root?: boolean; secret?: string } = {}): Env {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger473-'));
  const root = options.root === false ? undefined : path.join(dir, 'workspace');
  if (root) { fs.mkdirSync(root, { recursive: true }); }
  return {
    dir,
    ledgerPath: path.join(dir, 'ledger', 'soa_ledger.db'),
    root,
    secrets: new StubSecrets(options.secret),
    // A failed test can leave a handle open on Windows; never let cleanup mask the failure.
    cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* left for the OS temp sweep */ } },
  };
}

export function configFor(ledgerPath: string, root: string | undefined): any {
  return { getLedgerPath: () => ledgerPath, getConfig: () => ({}), getWorkspaceRoot: () => root };
}

export async function openLedger(env: Env, overrides: { ledgerPath?: string; root?: string | null; secrets?: StubSecrets } = {}): Promise<LedgerManager> {
  const root = overrides.root === null ? undefined : (overrides.root ?? env.root);
  const mgr = new LedgerManager((overrides.secrets ?? env.secrets) as any, configFor(overrides.ledgerPath ?? env.ledgerPath, root));
  await mgr.initialize();
  return mgr;
}

/** Write the golden legacy rows into a fresh, migrated ledger file (no anchors touched). */
export async function writeGoldenLedger(ledgerPath: string, mutate?: (rows: SoaLedgerRow[]) => void): Promise<void> {
  const scratch = new LedgerManager(new StubSecrets() as any, configFor(ledgerPath, undefined));
  await scratch.initialize();
  scratch.close();
  const rows = GOLDEN.rows.map((r) => ({ ...r }));
  mutate?.(rows);
  const db = new Database(ledgerPath);
  try {
    db.prepare('DELETE FROM soa_ledger').run();
    const columns = Object.keys(rows[0]);
    const insert = db.prepare(`INSERT INTO soa_ledger (${columns.join(',')}) VALUES (${columns.map((c) => '@' + c).join(',')})`);
    for (const row of rows) { insert.run(row); }
  } finally {
    db.close();
  }
}

export function rawRows(mgr: LedgerManager): SoaLedgerRow[] {
  return mgr.getDatabase().prepare('SELECT * FROM soa_ledger ORDER BY id').all() as SoaLedgerRow[];
}

export function genesisHashOf(mgr: LedgerManager): string {
  return rawRows(mgr)[0].entry_hash;
}

export async function appendN(mgr: LedgerManager, n: number, tag = 'did:t:a'): Promise<void> {
  for (let i = 0; i < n; i++) {
    await mgr.appendEntry({ eventType: 'AUDIT_FAIL', agentDid: tag, verificationResult: 'FAIL', riskGrade: 'L3', agentTrustAtAction: 0.4 });
  }
}

/** Silence the console.error noise of expected failures. */
export function quiet<T>(fn: () => T): T {
  const original = console.error;
  console.error = () => { /* expected */ };
  try { return fn(); } finally { console.error = original; }
}
