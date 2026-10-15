// Fixtures for the #476 SHIELD receipt tests. Artifact field values mirror the
// real #644 session; every sidecar and receipt is signed with a FIXTURE key.
// No real .qor/session/keys file is ever read or copied here.

import { qorPayloadDigest, qorSign } from '../../../integrations/shield-receipts/qor-provenance';
import { signShieldReceipt, type ShieldReceiptBody } from '../../../integrations/shield-receipts/shield-receipt';
import type {
  ChainState, NativeChainStatus, ReceiptKeyProvider, ShieldEvidenceSource,
} from '../../../integrations/shield-receipts/shield-evidence';

export const SESSION = '2026-10-15T0230-8e09f0';
export const SEAL_HASH = '5663eea1488b3b192dd0705e3f72bd91f9cbb882c22cf055c64bc1d0a9fc27f2';
export const QOR_KEY = Buffer.alloc(32, 0x07);
export const RECEIPT_KEY = Buffer.alloc(32, 0x09);
export const NOW = Date.parse('2026-10-15T06:00:00Z');
export const FIXTURE_ROOT = '/fixture/workspace/root';

export const sha = (c: string): string => c.repeat(40).slice(0, 40);
export const PARENT = sha('1');
export const SEAL = sha('2');
export const CODE = sha('3');
export const OTHER = sha('4');

export function sealBlock(entry: number, session = SESSION, chain = SEAL_HASH): string {
  return [
    `### Entry #${entry}: SESSION SEAL - plan-v607-rc1`,
    '',
    '**Timestamp**: 2026-10-15T04:55:00Z',
    '**Phase**: SUBSTANTIATE',
    `**Session**: \`${session}\``,
    `**Content Hash**: \`${'c'.repeat(64)}\``,
    `**Previous Hash**: \`${'d'.repeat(64)}\``,
    `**Chain Hash (Merkle seal)**: \`${chain}\``,
    '',
    '**Decision**: Reality = Promise.',
    '',
  ].join('\n');
}

export const BASE_LEDGER = [
  '# META LEDGER', '',
  '### Entry #642: GATE TRIBUNAL - plan-v607-rc1 (iteration 5) - PASS', '',
  '**Session**: `2026-10-15T0230-8e09f0`', '',
].join('\n');

export function auditArtifact(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phase: 'audit', session_id: SESSION, target: 'plan-v607-rc1.md', verdict: 'PASS',
    report_path: '.agent/staging/AUDIT_REPORT.md', risk_grade: 'L3', findings_categories: [],
    ts: '2026-10-15T03:31:36Z',
    ai_provenance: { system: 'Qor-logic', version: '0.176.1', host: 'claude-code', human_oversight: 'pass', ts: '2026-10-15T03:31:36Z' },
    ...over,
  };
}

export function substantiateArtifact(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phase: 'substantiate', session_id: SESSION, plan_path: 'plan-v607-rc1.md', verdict: 'PASS',
    reality_matches_promise: true, merkle_seal: SEAL_HASH, ledger_entry: 644, disclosures: [],
    ts: '2026-10-15T04:55:47Z',
    ai_provenance: { system: 'Qor-logic', version: '0.176.1', host: 'claude-code', human_oversight: 'pass', ts: '2026-10-15T04:55:47Z' },
    ...over,
  };
}

export interface Commit { parents: string[]; ledger?: string }

export interface Scenario {
  head?: string;
  remote?: string;
  commits: Map<string, Commit>;
  gates: Map<string, Buffer>;
  qorKey?: Buffer;
  receipts: Map<string, string>;
  shallow: boolean;
  reads: number;
  writes: Array<[string, string]>;
  throwOn?: string;
}

export function sidecarFor(phase: string, raw: Buffer, key = QOR_KEY, over: Record<string, unknown> = {}): Buffer {
  const body = {
    alg: 'HMAC-SHA256', hmac_tag: qorSign(phase, SESSION, raw, key),
    payload_sha256: qorPayloadDigest(raw), phase, session_id: SESSION, ...over,
  };
  return Buffer.from(JSON.stringify(body, null, 2));
}

/** Write both artifacts and re-sign both sidecars (payload digest rebuilt). */
export function setArtifacts(s: Scenario, audit = auditArtifact(), substantiate = substantiateArtifact()): void {
  const a = Buffer.from(JSON.stringify(audit, null, 2));
  const b = Buffer.from(JSON.stringify(substantiate, null, 2));
  s.gates.set('audit.json', a);
  s.gates.set('audit.provenance', sidecarFor('audit', a));
  s.gates.set('substantiate.json', b);
  s.gates.set('substantiate.provenance', sidecarFor('substantiate', b));
}

/** A receipt body whose copied fields and digests match the scenario's current artifacts. */
export function receiptBody(s: Scenario, over: Partial<ShieldReceiptBody> = {}): ShieldReceiptBody {
  const audit = JSON.parse(s.gates.get('audit.json')!.toString('utf8'));
  const sub = JSON.parse(s.gates.get('substantiate.json')!.toString('utf8'));
  return {
    schema: 'failsafe.shield-receipt/v1', apiHost: 'api.github.com', repo: 'acme/failsafe',
    commitSha: s.head ?? SEAL, sessionId: SESSION, qorVersion: '0.176.1',
    audit: { verdict: audit.verdict, riskGrade: audit.risk_grade, target: audit.target, payloadSha256: qorPayloadDigest(s.gates.get('audit.json')!) },
    substantiate: {
      verdict: sub.verdict, planPath: sub.plan_path, payloadSha256: qorPayloadDigest(s.gates.get('substantiate.json')!),
      merkleSeal: sub.merkle_seal, ledgerEntry: sub.ledger_entry,
    },
    issuedAt: '2026-10-15T05:00:00.000Z', alg: 'HMAC-SHA256',
    ...over,
  };
}

export function putReceipt(s: Scenario, body: ShieldReceiptBody = receiptBody(s), key = RECEIPT_KEY, sha1 = body.commitSha): void {
  s.receipts.set(sha1, JSON.stringify(signShieldReceipt(body, key), null, 2));
}

/** PARENT (ledger without the seal) <- SEAL (adds #644); HEAD = SEAL; valid receipt for SEAL. */
export function baseScenario(): Scenario {
  const s: Scenario = {
    head: SEAL, remote: 'https://github.com/acme/failsafe.git',
    commits: new Map([
      [PARENT, { parents: [], ledger: BASE_LEDGER }],
      [SEAL, { parents: [PARENT], ledger: BASE_LEDGER + sealBlock(644) }],
    ]),
    gates: new Map(), qorKey: QOR_KEY, receipts: new Map(), shallow: false, reads: 0, writes: [],
  };
  setArtifacts(s);
  putReceipt(s);
  return s;
}

export function sourceOf(s: Scenario): ShieldEvidenceSource {
  const read = <T>(name: string, v: T): T => {
    s.reads += 1;
    if (s.throwOn === name) throw new Error(`fixture failure in ${name} at ${FIXTURE_ROOT}`);
    return v;
  };
  return {
    headSha: async () => read('headSha', s.head),
    remoteUrl: async () => read('remoteUrl', s.remote),
    parents: async (c) => read('parents', s.commits.get(c)?.parents),
    isShallow: async () => read('isShallow', s.shallow),
    showAtCommit: async (c, p) => read('showAtCommit', p === 'docs/META_LEDGER.md' ? s.commits.get(c)?.ledger : undefined),
    readGateFile: async (_sid, name) => read('readGateFile', s.gates.get(name)),
    readQorSessionKey: async () => read('readQorSessionKey', s.qorKey),
    readReceipt: async (c) => read('readReceipt', s.receipts.get(c)),
    writeReceipt: async (c, text) => { read('writeReceipt', undefined); s.writes.push([c, text]); s.receipts.set(c, text); },
  };
}

export const keysOf = (k: Buffer | undefined): ReceiptKeyProvider => ({ getKey: async () => k });
export const chainOf = (state: ChainState): NativeChainStatus => ({ check: async () => state });
