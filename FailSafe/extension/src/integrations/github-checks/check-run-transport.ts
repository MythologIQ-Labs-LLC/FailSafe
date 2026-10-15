/**
 * check-run-transport — the single place FailSafe POSTs a Check Run (#476).
 *
 * Not re-exported by github-checks-client; a source-scan test pins its
 * importers. The caller's payload object is never serialized: toWirePayload
 * reads each field once, accepts only primitive strings of the expected shape,
 * and every guard runs on that fresh copy, which is what gets stringified (so
 * toJSON, getters and Proxies cannot change what is posted).
 *
 * The name set is closed: the publishable names (PUBLISHABLE_CHECKS) with their
 * allowed conclusions, and SHIELD_CHECK_NAME. The SHIELD name may carry
 * `failure` (which can only block), or `success` when the authority is a
 * verifier-minted VerifiedShieldReceipt for exactly this head_sha, repo and API
 * host. Responses count as published only for a 201 whose JSON body carries a
 * positive integer id. Results never contain the token or the response body.
 */

import { isPublishable, isShieldFamilyName, type CheckConclusion, type CheckRunPayload, SHIELD_CHECK_NAME } from './github-checks-map';
import type { GitHubPostFn } from './github-checks-client';
import { isVerifiedShieldReceipt } from '../shield-receipts/shield-receipt-verifier';

/** A payload carrying the reserved SHIELD name; only the verified publisher builds one. */
export interface ShieldCheckRunPayload {
  name: typeof SHIELD_CHECK_NAME;
  head_sha: string;
  status: 'completed';
  conclusion: CheckConclusion;
  output: { title: string; summary: string };
  details_url?: string;
}

export type TransportPayload = CheckRunPayload | ShieldCheckRunPayload;

/** Where the POST goes: repo is `owner/repo`; apiHost must equal baseUrl's hostname. */
export interface CheckRunTarget { repo: string; apiHost: string; baseUrl: string }

export interface TransportResult {
  ok: boolean;
  status?: number;
  checkRunId?: number;
  error?: string;
  /** Fields GitHub echoed back on a confirmed create. */
  echo?: { head_sha?: string; name?: string; conclusion?: string };
}

const CONCLUSIONS: ReadonlySet<string> = new Set(['success', 'neutral', 'failure']);

/**
 * A fresh plain copy of a payload with every field read once and checked as a
 * primitive string; undefined when any field is missing, non-string or of the
 * wrong shape (including a getter that throws).
 */
export function toWirePayload(payload: unknown): TransportPayload | undefined {
  try {
    if (!payload || typeof payload !== 'object') return undefined;
    const p = payload as Record<string, unknown>;
    const name = p.name;
    const headSha = p.head_sha;
    const status = p.status;
    const conclusion = p.conclusion;
    const output = p.output;
    const detailsUrl = p.details_url;
    if (typeof name !== 'string' || typeof headSha !== 'string' || status !== 'completed') return undefined;
    if (typeof conclusion !== 'string' || !CONCLUSIONS.has(conclusion)) return undefined;
    if (!output || typeof output !== 'object') return undefined;
    const title = (output as Record<string, unknown>).title;
    const summary = (output as Record<string, unknown>).summary;
    if (typeof title !== 'string' || typeof summary !== 'string') return undefined;
    if (detailsUrl !== undefined && typeof detailsUrl !== 'string') return undefined;
    const wire = {
      name, head_sha: headSha, status: 'completed', conclusion, output: { title, summary },
      ...(detailsUrl !== undefined ? { details_url: detailsUrl } : {}),
    };
    return wire as TransportPayload;
  } catch {
    return undefined;
  }
}

function nameRefusal(wire: TransportPayload, target: CheckRunTarget, authority: unknown): string | undefined {
  if (wire.name !== SHIELD_CHECK_NAME) {
    if (isShieldFamilyName(wire.name) || !isPublishable(wire.name, wire.conclusion)) return 'check run refused: name and conclusion are not publishable';
    return undefined;
  }
  if (wire.conclusion === 'failure') return undefined;
  if (wire.conclusion !== 'success' || !isVerifiedShieldReceipt(authority)) return 'SHIELD check refused: no verified receipt authority';
  if (wire.head_sha !== authority.commitSha) return 'SHIELD check refused: head_sha is not the verified commit';
  if (target.repo.toLowerCase() !== authority.repo || target.apiHost.toLowerCase() !== authority.apiHost) {
    return 'SHIELD check refused: target is not the verified repository and API host';
  }
  return undefined;
}

function targetError(target: CheckRunTarget): string | undefined {
  try {
    if (new URL(target.baseUrl).hostname.toLowerCase() !== target.apiHost.toLowerCase()) return 'check run target host mismatch';
  } catch {
    return 'invalid GitHub API base URL';
  }
  return /^[^/\s]+\/[^/\s]+$/.test(target.repo) ? undefined : 'invalid check run target repo';
}

function readConfirmed(body: string): TransportResult['echo'] & { id: number } | undefined {
  let j: unknown;
  try { j = JSON.parse(body); } catch { return undefined; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return undefined;
  const o = j as Record<string, unknown>;
  if (typeof o.id !== 'number' || !Number.isSafeInteger(o.id) || o.id <= 0) return undefined;
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  return { id: o.id, head_sha: str(o.head_sha), name: str(o.name), conclusion: str(o.conclusion) };
}

function interpret(res: { status: number; body: string }): TransportResult {
  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: res.status, error: 'GitHub auth failed — check the token / Checks write permission.' };
  }
  if (res.status === 422) {
    return { ok: false, status: 422, error: 'GitHub rejected the check run (422) — head_sha or repo invalid.' };
  }
  if (res.status < 200 || res.status >= 300) {
    return { ok: false, status: res.status, error: `GitHub returned HTTP ${res.status}.` };
  }
  const confirmed = res.status === 201 ? readConfirmed(res.body) : undefined;
  if (!confirmed) return { ok: false, status: res.status, error: 'unconfirmed GitHub response' };
  const { id, ...echo } = confirmed;
  return { ok: true, status: res.status, checkRunId: id, echo };
}

/** POST one Check Run. Non-throwing; the token rides only the Authorization
 *  header. Only the checked wire copy is serialized. `authority` is consulted
 *  only for a SHIELD success. */
export async function postCheckRun(
  payload: TransportPayload,
  target: CheckRunTarget,
  token: string,
  post: GitHubPostFn,
  authority?: unknown,
): Promise<TransportResult> {
  const wire = toWirePayload(payload);
  if (!wire) return { ok: false, error: 'check run refused: malformed payload' };
  const refused = targetError(target) ?? nameRefusal(wire, target, authority);
  if (refused) return { ok: false, error: refused };
  const url = `${target.baseUrl.replace(/\/$/, '')}/repos/${target.repo}/check-runs`;
  try {
    const res = await post(
      url,
      {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        Authorization: `token ${token}`,
        'User-Agent': 'FailSafe',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      JSON.stringify(wire),
    );
    return interpret(res);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
