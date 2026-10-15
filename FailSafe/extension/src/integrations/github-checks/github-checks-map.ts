/**
 * github-checks-map — pure mapping for FailSafe's GitHub Checks integration
 * (#96, v1). Builds Check Run payloads and owns the publish contract. All
 * functions here are pure (no network, no secrets, no fs). The auth token is
 * handled only by the injectable transport; nothing here ever sees it.
 *
 * #476: the generic publisher posts only the (name, conclusion) pairs in
 * PUBLISHABLE_CHECKS. The SHIELD check name is not publishable through it at
 * all; only the verified publisher (shield-check-publish.ts) can post it, and
 * only from a verified, commit-bound receipt.
 */

/** GitHub Check Run conclusions we map onto (subset of the API's enum). */
export type CheckConclusion = 'success' | 'neutral' | 'failure';

/** Check names the generic publisher may post. */
export type PublishableCheckName = 'FailSafe: PR Linkage' | 'FailSafe Manual Advisory';

/** The required-check name, reserved for the verified publisher (#476). */
export const SHIELD_CHECK_NAME = 'FailSafe SHIELD' as const;

const ALLOWED: ReadonlyMap<string, ReadonlySet<CheckConclusion>> = new Map<string, ReadonlySet<CheckConclusion>>([
  ['FailSafe: PR Linkage', new Set<CheckConclusion>(['success', 'neutral', 'failure'])],
  ['FailSafe Manual Advisory', new Set<CheckConclusion>(['neutral'])],
]);

/** Read-only view of the allowlist. The guard reads a private copy, so mutating
 *  this view cannot widen what is publishable. */
export const PUBLISHABLE_CHECKS: ReadonlyMap<PublishableCheckName, ReadonlySet<CheckConclusion>> = Object.freeze(
  new Map([...ALLOWED].map(([k, v]) => [k as PublishableCheckName, Object.freeze(new Set(v))])),
);

/** Own-entry lookup only (Map.has / Set.has), so inherited keys never match. */
export function isPublishable(name: unknown, conclusion: unknown): boolean {
  if (typeof name !== 'string' || typeof conclusion !== 'string') return false;
  const allowed = ALLOWED.get(name);
  return allowed !== undefined && allowed.has(conclusion as CheckConclusion);
}

/** True for any name that normalizes to contain "shield" (NFKC, lowercased,
 *  every character outside [a-z0-9] removed). */
export function isShieldFamilyName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return name.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '').includes('shield');
}

/** Parse `owner/repo` from an https or ssh git remote URL. Returns null on
 *  anything that is not a recognizable GitHub remote. The host is ignored. */
export function parseRepoSlug(remoteUrl: string): { owner: string; repo: string } | null {
  if (typeof remoteUrl !== 'string' || !remoteUrl.trim()) return null;
  const s = remoteUrl.trim();
  // git@github.com:owner/repo.git  |  ssh://git@github.com/owner/repo.git
  // https://github.com/owner/repo(.git)  |  https://x-access-token:TOKEN@github.com/owner/repo.git
  const m = /(?:[:/])([^/:\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(s);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  if (!owner || !repo || owner.includes('@')) return null;
  return { owner, repo };
}

export interface CheckRunPayload {
  name: PublishableCheckName;
  head_sha: string;
  status: 'completed';
  conclusion: CheckConclusion;
  output: { title: string; summary: string };
  details_url?: string;
}

/**
 * Build a deliberately non-authoritative operator advisory. No native Qor
 * verdict is consulted here, so this must never publish under the required
 * SHIELD check name or with a GitHub success conclusion (#476).
 */
export function buildManualAdvisoryPayload(headSha: string): CheckRunPayload {
  return {
    name: 'FailSafe Manual Advisory',
    head_sha: headSha,
    status: 'completed',
    conclusion: 'neutral',
    output: {
      title: 'Manual advisory (not a verified SHIELD gate)',
      summary: 'Operator-published notice only. No independent Qor audit, substantiation, or merge approval is attested.',
    },
  };
}
