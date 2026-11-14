/**
 * pr-linkage-publish — the live bridge that finally WIRES the #154 PR-linkage
 * auditor (FX861) to a published Check Run. Composes `runLinkageAudit` (fetch PR
 * body + open issues) → `buildLinkageCheckRunPayload` → `publishCheckRunPayload`
 * (the generic publish shared with the #96 SHIELD check). Off-by-default + the
 * token only ever rides the Authorization header. Both transports are injected,
 * so the orchestration is unit-tested with NO live network.
 */

import { runLinkageAudit, buildLinkageCheckRunPayload } from './pr-linkage-audit';
import { bindGitRemote } from './github-checks-map';
import { apiBaseFor } from './github-host-affinity';
import {
  publishCheckRunPayload,
  type GitContext, type PublishOptions, type GitHubPostFn, type GitHubGetFn, type PublishCheckResult,
} from './github-checks-client';

export interface LinkagePublishArgs {
  ctx: GitContext;
  opts: PublishOptions;
  owner: string;
  repo: string;
  prNumber: number;
  get: GitHubGetFn;
  post: GitHubPostFn;
  /** Host-owned fresh read immediately before POST; absent evidence is a refusal. */
  freshContext: () => Promise<GitContext>;
}

/**
 * Run the PR-linkage audit and publish the result as a second Check Run beside
 * the SHIELD verdict. Disabled / no token ⇒ localOnly (no network). A failed
 * audit (fetch/parse) returns `{ ok: false }`, never throws.
 */
function linkagePreflight(args: LinkagePublishArgs): PublishCheckResult | null {
  if (!args.opts.enabled || !args.opts.token?.trim()) {
    return { ok: true, localOnly: true, error: 'integration disabled' };
  }
  if (args.ctx.isFork) return { ok: true, localOnly: true, error: 'fork PR context — local-only' };
  if (!args.ctx.headSha?.trim() || !args.ctx.remoteUrl) {
    return { ok: false, error: 'Git context is missing a remote or HEAD' };
  }
  const api = apiBaseFor(args.opts.apiBaseUrl);
  if (!api.ok) return { ok: false, error: api.error };
  const id = bindGitRemote(args.ctx.remoteUrl, api.base.apiHost, !!args.opts.apiBaseUrl?.trim());
  if (!id) return { ok: false, error: 'Git remote is not bound to the configured GitHub API host' };
  if (args.owner.toLowerCase() !== id.owner.toLowerCase() || args.repo.toLowerCase() !== id.repo.toLowerCase()) {
    return { ok: false, error: 'PR linkage target differs from the authorized Git remote' };
  }
  if (!Number.isSafeInteger(args.prNumber) || args.prNumber <= 0) {
    return { ok: false, error: 'PR linkage number is invalid' };
  }
  return null;
}

export async function publishLinkageCheck(args: LinkagePublishArgs): Promise<PublishCheckResult> {
  const refusal = linkagePreflight(args);
  if (refusal) return refusal;
  const headSha = args.ctx.headSha!.trim();
  const audit = await runLinkageAudit({
    get: args.get, owner: args.owner, repo: args.repo, prNumber: args.prNumber,
    headSha, token: args.opts.token, enabled: true, apiBaseUrl: args.opts.apiBaseUrl,
  });
  if (!audit.ok) return { ok: false, error: audit.error || 'PR linkage audit failed' };
  try {
    const fresh = await args.freshContext();
    if (fresh.isFork || fresh.remoteUrl !== args.ctx.remoteUrl || fresh.headSha !== args.ctx.headSha) {
      return { ok: false, error: 'Git HEAD or origin changed during the linkage audit' };
    }
  } catch {
    return { ok: false, error: 'Git identity could not be rechecked before publishing' };
  }
  const payload = buildLinkageCheckRunPayload(headSha, {
    findings: audit.findings || [], conclusion: audit.conclusion || 'neutral',
  });
  return publishCheckRunPayload(payload, args.ctx, args.opts, args.post);
}
