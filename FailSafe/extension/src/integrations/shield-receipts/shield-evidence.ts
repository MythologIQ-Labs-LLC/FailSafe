/**
 * shield-evidence — the evidence interfaces and verification steps 6-18 of the
 * SHIELD receipt check (#476). Nothing here can mint a VerifiedShieldReceipt;
 * only shield-receipt-verifier.ts does, after every step here has passed.
 *
 * Order matters: integrity failures of evidence that is present are Rejected
 * and come before the absence of later evidence, which is Neutral. Details name
 * the step and the field; SHAs and digests appear only as 12-character
 * prefixes; no detail carries a path, artifact text or key material.
 */

import { parseRepoSlug } from '../github-checks/github-checks-map';
import { hasEntryHeader, lastSessionSeal } from './ledger-seal';
import { parseQorSidecar, qorPayloadDigest, qorSign, hex64Equal, type QorSidecar } from './qor-provenance';
import type { ShieldPolicy } from './shield-policy';
import type { ShieldReceiptBody } from './shield-receipt';

/** Read-only view of the workspace the verifier trusts for HEAD, repo and ledger. */
export interface ShieldEvidenceSource {
  headSha(): Promise<string | undefined>;
  remoteUrl(): Promise<string | undefined>;
  /** Parent SHAs of a commit ([] for a root commit); undefined for an unknown commit. */
  parents(sha: string): Promise<string[] | undefined>;
  isShallow(): Promise<boolean>;
  /** File text at a commit; undefined when the path is absent there. */
  showAtCommit(sha: string, path: string): Promise<string | undefined>;
  readGateFile(sessionId: string, name: string): Promise<Buffer | undefined>;
  readQorSessionKey(sessionId: string): Promise<Buffer | undefined>;
  readReceipt(sha: string): Promise<string | undefined>;
  writeReceipt(sha: string, text: string): Promise<void>;
}

export interface ReceiptKeyProvider { getKey(): Promise<Buffer | undefined> }

export type ChainState = 'OK' | 'DAMAGED' | 'INCOMPLETE' | 'UNAVAILABLE';
export interface NativeChainStatus { check(commitSha: string, ledgerText: string): Promise<ChainState> }

export type ShieldNeutralReason =
  | 'no-head' | 'no-receipt' | 'receipt-key-unavailable' | 'receipt-key-invalid' | 'no-remote'
  | 'invalid-api-host' | 'unsupported-qor-version' | 'qor-artifact-missing' | 'qor-key-absent'
  | 'receipt-evidence-superseded' | 'shallow-repository' | 'chain-not-ok' | 'evidence-source-error';

export type ShieldRejectReason =
  | 'malformed' | 'signature' | 'commit-mismatch' | 'repo-mismatch' | 'host-mismatch' | 'issued-in-future'
  | 'stale' | 'malformed-time' | 'qor-sidecar-invalid' | 'qor-payload' | 'qor-hmac' | 'artifact-invalid'
  | 'session-mismatch' | 'audit-verdict' | 'risk-grade' | 'substantiate-verdict' | 'target-mismatch'
  | 'issued-before-substantiate' | 'receipt-artifact-mismatch' | 'merge-commit' | 'seal-not-found'
  | 'seal-unparseable' | 'seal-mismatch' | 'not-seal-commit';

export type ShieldFailure =
  | { kind: 'neutral'; reason: ShieldNeutralReason; detail: string }
  | { kind: 'rejected'; reason: ShieldRejectReason; detail: string };

export const neutral = (reason: ShieldNeutralReason, detail: string): ShieldFailure => ({ kind: 'neutral', reason, detail });
export const rejected = (reason: ShieldRejectReason, detail: string): ShieldFailure => ({ kind: 'rejected', reason, detail });
export const short = (hex: string): string => String(hex).slice(0, 12);

export const LEDGER_PATH = 'docs/META_LEDGER.md';
export const SHA40 = /^[0-9a-f]{40}$/;
const ISO_ANY = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

/** Epoch ms of an ISO-8601 instant; undefined unless it parses (utcOnly: Z suffix required). */
export function parseInstant(v: unknown, utcOnly = false): number | undefined {
  if (typeof v !== 'string' || !(utcOnly ? ISO_UTC : ISO_ANY).test(v)) return undefined;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : undefined;
}

/** The lowercased owner/repo of an origin URL; the host is ignored. */
export function repoOf(remoteUrl: string | undefined): string | undefined {
  const slug = remoteUrl ? parseRepoSlug(remoteUrl) : null;
  return slug ? `${slug.owner}/${slug.repo}`.toLowerCase() : undefined;
}

export interface QorArtifact { raw: Buffer; digest: string; json: Record<string, unknown> }
export interface LoadedArtifacts { audit: QorArtifact; substantiate: QorArtifact }

const PHASES = ['audit', 'substantiate'] as const;

/** Steps 10-14 for both artifacts, step by step across both. */
export async function loadVerifiedArtifacts(src: ShieldEvidenceSource, sessionId: string): Promise<LoadedArtifacts | ShieldFailure> {
  const raw: Record<string, Buffer> = {};
  const side: Record<string, QorSidecar> = {};
  for (const name of ['audit.json', 'audit.provenance', 'substantiate.json', 'substantiate.provenance']) {
    const b = await src.readGateFile(sessionId, name);
    if (!b) return neutral('qor-artifact-missing', `step 10: ${name} absent`);
    raw[name] = b;
  }
  for (const phase of PHASES) {
    const s = parseQorSidecar(raw[`${phase}.provenance`].toString('utf8'), { sessionId, phase });
    if (!s) return rejected('qor-sidecar-invalid', `step 11: ${phase}.provenance is not a valid sidecar for this session and phase`);
    side[phase] = s;
  }
  for (const phase of PHASES) {
    if (!hex64Equal(qorPayloadDigest(raw[`${phase}.json`]), side[phase].payload_sha256)) {
      return rejected('qor-payload', `step 12: ${phase}.json digest differs from its sidecar`);
    }
  }
  const key = await src.readQorSessionKey(sessionId);
  if (!key) return neutral('qor-key-absent', 'step 13: Qor session key absent');
  for (const phase of PHASES) {
    if (!hex64Equal(qorSign(phase, sessionId, raw[`${phase}.json`], key), side[phase].hmac_tag)) {
      return rejected('qor-hmac', `step 14: ${phase}.json HMAC differs from its sidecar`);
    }
  }
  const parsed = (phase: string): Record<string, unknown> | undefined => {
    try {
      const j = JSON.parse(raw[`${phase}.json`].toString('utf8'));
      return j && typeof j === 'object' && !Array.isArray(j) ? j : undefined;
    } catch { return undefined; }
  };
  const a = parsed('audit');
  const s = parsed('substantiate');
  if (!a || !s) return rejected('artifact-invalid', 'step 14: a verified artifact is not a JSON object');
  return {
    audit: { raw: raw['audit.json'], digest: side.audit.payload_sha256, json: a },
    substantiate: { raw: raw['substantiate.json'], digest: side.substantiate.payload_sha256, json: s },
  };
}

export const isFailure = (v: unknown): v is ShieldFailure =>
  !!v && typeof v === 'object' && ((v as ShieldFailure).kind === 'neutral' || (v as ShieldFailure).kind === 'rejected');

export interface EvidenceInput {
  src: ShieldEvidenceSource;
  chain: NativeChainStatus;
  policy: ShieldPolicy;
  head: string;
  apiHost: string;
  nowMs: number;
  receipt: ShieldReceiptBody;
}

async function checkBinding(i: EvidenceInput): Promise<ShieldFailure | undefined> {
  const r = i.receipt;
  if (r.commitSha !== i.head) return rejected('commit-mismatch', `step 6: receipt names ${short(r.commitSha)}, HEAD is ${short(i.head)}`);
  const repo = repoOf(await i.src.remoteUrl());
  if (!repo) return neutral('no-remote', 'step 7: origin does not parse to a GitHub owner/repo');
  if (r.repo.toLowerCase() !== repo) return rejected('repo-mismatch', 'step 7: receipt repo differs from origin');
  if (r.apiHost !== i.apiHost.toLowerCase()) return rejected('host-mismatch', 'step 7: receipt apiHost differs from the publish API host');
  return undefined;
}

function checkVersionAndTime(i: EvidenceInput): ShieldFailure | undefined {
  if (i.receipt.qorVersion !== i.policy.pinnedQorVersion) {
    return neutral('unsupported-qor-version', `step 8: receipt qorVersion ${i.receipt.qorVersion} is not the pinned ${i.policy.pinnedQorVersion}`);
  }
  const issued = parseInstant(i.receipt.issuedAt, true);
  if (issued === undefined) return rejected('malformed-time', 'step 9: issuedAt is not an ISO-8601 UTC instant');
  if (issued > i.nowMs + i.policy.clockSkewMs) return rejected('issued-in-future', 'step 9: issuedAt is in the future');
  if (i.nowMs - issued > i.policy.maxReceiptAgeMs) return rejected('stale', 'step 9: receipt is older than the policy maximum');
  return undefined;
}

const versionOf = (j: Record<string, unknown>): unknown =>
  j.ai_provenance && typeof j.ai_provenance === 'object' ? (j.ai_provenance as Record<string, unknown>).version : undefined;

function checkContent(i: EvidenceInput, art: LoadedArtifacts): ShieldFailure | undefined {
  const r = i.receipt;
  const a = art.audit.json;
  const s = art.substantiate.json;
  if (a.session_id !== r.sessionId || s.session_id !== r.sessionId) return rejected('session-mismatch', 'step 16: artifact session_id differs from the receipt');
  if (a.verdict !== 'PASS') return rejected('audit-verdict', `step 16: audit verdict is ${String(a.verdict).slice(0, 16)}, expected PASS`);
  if (typeof a.risk_grade !== 'string' || !i.policy.acceptedRiskGrades.includes(a.risk_grade)) {
    return rejected('risk-grade', `step 16: risk grade ${String(a.risk_grade).slice(0, 8)} is not accepted by policy`);
  }
  if (s.verdict !== 'PASS' || s.reality_matches_promise !== true) return rejected('substantiate-verdict', 'step 16: substantiate is not PASS with reality matching promise');
  if (a.target !== s.plan_path) return rejected('target-mismatch', 'step 16: audit target differs from substantiate plan_path');
  if (versionOf(a) !== i.policy.pinnedQorVersion || versionOf(s) !== i.policy.pinnedQorVersion) {
    return neutral('unsupported-qor-version', `step 16: artifact ai_provenance.version is not the pinned ${i.policy.pinnedQorVersion}`);
  }
  const subTs = parseInstant(s.ts);
  const issued = parseInstant(r.issuedAt, true);
  if (subTs === undefined || issued === undefined) return rejected('malformed-time', 'step 16: substantiate ts is not an ISO-8601 instant');
  if (subTs > issued) return rejected('issued-before-substantiate', 'step 16: substantiate ts is later than issuedAt');
  return checkCopiedFields(r, a, s);
}

function checkCopiedFields(r: ShieldReceiptBody, a: Record<string, unknown>, s: Record<string, unknown>): ShieldFailure | undefined {
  const pairs: Array<[string, unknown, unknown]> = [
    ['audit.verdict', r.audit.verdict, a.verdict],
    ['audit.riskGrade', r.audit.riskGrade, a.risk_grade],
    ['audit.target', r.audit.target, a.target],
    ['substantiate.verdict', r.substantiate.verdict, s.verdict],
    ['substantiate.planPath', r.substantiate.planPath, s.plan_path],
    ['substantiate.merkleSeal', r.substantiate.merkleSeal, s.merkle_seal],
    ['substantiate.ledgerEntry', r.substantiate.ledgerEntry, s.ledger_entry],
  ];
  for (const [field, got, want] of pairs) {
    if (got !== want) return rejected('receipt-artifact-mismatch', `step 16: receipt ${field} differs from the verified artifact`);
  }
  return undefined;
}

async function checkSealCommit(i: EvidenceInput): Promise<{ ledger: string } | ShieldFailure> {
  if (await i.src.isShallow()) return neutral('shallow-repository', 'step 17: shallow repository; parent history is not available');
  const parents = await i.src.parents(i.head);
  if (!parents) return neutral('evidence-source-error', 'step 17: parents of HEAD could not be read');
  if (parents.length > 1) return rejected('merge-commit', 'step 17: a merge commit is never a Seal commit');
  const ledger = (await i.src.showAtCommit(i.head, LEDGER_PATH)) ?? '';
  const parentLedger = parents.length ? (await i.src.showAtCommit(parents[0], LEDGER_PATH)) ?? '' : '';
  const seal = lastSessionSeal(ledger);
  if (seal === null) return rejected('seal-not-found', 'step 17: no SESSION SEAL entry in the ledger at HEAD');
  if (seal === 'unparseable') return rejected('seal-unparseable', 'step 17: the last SESSION SEAL entry labels do not parse');
  const r = i.receipt;
  if (seal.entry !== r.substantiate.ledgerEntry || seal.sessionId !== r.sessionId || seal.chainHash !== r.substantiate.merkleSeal) {
    return rejected('seal-mismatch', `step 17: last seal #${seal.entry} (${short(seal.chainHash)}) differs from the receipt`);
  }
  if (hasEntryHeader(parentLedger, seal.entry)) return rejected('not-seal-commit', `step 17: entry #${seal.entry} already exists at the parent; HEAD is not the Seal commit`);
  return { ledger };
}

/** Steps 6-18. Undefined means every step passed. */
export async function checkEvidence(i: EvidenceInput): Promise<ShieldFailure | undefined> {
  const early = (await checkBinding(i)) ?? checkVersionAndTime(i);
  if (early) return early;
  const art = await loadVerifiedArtifacts(i.src, i.receipt.sessionId);
  if (isFailure(art)) return art;
  if (art.audit.digest !== i.receipt.audit.payloadSha256 || art.substantiate.digest !== i.receipt.substantiate.payloadSha256) {
    return neutral('receipt-evidence-superseded', 'step 15: the artifacts the receipt names have been replaced; issue a new receipt');
  }
  const content = checkContent(i, art);
  if (content) return content;
  const seal = await checkSealCommit(i);
  if (isFailure(seal)) return seal;
  const state = await i.chain.check(i.head, seal.ledger);
  return state === 'OK' ? undefined : neutral('chain-not-ok', `step 18: native ledger chain status is ${state}`);
}
