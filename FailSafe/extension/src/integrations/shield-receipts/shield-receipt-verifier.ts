/**
 * shield-receipt-verifier — verifies and issues FailSafe SHIELD receipts (#476).
 *
 * verifyShieldReceipt returns Verified only when every step 1-18 passes:
 * receipt present, well formed and signed (1-5); bound to HEAD, origin and API
 * host (6-7); pinned Qor version and fresh (8-9); Qor artifacts present and
 * HMAC-verified (10-14) and still the ones the receipt names (15); PASS content
 * that agrees with every copied receipt field (16); HEAD is the single-parent
 * Seal commit of that session's seal (17); native chain status OK (18).
 *
 * The VerifiedShieldReceipt is minted only here and recorded in a module-private
 * WeakSet, so isVerifiedShieldReceipt refuses casts, spreads and JSON clones.
 * The default chain status is UNAVAILABLE: until a native ledger verifier is
 * wired in, success is unreachable in production by design.
 */

import { DEFAULT_SHIELD_POLICY, type ShieldPolicy } from './shield-policy';
import {
  checkEvidence, isFailure, loadVerifiedArtifacts, neutral, rejected, repoOf, SHA40, LEDGER_PATH,
  type LoadedArtifacts, type NativeChainStatus, type ReceiptKeyProvider, type ShieldEvidenceSource, type ShieldFailure,
} from './shield-evidence';
import { lastSessionSeal } from './ledger-seal';
import {
  isValidApiHost, parseShieldReceipt, receiptDigest, signShieldReceipt, verifyShieldReceiptSignature,
  SHIELD_RECEIPT_SCHEMA, type ShieldReceipt, type ShieldReceiptBody,
} from './shield-receipt';

export interface VerifiedShieldReceipt {
  readonly commitSha: string;
  readonly repo: string;
  readonly apiHost: string;
  readonly sessionId: string;
  readonly riskGrade: string;
  readonly auditPayloadSha256: string;
  readonly substantiatePayloadSha256: string;
  readonly merkleSeal: string;
  readonly ledgerEntry: number;
  readonly receiptDigest: string;
}

export type ShieldVerification = { kind: 'verified'; receipt: VerifiedShieldReceipt } | ShieldFailure;
export type ShieldIssueResult = { kind: 'issued'; commitSha: string; receiptDigest: string } | ShieldFailure;

export const unavailableChainStatus: NativeChainStatus = Object.freeze({ check: async () => 'UNAVAILABLE' as const });

const MINTED = new WeakSet<object>();

export function isVerifiedShieldReceipt(x: unknown): x is VerifiedShieldReceipt {
  return typeof x === 'object' && x !== null && MINTED.has(x);
}

function mint(r: ShieldReceipt): VerifiedShieldReceipt {
  const v: VerifiedShieldReceipt = Object.freeze({
    commitSha: r.commitSha, repo: r.repo, apiHost: r.apiHost, sessionId: r.sessionId,
    riskGrade: r.audit.riskGrade, auditPayloadSha256: r.audit.payloadSha256,
    substantiatePayloadSha256: r.substantiate.payloadSha256, merkleSeal: r.substantiate.merkleSeal,
    ledgerEntry: r.substantiate.ledgerEntry, receiptDigest: receiptDigest(r),
  });
  MINTED.add(v);
  return v;
}

async function receiptKey(keys: ReceiptKeyProvider): Promise<Buffer | ShieldFailure> {
  const key = await keys.getKey();
  if (!key) return neutral('receipt-key-unavailable', 'step 4: no receipt key is available');
  if (!Buffer.isBuffer(key) || key.length < 32) return neutral('receipt-key-invalid', 'step 4: the receipt key is shorter than 32 bytes');
  return key;
}

async function headOf(src: ShieldEvidenceSource): Promise<string | undefined> {
  const head = await src.headSha();
  return head && SHA40.test(head) ? head : undefined;
}

async function verifyInner(
  src: ShieldEvidenceSource, keys: ReceiptKeyProvider, chain: NativeChainStatus, policy: ShieldPolicy, apiHost: string, nowMs: number,
): Promise<ShieldVerification> {
  if (!isValidApiHost(apiHost)) return neutral('invalid-api-host', 'the publish API host is not a valid hostname');
  const head = await headOf(src);
  if (!head) return neutral('no-head', 'step 1: HEAD is not a 40-hex commit');
  const text = await src.readReceipt(head);
  if (text === undefined) return neutral('no-receipt', 'step 2: no SHIELD receipt for HEAD');
  const receipt = parseShieldReceipt(text);
  if (!receipt) return rejected('malformed', 'step 3: the receipt does not parse as SHIELD receipt v1');
  const key = await receiptKey(keys);
  if (isFailure(key)) return key;
  if (!verifyShieldReceiptSignature(receipt, key)) return rejected('signature', 'step 5: the receipt signature does not verify');
  const failure = await checkEvidence({ src, chain, policy, head, apiHost, nowMs, receipt });
  return failure ?? { kind: 'verified', receipt: mint(receipt) };
}

/** Verify the receipt for the current HEAD. Never throws: an evidence read that
 *  fails is Neutral evidence-source-error. */
export async function verifyShieldReceipt(
  src: ShieldEvidenceSource,
  keys: ReceiptKeyProvider,
  chain: NativeChainStatus = unavailableChainStatus,
  policy: ShieldPolicy = DEFAULT_SHIELD_POLICY,
  apiHost = 'api.github.com',
  now: number = Date.now(),
): Promise<ShieldVerification> {
  try {
    return await verifyInner(src, keys, chain, policy, apiHost, now);
  } catch {
    return neutral('evidence-source-error', 'an evidence read failed');
  }
}

function bodyFrom(art: LoadedArtifacts, head: string, repo: string, apiHost: string, sessionId: string, nowMs: number): ShieldReceiptBody | ShieldFailure {
  const a = art.audit.json;
  const s = art.substantiate.json;
  const prov = a.ai_provenance as Record<string, unknown> | undefined;
  const strs = [a.verdict, a.risk_grade, a.target, s.verdict, s.plan_path, s.merkle_seal, prov?.version];
  if (strs.some((v) => typeof v !== 'string') || typeof s.ledger_entry !== 'number') {
    return rejected('artifact-invalid', 'issuance: an artifact field needed for the receipt is missing or mistyped');
  }
  return {
    schema: SHIELD_RECEIPT_SCHEMA, apiHost: apiHost.toLowerCase(), repo, commitSha: head, sessionId,
    qorVersion: prov!.version as string,
    audit: { verdict: a.verdict as string, riskGrade: a.risk_grade as string, target: a.target as string, payloadSha256: art.audit.digest },
    substantiate: {
      verdict: s.verdict as string, planPath: s.plan_path as string, payloadSha256: art.substantiate.digest,
      merkleSeal: s.merkle_seal as string, ledgerEntry: s.ledger_entry,
    },
    issuedAt: new Date(nowMs).toISOString(), alg: 'HMAC-SHA256',
  };
}

async function issueInner(
  src: ShieldEvidenceSource, keys: ReceiptKeyProvider, chain: NativeChainStatus, policy: ShieldPolicy, apiHost: string, nowMs: number,
): Promise<ShieldIssueResult> {
  if (!isValidApiHost(apiHost)) return neutral('invalid-api-host', 'the publish API host is not a valid hostname');
  const head = await headOf(src);
  if (!head) return neutral('no-head', 'issuance: HEAD is not a 40-hex commit');
  const key = await receiptKey(keys);
  if (isFailure(key)) return key;
  const repo = repoOf(await src.remoteUrl());
  if (!repo) return neutral('no-remote', 'issuance: origin does not parse to a GitHub owner/repo');
  // The session id is the only value taken from the ledger; every other field
  // comes from the HMAC-verified artifacts, git, or the arguments.
  const seal = lastSessionSeal((await src.showAtCommit(head, LEDGER_PATH)) ?? '');
  if (seal === null) return rejected('seal-not-found', 'issuance: no SESSION SEAL entry in the ledger at HEAD');
  if (seal === 'unparseable') return rejected('seal-unparseable', 'issuance: the last SESSION SEAL entry labels do not parse');
  const art = await loadVerifiedArtifacts(src, seal.sessionId);
  if (isFailure(art)) return art;
  const body = bodyFrom(art, head, repo, apiHost, seal.sessionId, nowMs);
  if (isFailure(body)) return body;
  const failure = await checkEvidence({ src, chain, policy, head, apiHost, nowMs, receipt: body });
  if (failure) return failure;
  const receipt = signShieldReceipt(body, key);
  await src.writeReceipt(head, `${JSON.stringify(receipt, null, 2)}\n`);
  return { kind: 'issued', commitSha: head, receiptDigest: receiptDigest(receipt) };
}

/** Issue a receipt for HEAD when HEAD is the Seal commit of a verified session.
 *  Writes nothing unless every check passes. Never throws. */
export async function issueShieldReceipt(
  src: ShieldEvidenceSource,
  keys: ReceiptKeyProvider,
  chain: NativeChainStatus = unavailableChainStatus,
  policy: ShieldPolicy = DEFAULT_SHIELD_POLICY,
  apiHost = 'api.github.com',
  now: number = Date.now(),
): Promise<ShieldIssueResult> {
  try {
    return await issueInner(src, keys, chain, policy, apiHost, now);
  } catch {
    return neutral('evidence-source-error', 'an evidence read or the receipt write failed');
  }
}
