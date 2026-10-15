/**
 * shield-check-publish — the only publisher of the `FailSafe SHIELD` Check Run
 * (#476).
 *
 *   Verified -> success, for the receipt's commit, with provenance in the summary.
 *   Rejected -> failure (evidence present but not acceptable; blocks).
 *   Neutral  -> nothing posted. GitHub treats neutral as passing for required
 *               checks, so absent evidence must never appear under this name.
 *
 * Order: config guards before any evidence read; ctx must agree with the
 * evidence source on HEAD and repo; verify; HEAD re-read immediately before the
 * POST; the response must echo the head_sha, name and conclusion sent. The
 * caller owns and disposes the evidence source. A positive check is a local
 * HMAC attestation, not CI-attested.
 */

import { parseRepoSlug, SHIELD_CHECK_NAME } from './github-checks-map';
import { resolveApiBase, type GitContext, type GitHubPostFn, type PublishOptions } from './github-checks-client';
import { postCheckRun, type ShieldCheckRunPayload } from './check-run-transport';
import { DEFAULT_SHIELD_POLICY, type ShieldPolicy } from '../shield-receipts/shield-policy';
import type { NativeChainStatus, ReceiptKeyProvider, ShieldEvidenceSource } from '../shield-receipts/shield-evidence';
import {
  unavailableChainStatus, verifyShieldReceipt, type ShieldVerification, type VerifiedShieldReceipt,
} from '../shield-receipts/shield-receipt-verifier';

export interface ShieldPublication {
  checkRunId: number;
  commitSha: string;
  conclusion: 'success' | 'failure';
  receiptDigest?: string;
}

export type ShieldPublishResult =
  | ({ published: true; recordError?: string; echoMismatch?: string } & ShieldPublication)
  | { published: false; reason: string; detail?: string; status?: number };

export interface ShieldPublishArgs {
  ctx: GitContext;
  opts: PublishOptions;
  post: GitHubPostFn;
  src: ShieldEvidenceSource;
  keys: ReceiptKeyProvider;
  chain?: NativeChainStatus;
  policy?: ShieldPolicy;
  now?: () => number;
  /** Test seam; production callers must not override it (F1 pins this). */
  verify?: typeof verifyShieldReceipt;
  recordPublication?: (p: ShieldPublication) => void | Promise<void>;
}

export type ShieldCheckDecision =
  | { payload: ShieldCheckRunPayload; authority?: VerifiedShieldReceipt }
  | { payload: null; reason: string; detail: string };

function verifiedSummary(r: VerifiedShieldReceipt): string {
  return [
    `Commit: ${r.commitSha}`,
    `Qor session: ${r.sessionId} (seal entry #${r.ledgerEntry})`,
    `Risk grade: ${r.riskGrade}`,
    `Audit artifact sha256: ${r.auditPayloadSha256}`,
    `Substantiate artifact sha256: ${r.substantiatePayloadSha256}`,
    `Merkle seal: ${r.merkleSeal}`,
    `Receipt sha256: ${r.receiptDigest}`,
    'attestation: local HMAC (not CI-attested)',
  ].join('\n');
}

/** Pure mapping from a verification result to what may be posted. */
export function shieldCheckDecision(v: ShieldVerification, headSha: string): ShieldCheckDecision {
  if (v.kind === 'neutral') return { payload: null, reason: v.reason, detail: v.detail };
  if (v.kind === 'rejected') {
    return {
      payload: {
        name: SHIELD_CHECK_NAME, head_sha: headSha, status: 'completed', conclusion: 'failure',
        output: { title: 'SHIELD: evidence rejected', summary: `SHIELD evidence present but not acceptable.\nReason: ${v.reason}\n${v.detail}` },
      },
    };
  }
  return {
    payload: {
      name: SHIELD_CHECK_NAME, head_sha: v.receipt.commitSha, status: 'completed', conclusion: 'success',
      output: { title: 'SHIELD: verified receipt', summary: verifiedSummary(v.receipt) },
    },
    authority: v.receipt,
  };
}

const notPublished = (reason: string, detail?: string, status?: number): ShieldPublishResult =>
  ({ published: false, reason, detail, status });

function configGuard(a: ShieldPublishArgs): ShieldPublishResult | { repo: string; apiHost: string; baseUrl: string } {
  if (!a.opts.enabled) return notPublished('disabled');
  if (!a.opts.token || !a.opts.token.trim()) return notPublished('no-token');
  if (a.ctx.isFork) return notPublished('fork');
  const slug = a.ctx.remoteUrl ? parseRepoSlug(a.ctx.remoteUrl) : null;
  if (!slug) return notPublished('no-remote');
  if (!a.ctx.headSha || !a.ctx.headSha.trim()) return notPublished('no-head');
  const api = resolveApiBase(a.opts.apiBaseUrl);
  if (!api) return notPublished('invalid-api-base-url');
  return { repo: `${slug.owner}/${slug.repo}`, ...api };
}

const sameRepo = (a: string | undefined, b: string | undefined): boolean => {
  const x = a ? parseRepoSlug(a) : null;
  const y = b ? parseRepoSlug(b) : null;
  return !!x && !!y && `${x.owner}/${x.repo}`.toLowerCase() === `${y.owner}/${y.repo}`.toLowerCase();
};

/** Verify the receipt for HEAD and publish the SHIELD Check Run it supports. Never throws. */
export async function publishVerifiedShieldCheck(a: ShieldPublishArgs): Promise<ShieldPublishResult> {
  const target = configGuard(a);
  if ('published' in target) return target;
  const head = a.ctx.headSha ?? '';
  const token = a.opts.token ?? '';
  try {
    if (head !== (await a.src.headSha()) || !sameRepo(a.ctx.remoteUrl, await a.src.remoteUrl())) {
      return notPublished('context-mismatch', 'the command context and the evidence source disagree on HEAD or repo');
    }
    const verify = a.verify ?? verifyShieldReceipt;
    const now = (a.now ?? Date.now)();
    const v = await verify(a.src, a.keys, a.chain ?? unavailableChainStatus, a.policy ?? DEFAULT_SHIELD_POLICY, target.apiHost, now);
    const d = shieldCheckDecision(v, head);
    if (!d.payload) return notPublished(d.reason, d.detail);
    if ((await a.src.headSha()) !== d.payload.head_sha) return notPublished('head-moved', 'HEAD changed after verification');
    const res = await postCheckRun(d.payload, target, token, a.post, d.authority);
    if (!res.ok || res.checkRunId === undefined) {
      const reason = res.status === undefined ? 'transport-refused' : res.status === 201 ? 'unconfirmed-response' : 'github-error';
      return notPublished(reason, res.error, res.status);
    }
    // GitHub confirmed a create (201 + id), so the check run exists even when its
    // echo differs from what was sent: report it as published and flag the
    // mismatch, because "not published" would invite a duplicate on retry.
    const e = res.echo ?? {};
    const echoMismatch = e.head_sha !== d.payload.head_sha || e.name !== d.payload.name || e.conclusion !== d.payload.conclusion
      ? 'GitHub echoed a different head_sha, name or conclusion than was sent'
      : undefined;
    const pub: ShieldPublication = {
      checkRunId: res.checkRunId, commitSha: d.payload.head_sha,
      conclusion: d.payload.conclusion as 'success' | 'failure', receiptDigest: d.authority?.receiptDigest,
    };
    // The check run exists once GitHub confirmed it; a failed local record must
    // not report "not published" (a retry would post a duplicate).
    const flags = echoMismatch ? { echoMismatch } : {};
    try {
      await a.recordPublication?.(pub);
    } catch {
      return { published: true, ...pub, ...flags, recordError: 'the publication record could not be written' };
    }
    return { published: true, ...pub, ...flags };
  } catch {
    return notPublished('evidence-source-error', 'an evidence read or the publication record failed');
  }
}
