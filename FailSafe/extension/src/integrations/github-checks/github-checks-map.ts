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

/** Exact local Git remote identity; never treat a suffix as repository authority. */
export interface GitRepoIdentity { host: string; owner: string; repo: string }

const REPO_PATH = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/;
const HOST = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i;

/** Parse only complete HTTPS, SSH and scp Git remotes, without URL normalization smuggling. */
export function parseRepoIdentity(remoteUrl: string): GitRepoIdentity | null {
  if (typeof remoteUrl !== 'string') return null;
  const raw = remoteUrl.trim();
  const scp = /^git@([^:\/\s]+):(.+)$/i.exec(raw);
  const match = /^(https|ssh):\/\/([^/?#\\\s]+)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i.exec(raw);
  if (!scp && !match) return null;
  const remotePath = scp ? scp[2] : `${match![3]}/${match![4]}`;
  const parts = REPO_PATH.exec(remotePath);
  if (!parts || ['.', '..'].includes(parts[1]) || ['.', '..'].includes(parts[2])) return null;
  let host = scp?.[1];
  if (!scp) {
    let parsed: URL;
    try { parsed = new URL(raw); } catch { return null; }
    if (parsed.search || parsed.hash || (parsed.protocol === 'ssh:' && (parsed.username !== 'git' || parsed.password))) return null;
    if (parsed.port) return null;
    host = parsed.hostname;
  }
  if (!host || !HOST.test(host) || host.startsWith('.') || host.endsWith('.') || host.includes('..')) return null;
  return { host: host.toLowerCase(), owner: parts[1], repo: parts[2] };
}

/** Legacy slug parser retains its shape but no longer accepts arbitrary URL suffixes. */
export function parseRepoSlug(remoteUrl: string): { owner: string; repo: string } | null {
  const id = parseRepoIdentity(remoteUrl);
  return id ? { owner: id.owner, repo: id.repo } : null;
}

/** Check the actual Git remote host against a configured GitHub API host before any I/O. */
export function bindGitRemote(remoteUrl: string, apiHost: string, customApiBase: boolean): GitRepoIdentity | null {
  const id = parseRepoIdentity(remoteUrl);
  if (!id) return null;
  if (apiHost.toLowerCase() === 'api.github.com') return id.host === 'github.com' ? id : null;
  if (!customApiBase || ['github.com', 'api.github.com'].includes(id.host)) return null;
  return id.host === apiHost.toLowerCase() ? id : null;
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
