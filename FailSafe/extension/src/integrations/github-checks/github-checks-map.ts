/**
 * github-checks-map — pure mapping for FailSafe's GitHub Checks integration
 * (#96, v1). Translates a SHIELD verdict into a GitHub Check Run conclusion and
 * builds the Check Runs REST payload. All functions here are pure (no network,
 * no secrets, no fs) so the conclusion mapping is deterministically testable —
 * the core acceptance criterion. The auth token is handled only by the
 * injectable transport (github-checks-client.ts); nothing here ever sees it.
 *
 * First safe slice: a single completed check result for an audit/substantiation
 * verdict. Line-level annotations and PR review comments are deferred.
 */

/** The three SHIELD verdicts FailSafe surfaces at the merge gate. */
export type ShieldVerdict = 'PASS' | 'WARN' | 'VETO';

/** GitHub Check Run conclusions we map onto (subset of the API's enum). */
export type CheckConclusion = 'success' | 'neutral' | 'failure';

/**
 * Deterministic verdict → conclusion mapping.
 *   PASS → success   (merge-safe)
 *   WARN → neutral   (advisory; does not block unless required)
 *   VETO → failure   (blocking)
 * Unknown/garbage verdicts map to `neutral` (fail-safe: never silently report
 * success for an unrecognized state).
 */
export function mapVerdictToConclusion(verdict: string): CheckConclusion {
  switch ((verdict || '').toUpperCase()) {
    case 'PASS': return 'success';
    case 'VETO': return 'failure';
    case 'WARN': return 'neutral';
    default: return 'neutral';
  }
}

/** Parse `owner/repo` from an https or ssh git remote URL. Returns null on
 *  anything that is not a recognizable GitHub remote. */
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

export interface CheckRunInput {
  verdict: string;
  headSha: string;
  /** Display name for the check (defaults to "FailSafe SHIELD"). */
  name?: string;
  /** Short summary line (no secrets/prompts/content by construction). */
  summary?: string;
  /** Optional link back to the local Command Center. */
  detailsUrl?: string;
}

export interface CheckRunPayload {
  name: string;
  head_sha: string;
  status: 'completed';
  conclusion: CheckConclusion;
  output: { title: string; summary: string };
  details_url?: string;
}

const TITLE: Record<CheckConclusion, string> = {
  success: 'SHIELD: PASS',
  neutral: 'SHIELD: WARN',
  failure: 'SHIELD: VETO',
};

/** Pure builder for the `POST /repos/{owner}/{repo}/check-runs` body. */
export function buildCheckRunPayload(input: CheckRunInput): CheckRunPayload {
  const conclusion = mapVerdictToConclusion(input.verdict);
  const payload: CheckRunPayload = {
    name: input.name?.trim() || 'FailSafe SHIELD',
    head_sha: input.headSha,
    status: 'completed',
    conclusion,
    output: {
      title: TITLE[conclusion],
      summary: input.summary?.trim() || `FailSafe SHIELD verdict: ${(input.verdict || 'UNKNOWN').toUpperCase()}.`,
    },
  };
  if (input.detailsUrl?.trim()) payload.details_url = input.detailsUrl.trim();
  return payload;
}
